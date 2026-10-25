from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AccountRole(StrEnum):
    administrator = "administrator"
    educator = "educator"


class AccountStatus(StrEnum):
    active = "active"
    suspended = "suspended"


class CurrentUser(BaseModel):
    id: UUID
    email: str
    name: str
    role: AccountRole
    status: AccountStatus


class TranslationRequest(BaseModel):
    text: str
    source_language: str
    target_language: str

    @field_validator("text")
    @classmethod
    def non_empty_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Text is required.")
        return value

    @model_validator(mode="after")
    def validate_direction(self) -> "TranslationRequest":
        if (self.source_language, self.target_language) not in {
            ("en", "fil"),
            ("fil", "en"),
        }:
            raise ValueError("Only English and Filipino directions are supported.")
        return self


class TranslationResponse(BaseModel):
    translation: str
    model_version: str
    review_required: bool = True


class ChildTranslationRequest(TranslationRequest):
    model_config = ConfigDict(extra="forbid")
    student_token: str = Field(pattern=r"^[a-f0-9]{64}$")


class ResourceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    resource_type: str = Field(min_length=1, max_length=40)
    grade_level: int = Field(ge=1, le=6)
    learning_area_id: UUID | None = None
    mapping_status: str = "supplemental_enrichment"
    content: dict[str, Any] = Field(default_factory=dict)


class SessionSyncItem(BaseModel):
    event_id: UUID
    class_label: str = Field(min_length=1, max_length=120)
    grade_level: int = Field(ge=1, le=6)
    session_date: date
    participant_count: int | None = Field(default=None, ge=0, le=500)
    resource_ids: list[UUID] = Field(default_factory=list)
    competency_ids: list[UUID] = Field(default_factory=list)
    aggregate_results: dict[str, Any] = Field(default_factory=dict)
    observations: str | None = Field(default=None, max_length=5000)


class SessionSyncRequest(BaseModel):
    events: list[SessionSyncItem] = Field(min_length=1, max_length=100)


class SessionSyncResult(BaseModel):
    event_id: UUID
    status: str


class EducatorStatusUpdate(BaseModel):
    status: AccountStatus
    reason: str = Field(min_length=3, max_length=500)


class DatasetPair(BaseModel):
    english: str
    filipino: str
    source: str | None = None
    license: str | None = None
    category: str | None = None
    reviewer_notes: str | None = None

    @field_validator("english", "filipino")
    @classmethod
    def required_parallel_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("English and Filipino text are required.")
        return value


class DatasetValidationResult(BaseModel):
    valid_count: int
    duplicate_rows: list[int]
    conflicting_rows: list[int]
    errors: list[dict[str, Any]]


class ModelActivationRequest(BaseModel):
    model_version_id: UUID
    expected_checksum: str = Field(pattern=r"^[a-fA-F0-9]{64}$")


class StudentPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: Literal["en", "fil", "bilingual"] = "bilingual"
    sound: bool = True
    reduced_motion: bool = False


class StudentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nickname: str = Field(min_length=1, max_length=40)
    grade_level: int = Field(ge=1, le=6)
    avatar_key: Literal["tarsier", "owl", "turtle", "butterfly", "cat", "star"] = "tarsier"
    learning_level: Literal["beginner", "developing", "independent"] = "beginner"
    preferences: StudentPreferences = Field(default_factory=StudentPreferences)

    @field_validator("nickname")
    @classmethod
    def nickname_required(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A nickname is required.")
        return value.strip()


class StudentRecord(BaseModel):
    id: UUID
    adult_id: UUID
    nickname: str
    grade_level: int
    avatar_key: str
    learning_level: str
    preferences: StudentPreferences
    active: bool


class StudentUnlock(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuizAnswerSubmission(BaseModel):
    question_id: UUID
    selected_option_id: UUID


class StudentQuizSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")
    submission_id: UUID
    quiz_id: UUID
    material_version: int = Field(default=1, ge=1)
    answers: list[QuizAnswerSubmission] = Field(min_length=1, max_length=100)


class AuditEvent(BaseModel):
    actor_id: UUID
    action: str
    entity_type: str
    entity_id: UUID | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
