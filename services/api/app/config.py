from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def supabase_headers(api_key: str, user_token: str | None = None) -> dict[str, str]:
    """Opaque API keys use apikey; only JWTs belong in Authorization."""
    headers = {'apikey': api_key}
    if user_token:
        headers['Authorization'] = f'Bearer {user_token}'
    elif api_key and not api_key.startswith('sb_'):
        headers['Authorization'] = f'Bearer {api_key}'
    return headers


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "LinguaKids API"
    environment: str = "development"
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    inference_base_url: str = "http://127.0.0.1:8001"
    inference_shared_secret: str = ""
    speech_neural_enabled: bool = False
    speech_cache_path: Path | None = None
    speech_library_path: Path | None = None
    training_base_package_path: str = "services/inference/models/opus-baseline-v1"
    model_package_path: Path = Path("")
    allow_bundled_student_model: bool = False
    translation_max_characters: int = Field(default=300, ge=1, le=2000)
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:3000", "http://127.0.0.1:8080"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
