from .runtime_status import checked_model_status
from .offline_transfer import router as offline_transfer_router
from .grade_admissions import router as grade_admissions_router
import csv
import io
import json
from typing import Annotated, Any
from uuid import UUID

import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from .config import Settings, get_settings
from .gateway import DataGateway
from .lesson_import import MAX_LESSON_FILE_BYTES, extract_lesson_text
from .language_check import assert_source_language
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
from .security import administrator, current_user, educator, get_gateway, student_learning_state


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
    from .ai_routes import router as ai_router
    from .ai_body_limit import AiBodyLimit
    app.add_middleware(AiBodyLimit)
    app.include_router(ai_router)
    app.include_router(grade_admissions_router)
    app.include_router(offline_transfer_router)
    from .offline_retry import router as offline_retry_router
    app.include_router(offline_retry_router)
    from .recording_review import router as recording_review_router
    app.include_router(recording_review_router)
    from .dictionary import router as dictionary_router
    app.include_router(dictionary_router)

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
        if payload.grade_level not in user.grade_levels:
            raise HTTPException(403,"This account can use only its assigned grade.")
        return await gateway.create_resource(user.id, payload)

    @app.post("/v1/lessons/import", tags=["resources"])
    async def import_lesson(
        user: Annotated[CurrentUser, Depends(current_user)],
        file: UploadFile = File(...),
    ) -> dict[str, str]:
        try:
            content = await file.read(MAX_LESSON_FILE_BYTES + 1)
            if len(content) > MAX_LESSON_FILE_BYTES:
                raise HTTPException(status_code=413, detail="Choose a file under 2 MB.")
            text = await run_in_threadpool(extract_lesson_text, file.filename or "", content)
            return {"text": text}
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        finally:
            await file.close()

    @app.post("/v1/sessions/sync", response_model=list[SessionSyncResult], tags=["sessions"])
    async def sync_sessions(
        payload: SessionSyncRequest,
        user: Annotated[CurrentUser, Depends(educator)],
        gateway: Annotated[DataGateway, Depends(get_gateway)],
    ) -> list[SessionSyncResult]:
        if any(event.grade_level not in user.grade_levels for event in payload.events):
            raise HTTPException(403,"This account can use only its assigned grade.")
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

    @app.get("/v1/model-status", tags=["system"])
    async def model_status(
        gateway: Annotated[DataGateway, Depends(get_gateway)],
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> dict[str, Any]:
        """Check if translation model is available via path or database."""
        if settings.model_package_path and settings.model_package_path.exists():
            manifest_path = settings.model_package_path / "manifest.json"
            if manifest_path.exists():
                try:
                    with manifest_path.open() as f:
                        manifest = json.load(f)
                    return await checked_model_status(settings,{
                        "available": True,
                        "source": "environment",
                        "version": manifest.get("model_version"),
                    })
                except Exception:
                    pass
        
        model = await gateway.active_model()
        if model:
            return await checked_model_status(settings,{
                "available": True,
                "source": "database",
                "version": model["version"],
                "name": model.get("name"),
            })
        
        return await checked_model_status(settings,{"available": False, "source": None, "version": None})

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
        if payload.grade_level not in user.grade_levels:
            raise HTTPException(403,"This account can use only its assigned grade.")
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
        if len(payload.text) > settings.translation_max_characters:
            raise HTTPException(
                status_code=422,
                detail=f"Text must not exceed {settings.translation_max_characters} characters.",
            )
        
        try:
            await run_in_threadpool(assert_source_language, payload.text, payload.source_language)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        # Check if MODEL_PACKAGE_PATH is set and use it directly
        model = None
        if settings.model_package_path and settings.model_package_path.exists():
            manifest_path = settings.model_package_path / "manifest.json"
            if manifest_path.exists():
                try:
                    with manifest_path.open() as f:
                        manifest = json.load(f)
                    model = {
                        "version": manifest.get("model_version"),
                        "artifact_checksum": None,  # Not needed for direct path usage
                    }
                except Exception:
                    pass  # Fall back to database lookup
        
        # Fall back to database lookup if MODEL_PACKAGE_PATH is not set or invalid
        if model is None:
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
                        "model_checksum": model.get("artifact_checksum"),
                    },
                )
            response.raise_for_status()
        except (httpx.TimeoutException, httpx.NetworkError) as error:
            raise HTTPException(status_code=503, detail="Translation service is temporarily unavailable.") from error
        except httpx.HTTPStatusError as error:
            code=error.response.status_code
            if code in (429,503,504):raise HTTPException(status_code=code,detail="Translation service is busy. Please try again shortly.",headers={"Retry-After":"2"}) from error
            if code==422:raise HTTPException(status_code=422,detail="Use a shorter sentence in the selected language.") from error
            raise HTTPException(status_code=502, detail="Translation service could not complete this request.") from error
        result = response.json()
        if payload.save_history:
            await gateway._request('POST', 'ai_translation_history', json={
                'created_by': str(user.id), 'source_text': payload.text,
                'translation': result['translation'], 'source_language': payload.source_language,
                'target_language': payload.target_language, 'model_version': model['version'],
            })
        return TranslationResponse(
            translation=result["translation"],
            model_version=model["version"],
        )

    @app.post("/v1/student-translation", response_model=TranslationResponse, tags=["students", "translation"])
    async def student_translate(payload: ChildTranslationRequest, settings: Annotated[Settings, Depends(get_settings)]) -> TranslationResponse:
        if len(payload.text) > settings.translation_max_characters:
            raise HTTPException(status_code=422, detail="Use a sentence of at most 300 characters.")
        try:
            await run_in_threadpool(assert_source_language, payload.text, payload.source_language)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        state = await student_learning_state(payload.student_token, settings)
        model = state.get("active_model")
        if model is None and settings.allow_bundled_student_model:
            manifest_path = settings.model_package_path / "manifest.json"
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                model = {"version": manifest["model_version"]}
            except (OSError, ValueError, KeyError):
                pass
        if not model:
            raise HTTPException(status_code=503, detail="Translation is not available yet. An administrator must activate a trained model.")
        if not settings.inference_shared_secret:
            raise HTTPException(status_code=503, detail="The private translation service is not configured.")
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                result = await client.post(f"{settings.inference_base_url}/translate",headers={"X-Inference-Key":settings.inference_shared_secret},
                    json={"text":payload.text,"source_language":payload.source_language,"target_language":payload.target_language,"model_version":model["version"]})
                result.raise_for_status()
                return TranslationResponse(translation=result.json()["translation"],model_version=model["version"])
        except (httpx.TimeoutException,httpx.NetworkError) as error:
            raise HTTPException(status_code=503, detail="Translation is temporarily unavailable.") from error
        except httpx.HTTPStatusError as error:
            code=error.response.status_code
            if code in (429,503,504):raise HTTPException(status_code=code,detail="Translation service is busy. Please try again shortly.",headers={"Retry-After":"2"}) from error
            if code==422:raise HTTPException(status_code=422,detail="Use a shorter sentence in the selected language.") from error
            raise HTTPException(status_code=502, detail="Translation service could not complete this request.") from error

    return app


app = create_app()
