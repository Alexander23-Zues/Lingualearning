import asyncio
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.gateway import DataGateway
from app.main import create_app
from app.models import AccountRole, AccountStatus, CurrentUser
from app.security import administrator, current_user, educator, get_gateway


ADMIN_ID = UUID("00000000-0000-0000-0000-000000000001")
EDUCATOR_ID = UUID("00000000-0000-0000-0000-000000000002")


class FakeGateway(DataGateway):
    def __init__(self) -> None:
        self.events: set[UUID] = set()
        self.model = None
        self.students = []
        self.submissions = []

    async def profile(self, user_id: str):
        return None

    async def create_resource(self, owner_id, payload):
        return {"id": str(uuid4()), "owner_id": str(owner_id), **payload.model_dump(mode="json")}

    async def sync_session(self, owner_id, event):
        if event.event_id in self.events:
            return "duplicate"
        self.events.add(event.event_id)
        return "synced"

    async def update_educator_status(self, educator_id, status, actor_id, reason):
        return None

    async def active_model(self):
        return self.model

    async def activate_model(self, model_version_id, checksum, actor_id):
        return {"activated": str(model_version_id)}

    async def rollback_model(self, actor_id):
        return {"active": "previous"}

    async def list_students(self, educator_id=None):
        return [student for student in self.students if educator_id is None or student["adult_id"] == str(educator_id)]

    async def create_student(self, educator_id, payload):
        student = {
            "id": str(uuid4()),
            "adult_id": str(educator_id),
            "nickname": payload.nickname,
            "grade_level": payload.grade_level,
            "learning_level": payload.learning_level,
            "preferences": payload.preferences.model_dump(),
            "avatar_key": payload.avatar_key,
            "active": True,
        }
        self.students.append(student)
        return student

    async def unlock_student(self, educator_id, student_id, pin):
        return {"token": "temporary-token", "student": {"id": str(student_id)}}

    async def student_catalog(self, educator_id, token):
        return []

    async def student_history(self, educator_id, token):
        return {"attempts": [], "achievements": []}

    async def submit_student_quiz(self, educator_id, token, payload):
        result = {"attempt_id": str(uuid4()), "correct": 1, "total": 1}
        self.submissions.append(result)
        return result

    async def list_student_submissions(self):
        return self.submissions


def user(role: AccountRole, status: AccountStatus = AccountStatus.active) -> CurrentUser:
    return CurrentUser(
        id=ADMIN_ID if role == AccountRole.administrator else EDUCATOR_ID,
        email=f"{role.value}@example.test",
        name=role.value.title(),
        role=role,
        status=status,
    )


def client_for(role: AccountRole) -> tuple[TestClient, FakeGateway]:
    app = create_app()
    gateway = FakeGateway()
    active_user = user(role)
    app.dependency_overrides[get_gateway] = lambda: gateway
    app.dependency_overrides[current_user] = lambda: active_user

    async def require_admin():
        if active_user.role != AccountRole.administrator:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Administrator access required.")
        return active_user

    async def require_educator():
        if active_user.role != AccountRole.educator:
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Educator access required.")
        return active_user

    app.dependency_overrides[administrator] = require_admin
    app.dependency_overrides[educator] = require_educator
    return TestClient(app), gateway


def test_health_is_public():
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200


def test_educator_creates_only_owned_private_resource():
    client, _ = client_for(AccountRole.educator)
    response = client.post(
        "/v1/resources",
        json={"title": "Word Cards", "resource_type": "activity", "grade_level": 2},
    )
    assert response.status_code == 201
    assert response.json()["owner_id"] == str(EDUCATOR_ID)


def test_administrator_cannot_use_educator_resource_endpoint():
    client, _ = client_for(AccountRole.administrator)
    response = client.post(
        "/v1/resources",
        json={"title": "Word Cards", "resource_type": "activity", "grade_level": 2},
    )
    assert response.status_code == 403


def test_session_sync_is_duplicate_safe():
    client, _ = client_for(AccountRole.educator)
    event_id = str(uuid4())
    payload = {
        "events": [{
            "event_id": event_id,
            "class_label": "Grade 3 - Section A",
            "grade_level": 3,
            "session_date": "2026-10-25",
        }]
    }
    assert client.post("/v1/sessions/sync", json=payload).json()[0]["status"] == "synced"
    assert client.post("/v1/sessions/sync", json=payload).json()[0]["status"] == "duplicate"


def test_missing_model_message_is_exact():
    client, _ = client_for(AccountRole.educator)
    response = client.post(
        "/v1/translation",
        json={"text": "Good morning", "source_language": "en", "target_language": "fil"},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Translation is not available yet. An administrator must activate a trained model."
    )


def test_dataset_review_is_administrator_only():
    client, _ = client_for(AccountRole.educator)
    response = client.post(
        "/v1/admin/datasets/validate",
        files={"file": ("pairs.csv", b"english,filipino\nhello,kumusta\n", "text/csv")},
    )
    assert response.status_code == 403


def test_model_rollback_is_administrator_only():
    educator_client, _ = client_for(AccountRole.educator)
    assert educator_client.post("/v1/admin/models/rollback").status_code == 403
    administrator_client, _ = client_for(AccountRole.administrator)
    assert administrator_client.post("/v1/admin/models/rollback").status_code == 200


def test_educator_can_create_student_record_without_student_account():
    client, gateway = client_for(AccountRole.educator)
    response = client.post(
        "/v1/students",
        json={"nickname": "Star Learner", "grade_level": 3, "avatar_key":"owl", "learning_level":"beginner"},
    )
    assert response.status_code == 201
    assert response.json()["adult_id"] == str(EDUCATOR_ID)
    assert "pin" not in response.json()
    assert len(gateway.students) == 1


def test_student_routes_remain_under_educator_session():
    client, _ = client_for(AccountRole.educator)
    response = client.get(
        "/v1/student-journey/history",
        headers={"X-Student-Session": "temporary-token"},
    )
    assert response.status_code == 200
    assert response.json() == {"attempts": [], "achievements": []}


def test_administrator_validates_duplicates_and_conflicts():
    client, _ = client_for(AccountRole.administrator)
    data = b"english,filipino\nhello,kumusta\nhello,kumusta\nhello,hello\n"
    response = client.post(
        "/v1/admin/datasets/validate",
        files={"file": ("pairs.csv", data, "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["duplicate_rows"] == [3]
    assert response.json()["conflicting_rows"] == [4]


def test_suspended_account_is_denied_before_protected_operation(monkeypatch):
    class AuthResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"id": str(EDUCATOR_ID)}

    class AuthClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, *args, **kwargs):
            return AuthResponse()

    gateway = FakeGateway()

    async def suspended_profile(user_id):
        return user(AccountRole.educator, AccountStatus.suspended)

    gateway.profile = suspended_profile
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: AuthClient())
    settings = Settings(supabase_url="https://example.supabase.co", supabase_publishable_key="publishable")
    with pytest.raises(Exception) as caught:
        asyncio.run(current_user("Bearer valid", settings, gateway))
    assert getattr(caught.value, "status_code", None) == 403
