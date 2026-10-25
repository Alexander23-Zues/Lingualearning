from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "LinguaKids API"
    environment: str = "development"
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    inference_base_url: str = "http://127.0.0.1:8001"
    inference_shared_secret: str = ""
    translation_max_characters: int = Field(default=300, ge=1, le=2000)
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:3000", "http://127.0.0.1:8080"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
