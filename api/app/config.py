"""All settings come from environment variables (or the api/.env file)."""
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parent.parent  # the api/ folder


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=API_ROOT / ".env", extra="ignore")

    environment: str = "development"
    client_url: str = "http://localhost:5173"
    serve_client: bool = False

    database_url: str = "mysql+pymysql://ayana:ayana_pass@localhost:3306/ayana"

    jwt_secret: str
    jwt_expires_days: int = 7

    payment_mode: str = "mock"  # "mock" or "razorpay"
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    booking_hold_minutes: int = 30
    upload_dir: str = "uploads"

    admin_email: str = "admin@ayana.travel"
    admin_password: str = "Admin@12345"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def client_urls(self) -> list[str]:
        return [u.strip() for u in self.client_url.split(",") if u.strip()]

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        return p if p.is_absolute() else API_ROOT / p

    @model_validator(mode="after")
    def check_payments(self):
        self.payment_mode = self.payment_mode.lower()
        if self.payment_mode == "razorpay" and not (self.razorpay_key_id and self.razorpay_key_secret):
            raise ValueError("PAYMENT_MODE=razorpay needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
