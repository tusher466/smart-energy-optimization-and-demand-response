from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Smart energy optimization and demand response"
    api_v1: str = "/api/v1"
    database_url: str = "sqlite:///./energy_brain.db"
    model_cache_dir: str = "./.model_cache"
    nrel_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    electricity_maps_key: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    secret_key: str = "dev-only-change-me-in-prod-use-64-hex-chars-minimum-0123456789abcdef"
    token_hours: int = 12

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
