import asyncio
import hashlib
import json
import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


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
    inference_concurrency: int = 2
    inference_timeout_seconds: float = 18


class Request(BaseModel):
    text: str = Field(min_length=1)
    source_language: str
    target_language: str
    model_version: str

    @model_validator(mode="after")
    def valid_direction(self):
        if (self.source_language, self.target_language) not in {("en", "fil"), ("fil", "en")}:
            raise ValueError("Unsupported language direction.")
        return self


class ModelRuntime:
    def __init__(self, package_path: Path) -> None:
        manifest_path = package_path / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError("Approved model manifest is missing.")
        self.manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for relative_path, expected_checksum in self.manifest.get("files", {}).items():
            artifact = package_path / relative_path
            if not artifact.is_file() or file_sha256(artifact) != expected_checksum:
                raise RuntimeError(f"Model package integrity check failed for {relative_path}.")
        model_path = package_path / "model"
        self.tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(model_path, local_files_only=True)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        self.model.eval()

    def translate(self, request: Request) -> str:
        direction = "English to Filipino" if request.source_language == "en" else "Filipino to English"
        prompt = f"translate {direction}: {request.text}"
        encoded = self.tokenizer(prompt, return_tensors="pt", truncation=False).to(self.device)
        with torch.inference_mode():
            output = self.model.generate(**encoded, max_new_tokens=256, num_beams=4)
        return self.tokenizer.decode(output[0], skip_special_tokens=True).strip()


settings = Settings()
runtime: ModelRuntime | None = None
semaphore = asyncio.Semaphore(settings.inference_concurrency)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global runtime
    try:
        runtime = ModelRuntime(settings.model_package_path)
        logger.info("Approved translation model loaded once for this worker.")
    except FileNotFoundError:
        runtime = None
        logger.warning("No approved model package is mounted.")
    yield
    runtime = None


app = FastAPI(title="LinguaKids Translation Inference", version="1.0.0", lifespan=lifespan)


def authenticate(key: str | None) -> None:
    if not settings.inference_shared_secret or key is None or not secrets.compare_digest(key, settings.inference_shared_secret):
        raise HTTPException(status_code=401, detail="Invalid inference credential.")


@app.get("/health")
async def health():
    return {"ready": runtime is not None, "model_version": runtime.manifest["model_version"] if runtime else None}


@app.post("/translate")
async def translate(request: Request, x_inference_key: str | None = Header(default=None)):
    authenticate(x_inference_key)
    if runtime is None:
        raise HTTPException(status_code=503, detail="No approved model is loaded.")
    if request.model_version != runtime.manifest["model_version"]:
        raise HTTPException(status_code=409, detail="Requested model is not active in this worker.")
    if len(request.text) > settings.translation_max_characters:
        raise HTTPException(status_code=422, detail=f"Text exceeds {settings.translation_max_characters} characters.")
    logger.info("Translation request direction=%s_to_%s characters=%d", request.source_language, request.target_language, len(request.text))
    async with semaphore:
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(runtime.translate, request),
                timeout=settings.inference_timeout_seconds,
            )
        except TimeoutError as error:
            raise HTTPException(status_code=504, detail="Translation timed out.") from error
    return {"translation": result}
