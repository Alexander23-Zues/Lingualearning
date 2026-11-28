import asyncio
import hashlib
import json
import logging
import os
import re
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock

repo_root = Path(__file__).resolve().parents[2]
keras_cache_dir = repo_root / ".keras-cache"
keras_cache_dir.mkdir(exist_ok=True)
os.environ.setdefault("KERAS_HOME", str(keras_cache_dir))
os.environ.setdefault("PYTHONNOUSERSITE", "1")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")

from fastapi import FastAPI, Header, HTTPException, File, Form, UploadFile
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


logger = logging.getLogger("linguakids.inference")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    inference_shared_secret: str = ""
    model_package_path: Path = Path("models/active")
    translation_max_characters: int = 300
    inference_concurrency: int = Field(default=1, ge=1, le=4)
    inference_cpu_threads: int = Field(default=2, ge=1, le=8)
    reading_model_path: str = ""
    tts_model_root: Path | None = None
    model_package_root: Path = Path("models/releases")
    inference_timeout_seconds: float = 18


class Request(BaseModel):
    text: str = Field(min_length=1)
    source_language: str
    target_language: str
    model_version: str
    model_checksum: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")

    @model_validator(mode="after")
    def valid_direction(self):
        if (self.source_language, self.target_language) not in {("en", "fil"), ("fil", "en")}:
            raise ValueError("Unsupported language direction.")
        return self


from .translation_requests import TranslationRequests, TranslationBusy
from .translation_runtime import ModelRuntime
from .reading import ReadingRuntime, validate_wav, compare_reading
from .memory import trim_memory


settings = Settings()
runtime: ModelRuntime | None = None
reading_runtime: ReadingRuntime | None = None
speech_runtime = None
semaphore = asyncio.Semaphore(settings.inference_concurrency)
reload_lock = asyncio.Lock()
translation_requests = TranslationRequests()
model_memory_lock = Lock()


def run_model(kind, function, *args):
    if not settings.tts_model_root:
        return function(*args)
    # The bundled voice, reading and translation models share one memory budget.
    with model_memory_lock:
        if kind != 'translation' and runtime is not None:
            runtime.release_model()
        if kind != 'reading' and reading_runtime is not None:
            reading_runtime.release_model()
        if kind != 'speech' and speech_runtime is not None:
            speech_runtime.release_model()
        trim_memory()
        try:
            return function(*args)
        finally:
            trim_memory()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global runtime, reading_runtime, speech_runtime
    if settings.model_package_path.exists() or settings.tts_model_root:
        import torch
        torch.set_num_threads(settings.inference_cpu_threads)
        if settings.tts_model_root:
            torch.backends.nnpack.set_flags(False)
    try:
        runtime = ModelRuntime(settings.model_package_path)
        logger.info("Translation package verified for this worker.")
    except FileNotFoundError:
        runtime = None
        logger.warning("No approved model package is mounted.")
    if settings.reading_model_path:
        try:
            reading_runtime = ReadingRuntime(settings.reading_model_path)
            logger.info(f"Reading recognition model loaded from: {settings.reading_model_path}")
        except (FileNotFoundError, RuntimeError, ImportError, ValueError) as e:
            logger.warning(f"Reading model is unavailable; recording requests will return 503. Error: {e}")
    if settings.tts_model_root:
        from .local_speech import LocalSpeech
        speech_runtime = LocalSpeech(settings.tts_model_root)
    yield
    runtime = None
    reading_runtime = None
    speech_runtime = None


app = FastAPI(title="LinguaKids Translation Inference", version="1.0.0", lifespan=lifespan)

# Add CORS middleware to allow requests from the React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def authenticate(key: str | None) -> None:
    # If no secret is configured, allow all requests (development mode)
    if not settings.inference_shared_secret:
        return
    # If secret is configured, require matching key
    if key is None or not secrets.compare_digest(key, settings.inference_shared_secret):
        raise HTTPException(status_code=401, detail="Invalid inference credential.")


@app.get("/health")
async def health():
    return {"ready": runtime is not None, "model_version": runtime.manifest["model_version"] if runtime else None,
            "reading_ready": reading_runtime is not None,
            "tts_ready": speech_runtime is not None}


@app.get("/v1/model-status")
async def model_status():
    """Return model availability status for frontend"""
    if runtime is not None:
        return {
            "available": True,
            "source": "filesystem",
            "version": runtime.manifest["model_version"]
        }
    return {
        "available": False,
        "source": None,
        "version": None
    }


@app.post("/translate")
@app.post("/v1/translation")
async def translate(request: Request, x_inference_key: str | None = Header(default=None)):
    authenticate(x_inference_key)
    global runtime
    if runtime is None or request.model_version != runtime.manifest['model_version']:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,100}', request.model_version) or '..' in request.model_version:
            raise HTTPException(status_code=422, detail='Invalid model version.')
        async with reload_lock:
            package = (settings.model_package_root / request.model_version).resolve()
            if not package.is_relative_to(settings.model_package_root.resolve()) or not package.is_dir():
                raise HTTPException(status_code=503, detail='The activated model package is not mounted on this worker.')
            try:
                if request.model_checksum and file_sha256(package / 'manifest.json') != request.model_checksum:
                    raise HTTPException(status_code=409, detail='Activated manifest checksum does not match the mounted package.')
                runtime = await run_bounded(ModelRuntime, package, timeout=120)
            except (ValueError, OSError) as error:
                raise HTTPException(status_code=503, detail='The activated model package failed verification.') from error
    selected_runtime = runtime
    if request.model_checksum and selected_runtime.manifest_checksum != request.model_checksum:
        raise HTTPException(status_code=409, detail='Model manifest checksum mismatch.')
    if len(request.text) > settings.translation_max_characters:
        raise HTTPException(status_code=422, detail=f"Text exceeds {settings.translation_max_characters} characters.")
    logger.info("Translation request direction=%s_to_%s characters=%d", request.source_language, request.target_language, len(request.text))
    try:
        key=(request.model_version,selected_runtime.manifest_checksum,request.source_language,request.target_language,hashlib.sha256(request.text.strip().encode()).hexdigest())
        result = await translation_requests.get(key,lambda:run_bounded(run_model,"translation",selected_runtime.translate,request))
    except TranslationBusy as error:
        raise HTTPException(status_code=429, detail="AI service is busy. Please try again.") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {"translation": result}


async def run_bounded(function, *args, timeout=None, queue_timeout=2):
    # A timed-out CPU task still occupies its slot until it actually finishes.
    # Do not release capacity on timeout and accumulate unbounded background work.
    slots = semaphore
    try:
        await asyncio.wait_for(slots.acquire(), timeout=queue_timeout)
    except TimeoutError as error:
        raise HTTPException(status_code=429, detail="AI service is busy. Please try again.") from error
    task = asyncio.create_task(asyncio.to_thread(function, *args))
    def release_slot(completed):
        slots.release()
        if not completed.cancelled():
            completed.exception()

    task.add_done_callback(release_slot)
    try:
        return await asyncio.wait_for(asyncio.shield(task), timeout=timeout or settings.inference_timeout_seconds)
    except TimeoutError as error:
        raise HTTPException(status_code=504, detail="AI request timed out. Try a shorter recording or sentence.") from error


@app.post("/recognize")
@app.post("/v1/ai/reading")
async def recognize(expected_text: str = Form(..., min_length=1, max_length=300),
                    language: str = Form(...), audio: UploadFile = File(...),
                    x_inference_key: str | None = Header(default=None)):
    authenticate(x_inference_key)
    if language not in {"en", "fil"}:
        raise HTTPException(status_code=422, detail="Choose English or Filipino.")
    if reading_runtime is None:
        raise HTTPException(status_code=503, detail="The reading recognition model is not installed.")
    try:
        data = await audio.read(1_500_001)
        validate_wav(data)
        recognition = await run_bounded(
            run_model, "reading", reading_runtime.recognize_with_details, data, language, timeout=60, queue_timeout=6,
        )
        return compare_reading(expected_text, recognition.transcript, unclear=recognition.unclear)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        await audio.close()


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    language: str = Field(pattern="^(en|fil)$")


@app.post("/v1/ai/speak")
async def text_to_speech(request: TTSRequest, x_inference_key: str | None = Header(default=None)):
    """Generate pronunciation audio for a word or sentence using TTS."""
    authenticate(x_inference_key)
    if speech_runtime is not None:
        try:
            audio = await run_bounded(
                run_model, "speech", speech_runtime.speak, request.text, request.language,
                queue_timeout=6,
            )
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        return Response(content=audio, media_type="audio/wav")
    
    try:
        import edge_tts
        
        # Map language codes to edge-tts voice names
        voice_map = {
            "en": "en-US-AriaNeural",
            "fil": "fil-PH-AngeloNeural"  # Filipino voice
        }
        
        voice = voice_map.get(request.language, "en-US-AriaNeural")
        
        # Generate audio using edge-tts
        communicate = edge_tts.Communicate(request.text, voice)
        audio_data = b""
        
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        if not audio_data:
            raise HTTPException(status_code=500, detail="Failed to generate audio.")
        
        return Response(content=audio_data, media_type="audio/mpeg")
        
    except ImportError:
        # Fallback to gTTS if edge-tts is not available
        try:
            from gtts import gTTS
            import io
            
            # Map language codes for gTTS
            lang_code = "tl" if request.language == "fil" else "en"
            
            tts = gTTS(text=request.text, lang=lang_code, slow=False)
            audio_buffer = io.BytesIO()
            tts.write_to_fp(audio_buffer)
            audio_buffer.seek(0)
            
            return Response(content=audio_buffer.read(), media_type="audio/mpeg")
            
        except ImportError:
            raise HTTPException(
                status_code=503, 
                detail="Text-to-speech service is not available. Install edge-tts or gtts."
            )
    except Exception as error:
        logger.warning("TTS upstream failed (%s)", type(error).__name__)
        raise HTTPException(status_code=503, detail="Pronunciation audio is temporarily unavailable.") from error
