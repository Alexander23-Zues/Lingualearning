import csv
import io
from typing import Annotated, Any
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .gateway import DataGateway
from .models import (
    CurrentUser,
    DatasetPair,
    DatasetValidationResult,
    EducatorStatusUpdate,
    ModelActivationRequest,
    ResourceCreate,
    SessionSyncRequest,
    SessionSyncResult,
    StudentCreate,
    StudentQuizSubmission,
    StudentRecord,
    StudentUnlock,
    TranslationRequest,
    TranslationResponse,
    ChildTranslationRequest,
)
from .security import administrator, current_user, educator, get_gateway


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        description="Protected workflows for the LinguaKids educator-led learning application.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/v1/me", response_model=CurrentUser, tags=["account"])
    async def me(user: Annotated[CurrentUser, Depends(current_user)]) -> CurrentUser:
        return user

    @app.post("/v1/resources", status_code=201, tags=["resources"])
    async def create_resource(
        payload: ResourceCreate,
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> dict[str, Any]:
        return await gateway.create_resource(user.id, payload)

    @app.post("/v1/sessions/sync", response_model=list[SessionSyncResult], tags=["sessions"])
    async def sync_sessions(
        payload: SessionSyncRequest,
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> list[SessionSyncResult]:
        results = []
        for event in payload.events:
            event_status = await gateway.sync_session(user.id, event)
            results.append(SessionSyncResult(event_id=event.event_id, status=event_status))
        return results

    @app.patch("/v1/admin/educators/{educator_id}/status", status_code=204, tags=["admin"])
    async def set_educator_status(
        educator_id: UUID,
        payload: EducatorStatusUpdate,
        user: Annotated[CurrentUser, Depends(administrator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> None:
        await gateway.update_educator_status(educator_id, payload.status, user.id, payload.reason)

    @app.post("/v1/admin/datasets/validate", response_model=DatasetValidationResult, tags=["datasets"])
    async def validate_dataset(
        user: Annotated[CurrentUser, Depends(administrator)],
        file: UploadFile = File(...),
    ) -> DatasetValidationResult:
        del user
        if file.content_type not in {"text/csv", "application/csv", "application/vnd.ms-excel"}:
            raise HTTPException(status_code=415, detail="Upload a CSV file.")
        raw = await file.read(5_000_001)
        if len(raw) > 5_000_000:
            raise HTTPException(status_code=413, detail="CSV exceeds the 5 MB review limit.")
        try:
            rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
        except UnicodeDecodeError as error:
            raise HTTPException(status_code=422, detail="CSV must use UTF-8 encoding.") from error
        seen_pairs: dict[tuple[str, str], int] = {}
        english_targets: dict[str, str] = {}
        duplicates: list[int] = []
        conflicts: list[int] = []
        errors: list[dict[str, Any]] = []
        valid_count = 0
        for index, row in enumerate(rows, start=2):
            try:
                pair = DatasetPair.model_validate(row)
            except Exception as error:
                errors.append({"row": index, "message": str(error)})
                continue
            normalized = (pair.english.casefold(), pair.filipino.casefold())
            if normalized in seen_pairs:
                duplicates.append(index)
            previous_target = english_targets.get(normalized[0])
            if previous_target is not None and previous_target != normalized[1]:
                conflicts.append(index)
            seen_pairs[normalized] = index
            english_targets[normalized[0]] = normalized[1]
            valid_count += 1
        return DatasetValidationResult(
            valid_count=valid_count,
            duplicate_rows=duplicates,
            conflicting_rows=conflicts,
            errors=errors,
        )

    @app.post("/v1/admin/models/activate", tags=["models"])
    async def activate_model(
        payload: ModelActivationRequest,
        user: Annotated[CurrentUser, Depends(administrator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> dict[str, Any]:
        return await gateway.activate_model(payload.model_version_id, payload.expected_checksum, user.id)

    @app.post("/v1/admin/models/rollback", tags=["models"])
    async def rollback_model(
        user: Annotated[CurrentUser, Depends(administrator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> dict[str, Any]:
        return await gateway.rollback_model(user.id)

    @app.get("/v1/students", response_model=list[StudentRecord], tags=["students"])
    async def list_students(
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> list[dict[str, Any]]:
        return await gateway.list_students(user.id)

    @app.post("/v1/students", response_model=StudentRecord, status_code=201, tags=["students"])
    async def create_student(
        payload: StudentCreate,
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> dict[str, Any]:
        return await gateway.create_student(user.id, payload)

    @app.post("/v1/students/{student_id}/unlock", tags=["students"])
    async def unlock_student(
        student_id: UUID,
        payload: StudentUnlock,
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> dict[str, Any]:
        return await gateway.unlock_student(user.id, student_id, None)

    @app.get("/v1/student-journey/catalog", tags=["students"])
    async def student_catalog(
        x_student_session: Annotated[str, Header()],
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> list[dict[str, Any]]:
        return await gateway.student_catalog(user.id, x_student_session)

    @app.get("/v1/student-journey/history", tags=["students"])
    async def student_history(
        x_student_session: Annotated[str, Header()],
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> dict[str, Any]:
        return await gateway.student_history(user.id, x_student_session)

    @app.post("/v1/student-journey/submit-quiz", tags=["students"])
    async def submit_student_quiz(
        payload: StudentQuizSubmission,
        x_student_session: Annotated[str, Header()],
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> dict[str, Any]:
        return await gateway.submit_student_quiz(user.id, x_student_session, payload)

    @app.get("/v1/admin/student-submissions", tags=["admin", "students"])
    async def student_submissions(
        user: Annotated[CurrentUser, Depends(administrator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> list[dict[str, Any]]:
        del user
        return await gateway.list_student_submissions()

    @app.post("/v1/translation", response_model=TranslationResponse, tags=["translation"])
    async def translate(
        payload: TranslationRequest,
        user: Annotated[CurrentUser, Depends(current_user)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> TranslationResponse:
        del user
        if len(payload.text) > settings.translation_max_characters:
            raise HTTPException(
                status_code=422,
                detail=f"Text must not exceed {settings.translation_max_characters} characters.",
            )
        model = await gateway.active_model()
        if model is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Translation is not available yet. An administrator must activate a trained model.",
            )
        if not settings.inference_shared_secret:
            raise HTTPException(status_code=503, detail="The private translation service is not configured.")
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f"{settings.inference_base_url}/translate",
                    headers={"X-Inference-Key": settings.inference_shared_secret},
                    json={
                        **payload.model_dump(),
                        "model_version": model["version"],
                    },
                )
            response.raise_for_status()
        except (httpx.TimeoutException, httpx.NetworkError) as error:
            raise HTTPException(status_code=503, detail="Translation service is temporarily unavailable.") from error
        except httpx.HTTPStatusError as error:
            raise HTTPException(status_code=502, detail="Translation service rejected the request.") from error
        result = response.json()
        return TranslationResponse(
            translation=result["translation"],
            model_version=model["version"],
        )

    @app.post("/v1/student-translation", response_model=TranslationResponse, tags=["students", "translation"])
    async def student_translate(payload: ChildTranslationRequest, settings: Annotated[Settings, Depends(get_settings)]) -> TranslationResponse:
        if len(payload.text) > settings.translation_max_characters:
            raise HTTPException(status_code=422, detail="Use a sentence of at most 300 characters.")
        if not settings.supabase_url or not settings.supabase_publishable_key:
            raise HTTPException(status_code=503, detail="The learning service is not configured.")
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                state = await client.post(f"{settings.supabase_url}/rest/v1/rpc/student_learning_state",
                    headers={"apikey":settings.supabase_publishable_key,"Content-Type":"application/json"},
                    json={"p_token":payload.student_token})
                if state.status_code != 200:
                    raise HTTPException(status_code=403, detail="Ask an adult to reopen your learning profile.")
                model = state.json().get("active_model")
                if not model:
                    raise HTTPException(status_code=503, detail="Translation is not available yet. An administrator must activate a trained model.")
                if not settings.inference_shared_secret:
                    raise HTTPException(status_code=503, detail="The private translation service is not configured.")
                result = await client.post(f"{settings.inference_base_url}/translate",headers={"X-Inference-Key":settings.inference_shared_secret},
                    json={"text":payload.text,"source_language":payload.source_language,"target_language":payload.target_language,"model_version":model["version"]})
                result.raise_for_status()
                return TranslationResponse(translation=result.json()["translation"],model_version=model["version"])
        except (httpx.TimeoutException,httpx.NetworkError) as error:
            raise HTTPException(status_code=503, detail="Translation is temporarily unavailable.") from error
        except httpx.HTTPStatusError as error:
            raise HTTPException(status_code=502, detail="Translation service could not complete this request.") from error

    return app


app = create_app()
