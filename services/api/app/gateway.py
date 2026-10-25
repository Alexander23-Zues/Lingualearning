from typing import Any, Protocol
from uuid import UUID

import httpx

from .config import Settings
from .models import (
    AccountStatus,
    CurrentUser,
    ResourceCreate,
    SessionSyncItem,
    StudentCreate,
    StudentQuizSubmission,
    StudentRecord,
)


class DataGateway(Protocol):
    async def profile(self, user_id: str) -> CurrentUser | None: ...
    async def create_resource(self, owner_id: UUID, payload: ResourceCreate) -> dict[str, Any]: ...
    async def sync_session(self, owner_id: UUID, event: SessionSyncItem) -> str: ...
    async def update_educator_status(
        self, educator_id: UUID, status: AccountStatus, actor_id: UUID, reason: str
    ) -> None: ...
    async def active_model(self) -> dict[str, Any] | None: ...
    async def activate_model(
        self, model_version_id: UUID, checksum: str, actor_id: UUID
    ) -> dict[str, Any]: ...
    async def rollback_model(self, actor_id: UUID) -> dict[str, Any]: ...
    async def list_students(self, educator_id: UUID | None = None) -> list[dict[str, Any]]: ...
    async def create_student(self, educator_id: UUID, payload: StudentCreate) -> dict[str, Any]: ...
    async def unlock_student(self, educator_id: UUID, student_id: UUID, pin: str) -> dict[str, Any]: ...
    async def student_catalog(self, educator_id: UUID, token: str) -> list[dict[str, Any]]: ...
    async def student_history(self, educator_id: UUID, token: str) -> dict[str, Any]: ...
    async def submit_student_quiz(
        self, educator_id: UUID, token: str, payload: StudentQuizSubmission
    ) -> dict[str, Any]: ...
    async def list_student_submissions(self) -> list[dict[str, Any]]: ...


class SupabaseGateway:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None, user_token: str | None = None) -> None:
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=15)
        self.user_token = user_token

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self.settings.supabase_publishable_key if self.user_token else self.settings.supabase_secret_key,
            "Authorization": f"Bearer {self.user_token or self.settings.supabase_secret_key}",
            "Content-Type": "application/json",
        }

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = await self.client.request(
            method,
            f"{self.settings.supabase_url}/rest/v1/{path}",
            headers={**self._headers, **kwargs.pop("headers", {})},
            **kwargs,
        )
        response.raise_for_status()
        return response.json() if response.content else None

    async def profile(self, user_id: str) -> CurrentUser | None:
        rows = await self._request(
            "GET",
            "profiles",
            params={"id": f"eq.{user_id}", "select": "id,email,name,role,status"},
        )
        return CurrentUser.model_validate(rows[0]) if rows else None

    async def create_resource(self, owner_id: UUID, payload: ResourceCreate) -> dict[str, Any]:
        rows = await self._request(
            "POST",
            "resources",
            headers={"Prefer": "return=representation"},
            json={"owner_id": str(owner_id), "visibility": "private", **payload.model_dump(mode="json")},
        )
        return rows[0]

    async def sync_session(self, owner_id: UUID, event: SessionSyncItem) -> str:
        existing = await self._request(
            "GET", "sync_events", params={"event_id": f"eq.{event.event_id}", "select": "event_id"}
        )
        if existing:
            return "duplicate"
        await self._request(
            "POST",
            "rpc/sync_classroom_session",
            json={
                "p_educator_id": str(owner_id),
                "p_event_id": str(event.event_id),
                "p_payload": event.model_dump(mode="json"),
            },
        )
        return "synced"

    async def update_educator_status(
        self, educator_id: UUID, status: AccountStatus, actor_id: UUID, reason: str
    ) -> None:
        await self._request(
            "POST",
            "rpc/admin_update_educator" if self.user_token else "rpc/admin_set_educator_status",
            json=({"p_id":str(educator_id),"p_status":status.value,"p_reason":reason} if self.user_token else {
                "p_educator_id": str(educator_id),
                "p_status": status.value,
                "p_reason": reason,
                "p_actor_id": str(actor_id),
            }),
        )

    async def active_model(self) -> dict[str, Any] | None:
        if self.user_token:
            return await self._request("POST", "rpc/active_learning_model", json={})
        rows = await self._request(
            "GET",
            "model_versions",
            params={"state": "eq.active", "select": "id,name,version,artifact_uri,artifact_checksum"},
        )
        return rows[0] if rows else None

    async def activate_model(
        self, model_version_id: UUID, checksum: str, actor_id: UUID
    ) -> dict[str, Any]:
        if self.user_token:
            return await self._request("POST", "rpc/workspace_model_action", json={"p_id":str(model_version_id),"p_checksum":checksum,"p_rollback":False})
        return await self._request(
            "POST",
            "rpc/activate_model_version",
            json={
                "p_model_version_id": str(model_version_id),
                "p_expected_checksum": checksum,
                "p_actor_id": str(actor_id),
            },
        )

    async def rollback_model(self, actor_id: UUID) -> dict[str, Any]:
        if self.user_token:
            return await self._request("POST", "rpc/workspace_model_action", json={"p_id":None,"p_checksum":"","p_rollback":True})
        return await self._request(
            "POST",
            "rpc/rollback_model_activation",
            json={"p_actor_id": str(actor_id)},
        )

    async def list_students(self, educator_id: UUID | None = None) -> list[dict[str, Any]]:
        params = {"select": "id,adult_id,nickname,grade_level,avatar_key,learning_level,preferences,active", "order": "nickname.asc"}
        if educator_id is not None:
            params["adult_id"] = f"eq.{educator_id}"
        return await self._request("GET", "child_profiles", params=params)

    async def create_student(self, educator_id: UUID, payload: StudentCreate) -> dict[str, Any]:
        child_id = await self._request("POST", "rpc/save_child_profile", json={"p_id": None, "p_data": payload.model_dump(mode="json")})
        rows = await self._request("GET", "child_profiles", params={"id": f"eq.{child_id}", "select": "id,adult_id,nickname,grade_level,avatar_key,learning_level,preferences,active"})
        return rows[0]

    async def unlock_student(self, educator_id: UUID, student_id: UUID, pin: str | None = None) -> dict[str, Any]:
        return await self._request("POST", "rpc/open_child_session", json={"p_child_id": str(student_id)})

    async def _student_state(self, token: str) -> dict[str, Any]:
        return await self._request("POST", "rpc/student_learning_state", json={"p_token": token})

    async def student_catalog(self, educator_id: UUID, token: str) -> list[dict[str, Any]]:
        return (await self._student_state(token))["materials"]

    async def student_history(self, educator_id: UUID, token: str) -> dict[str, Any]:
        state = await self._student_state(token)
        return {key: state[key] for key in ("attempts", "badges", "stars", "completed")}

    async def submit_student_quiz(self, educator_id: UUID, token: str, payload: StudentQuizSubmission) -> dict[str, Any]:
        return await self._request("POST", "rpc/student_complete_material", json={
            "p_token": token, "p_material_id": str(payload.quiz_id), "p_version": payload.material_version,
            "p_submission_id": str(payload.submission_id),
            "p_answers": {str(answer.question_id): str(answer.selected_option_id) for answer in payload.answers},
        })

    async def list_student_submissions(self) -> list[dict[str, Any]]:
        return await self._request("GET", "learning_attempts", params={"select": "*", "order": "completed_at.desc"})
