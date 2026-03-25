"""
FountainFlow Worker — Settings module.

All configuration is read from environment variables via Pydantic Settings.
No values are hardcoded here; this module only declares types and defaults.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class WorkerSettings(BaseSettings):
    """Application settings sourced from environment variables.

    Args:
        All fields are documented inline via Field(description=...).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Service identity ---
    app_name: str = Field(default="fountainflow-worker", description="Service name")
    app_version: str = Field(default="1.0.0", description="FountainFlow version")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO", description="Logging verbosity"
    )

    # --- Redis / Celery ---
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL used as Celery broker and result backend",
    )
    celery_task_soft_time_limit: int = Field(
        default=3600,
        description="Soft task time-limit in seconds before SoftTimeLimitExceeded is raised",
    )
    celery_task_time_limit: int = Field(
        default=4200,
        description="Hard task time-limit in seconds before worker is killed",
    )
    celery_concurrency: int = Field(
        default=2,
        description="Number of concurrent Celery worker processes",
    )

    # --- S3 / MinIO storage ---
    # Env var names match NestJS API and .env.example: S3_BUCKET, S3_REGION,
    # S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT
    s3_bucket: str = Field(default="fountainflow-dev", description="S3 bucket name")
    s3_region: str = Field(default="us-east-1", description="AWS/MinIO region")
    s3_access_key: str = Field(default="", description="S3 / MinIO access key (S3_ACCESS_KEY)")
    s3_secret_key: str = Field(default="", description="S3 / MinIO secret key (S3_SECRET_KEY)")
    s3_endpoint: str | None = Field(
        default=None,
        description="Override S3 endpoint for MinIO/Cloudflare R2 (S3_ENDPOINT). Leave blank for real AWS.",
    )

    # --- Audio analysis ---
    audio_sample_rate: int = Field(
        default=22050, description="Sample rate for librosa analysis (always 22050)"
    )
    analysis_frame_rate: int = Field(
        default=40, description="Output frame rate for choreography (fps)"
    )
    min_silence_duration_ms: int = Field(
        default=800,
        description="Minimum silence duration in ms to be considered a song boundary",
    )
    silence_energy_threshold_pct: float = Field(
        default=0.02,
        description="RMS energy below this fraction of mean is considered silence",
    )

    # --- Physics constraints ---
    min_valve_on_time_ms: int = Field(
        default=100, description="Minimum valve open time in milliseconds"
    )
    min_valve_off_time_ms: int = Field(
        default=100, description="Minimum valve closed time in milliseconds"
    )
    min_close_time_large_pipe_ms: int = Field(
        default=300,
        description="Minimum close time for pipes > 2 inch (water hammer prevention)",
    )
    max_valve_frequency_hz: float = Field(
        default=5.0, description="Maximum valve switching frequency in Hz"
    )
    max_vfd_change_per_frame: int = Field(
        default=6,
        description="Maximum DMX value change per frame for VFD ramp rate limiting",
    )

    # --- FFmpeg ---
    ffmpeg_bin: str = Field(
        default="ffmpeg", description="Path or name of the FFmpeg binary"
    )

    # --- API server callback ---
    api_callback_url: str | None = Field(
        default=None,
        description="URL of the NestJS API server to POST job progress updates",
    )
    api_internal_secret: str = Field(
        default="",
        description="Shared secret for worker → API server authentication",
    )

    # --- Temp directory ---
    tmp_dir: str = Field(
        default="/tmp/fountainflow",
        description="Directory for temporary audio files during processing",
    )

    @field_validator("log_level", mode="before")
    @classmethod
    def upper_log_level(cls, v: str) -> str:
        """Ensure log level is upper-cased."""
        return v.upper()


@lru_cache(maxsize=1)
def get_settings() -> WorkerSettings:
    """Return cached application settings singleton.

    Returns:
        WorkerSettings instance loaded from environment.
    """
    settings = WorkerSettings()
    logging.basicConfig(level=getattr(logging, settings.log_level))
    logger.info("Settings loaded: app=%s version=%s", settings.app_name, settings.app_version)
    return settings
