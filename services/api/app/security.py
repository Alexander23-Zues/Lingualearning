from typing import Annotated

import httpx
from fastapi import Depends, Header, HTTPException, status

from .config import Settings, get_settings
from .gateway import DataGateway, SupabaseGateway
from .models import AccountRole, AccountStatus, CurrentUser


def get_gateway(settings: Annotated[Settings, Depends(get_settings)], authorization: Annotated[str | None, Header()] = None) -> DataGateway:
    token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else None
    return SupabaseGateway(settings, user_token=token)


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
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {token}",
            },
        )
    if response.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is invalid or expired.")
    user_id = response.json().get("id")
    profile = await gateway.profile(user_id)
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
