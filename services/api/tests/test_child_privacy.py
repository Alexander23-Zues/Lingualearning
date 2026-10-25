import pytest
from pydantic import ValidationError

from app.models import ChildTranslationRequest, StudentCreate
from test_api import client_for
from app.models import AccountRole


@pytest.mark.parametrize("field", ["email", "exact_birth_date", "birth_date", "address", "phone_number", "photograph", "photo_url", "pin"])
def test_child_profile_rejects_personal_details(field):
    client, _ = client_for(AccountRole.educator)
    response = client.post("/v1/students", json={"nickname": "Learning Owl", "grade_level": 2, field: "not collected"})
    assert response.status_code == 422


def test_child_avatar_and_preferences_cannot_hide_contact_information():
    with pytest.raises(ValidationError):
        StudentCreate(nickname="Learning Owl", grade_level=2, avatar_key="https://example.invalid/photo.jpg")
    with pytest.raises(ValidationError):
        StudentCreate(nickname="Learning Owl", grade_level=2, preferences={"email": "not-collected@example.invalid"})


def test_student_translation_uses_a_scoped_token_and_rejects_extra_identity_fields():
    with pytest.raises(ValidationError):
        ChildTranslationRequest(student_token="not-a-learning-session", text="Hello", source_language="en", target_language="fil")
    with pytest.raises(ValidationError):
        ChildTranslationRequest(student_token="a" * 64, text="Hello", source_language="en", target_language="fil", email="not-collected@example.invalid")


def test_active_model_does_not_forward_text_without_private_inference_configuration():
    client, gateway = client_for(AccountRole.educator)
    gateway.model = {"version": "fixture-only"}
    response = client.post("/v1/translation", json={"text":"Hello", "source_language":"en", "target_language":"fil"})
    assert response.status_code == 503
    assert response.json()["detail"] == "The private translation service is not configured."
