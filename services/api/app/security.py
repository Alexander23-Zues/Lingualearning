from typing import Annotated, AsyncIterator

import httpx
from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings, supabase_headers
from .gateway import DataGateway, SupabaseGateway
from .models import AccountRole, AccountStatus, CurrentUser


async def get_gateway(settings: Annotated[Settings, Depends(get_settings)], authorization: Annotated[str | None, Header()] = None) -> AsyncIterator[DataGateway]:
    token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else None
    gateway = SupabaseGateway(settings, user_token=token)
    try:
        yield gateway
    finally:
        await gateway.client.aclose()


async def student_learning_state(token: str, settings: Settings) -> dict:
    if len(token) != 64:
        raise HTTPException(403, "Ask an adult to reopen your learning profile.")
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(503, "The learning service is not configured.")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                f"{settings.supabase_url}/rest/v1/rpc/student_learning_state",
                headers=supabase_headers(settings.supabase_publishable_key),
                json={"p_token": token},
            )
        if response.status_code in {401, 403}:
            raise HTTPException(403, "Ask an adult to reopen your learning profile.")
        response.raise_for_status()
        state = response.json()
        if not isinstance(state, dict) or not isinstance(state.get("child"), dict):
            raise ValueError("Invalid learning service response.")
        return state
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(503, "The learning service is temporarily unavailable. Please try again.") from error


async def current_user(
    authorization: Annotated[str | None, Header()] = None,
    settings: Annotated[Settings, Depends(get_settings)] = None,
    gateway: Annotated[DataGateway, Depends(get_gateway)] = None,
) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    token = authorization.removeprefix("Bearer ").strip()
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={
                    "apikey": settings.supabase_publishable_key,
                    "Authorization": f"Bearer {token}",
                },
            )
    except httpx.RequestError as error:
        raise HTTPException(status_code=503, detail='Authentication service is temporarily unavailable.') from error
    if response.status_code == 429 or response.status_code >= 500:
        raise HTTPException(status_code=503, detail='Authentication service is temporarily unavailable.')
    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is invalid or expired.")
    user_id = response.json().get("id")
    try:
        profile = await gateway.profile(user_id)
    except httpx.HTTPError as error:
        raise HTTPException(status_code=503, detail="The account profile service is temporarily unavailable.") from error
    if profile is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account profile is unavailable.")
    if profile.status == AccountStatus.suspended:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This educator account is suspended.")
    return profile


async def administrator(
    user: Annotated[CurrentUser, Depends(current_user)],
) -> CurrentUser:
    if user.role != AccountRole.administrator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required.")
    return user


async def educator(
    user: Annotated[CurrentUser, Depends(current_user)],
) -> CurrentUser:
    if user.role != AccountRole.educator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Educator access required.")
    return user
