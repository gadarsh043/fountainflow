"""
FountainFlow Worker — FastAPI entry point.

Exposes:
  POST /jobs/{job_id}/process  — Enqueue an audio processing job via Celery.
  GET  /health                  — Liveness / readiness probe.

The actual work is done inside the Celery task `process_job` defined here.
"""

from __future__ import annotations

import hashlib
import logging
import os
import shutil
import tempfile
import time
from datetime import datetime, timezone
from typing import Any

import boto3
import httpx
from botocore.exceptions import ClientError
from celery import Celery
from celery.utils.log import get_task_logger
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from settings import WorkerSettings, get_settings

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
task_logger = get_task_logger(__name__)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="FountainFlow Worker",
    description="Audio analysis + choreography generation worker",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# Celery app — broker and backend both point at Redis
# ---------------------------------------------------------------------------

def _make_celery(settings: WorkerSettings) -> Celery:
    """Create and configure a Celery application instance.

    Args:
        settings: Application settings containing Redis URL and time limits.

    Returns:
        Configured Celery application.
    """
    celery_app = Celery(
        "fountainflow_worker",
        broker=settings.redis_url,
        backend=settings.redis_url,
    )
    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_soft_time_limit=settings.celery_task_soft_time_limit,
        task_time_limit=settings.celery_task_time_limit,
        worker_concurrency=settings.celery_concurrency,
        task_track_started=True,
        result_expires=86400,  # 24 h
    )
    return celery_app


_settings = get_settings()
celery_app = _make_celery(_settings)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ProcessJobRequest(BaseModel):
    """Payload sent by the API server to trigger audio processing.

    Attributes:
        job_id: Unique job identifier.
        project_id: Parent project ID.
        audio_file_key: S3 object key for the uploaded audio file.
        fountain_config: Full fountain hardware configuration dict.
        target_platforms: List of code generation target platforms.
        use_ai_refinement: Whether to use Claude API for choreography refinement.
    """

    job_id: str
    project_id: str
    audio_file_key: str
    fountain_config: dict[str, Any]
    target_platforms: list[str] = Field(default_factory=lambda: ["json_timeline"])
    use_ai_refinement: bool = False


class ProcessJobResponse(BaseModel):
    """Immediate response after job enqueue.

    Attributes:
        job_id: Echo of the job ID.
        celery_task_id: Celery task ID for status polling.
        status: Always 'queued' at this point.
        message: Human-readable confirmation.
    """

    job_id: str
    celery_task_id: str
    status: str
    message: str


class HealthResponse(BaseModel):
    """Health check response.

    Attributes:
        status: 'ok' or 'degraded'.
        redis_ok: Whether Redis is reachable.
        timestamp: ISO8601 check time.
    """

    status: str
    redis_ok: bool
    timestamp: str


# ---------------------------------------------------------------------------
# FastAPI routes
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["ops"])
async def health_check() -> HealthResponse:
    """Liveness / readiness probe.

    Returns:
        HealthResponse with Redis connectivity status.
    """
    redis_ok = False
    try:
        import redis as redis_lib

        r = redis_lib.from_url(_settings.redis_url, socket_connect_timeout=2)
        r.ping()
        redis_ok = True
    except Exception as exc:
        logger.warning("Redis ping failed: %s", exc)

    return HealthResponse(
        status="ok" if redis_ok else "degraded",
        redis_ok=redis_ok,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@app.post(
    "/jobs/{job_id}/process",
    response_model=ProcessJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["jobs"],
)
async def enqueue_job(job_id: str, request: ProcessJobRequest) -> ProcessJobResponse:
    """Enqueue an audio processing job into Celery.

    Args:
        job_id: Path parameter — must match request.job_id.
        request: ProcessJobRequest body.

    Returns:
        ProcessJobResponse with Celery task ID.

    Raises:
        HTTPException 400: If job_id in path and body do not match.
        HTTPException 503: If Celery/Redis is unavailable.
    """
    if job_id != request.job_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Path job_id '{job_id}' does not match body job_id '{request.job_id}'",
        )

    try:
        task = process_job.apply_async(
            kwargs=request.model_dump(),
            task_id=f"job-{job_id}",
        )
    except Exception as exc:
        logger.exception("Failed to enqueue job %s", job_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not enqueue job: {exc}",
        ) from exc

    logger.info("Job %s enqueued as Celery task %s", job_id, task.id)
    return ProcessJobResponse(
        job_id=job_id,
        celery_task_id=task.id,
        status="queued",
        message=f"Job {job_id} successfully queued for processing",
    )


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------


def _build_s3_client(settings: WorkerSettings) -> Any:
    """Create a boto3 S3 client from settings.

    Args:
        settings: Application settings with S3 credentials.

    Returns:
        boto3 S3 client.
    """
    kwargs: dict[str, Any] = {
        "region_name": settings.s3_region,
    }
    if settings.s3_access_key:
        kwargs["aws_access_key_id"] = settings.s3_access_key
        kwargs["aws_secret_access_key"] = settings.s3_secret_key
    if settings.s3_endpoint:
        # MinIO / Cloudflare R2 / any S3-compatible endpoint
        kwargs["endpoint_url"] = settings.s3_endpoint
    return boto3.client("s3", **kwargs)


def _post_progress(
    settings: WorkerSettings,
    job_id: str,
    stage: str,
    progress_pct: float,
    message: str,
    *,
    status: str = "running",
    extra: dict[str, Any] | None = None,
) -> None:
    """Post a job progress update to the NestJS API /jobs/:id/callback endpoint.

    Args:
        settings: Worker settings (callback URL + secret).
        job_id: Job being processed.
        stage: Current pipeline stage name.
        progress_pct: 0.0–100.0 completion percentage.
        message: Human-readable status message.
        status: Callback status — 'running' | 'completed' | 'failed'.
        extra: Additional keys to merge into the payload (e.g. S3 result keys).
    """
    if not settings.api_callback_url:
        return
    payload: dict[str, Any] = {
        "job_id": job_id,
        "status": status,
        "stage": stage,
        "progress_pct": progress_pct,
        "message": message,
    }
    if extra:
        payload.update(extra)
    try:
        with httpx.Client(timeout=5.0) as client:
            client.post(
                f"{settings.api_callback_url}/jobs/{job_id}/callback",
                json=payload,
                headers={"x-worker-secret": settings.api_internal_secret},
            )
    except Exception as exc:
        task_logger.warning("Progress callback failed: %s", exc)


@celery_app.task(name="fountainflow.process_job", bind=True, max_retries=3)
def process_job(
    self: Any,
    job_id: str,
    project_id: str,
    audio_file_key: str,
    fountain_config: dict[str, Any],
    target_platforms: list[str],
    use_ai_refinement: bool = False,
) -> dict[str, Any]:
    """Main Celery task: download audio → analyse → choreograph → generate code → upload results.

    Args:
        self: Celery task instance (bind=True).
        job_id: Unique job identifier.
        project_id: Parent project.
        audio_file_key: S3 object key for audio file.
        fountain_config: Fountain hardware configuration dict.
        target_platforms: Code generation targets.
        use_ai_refinement: Reserved for future Claude API integration.

    Returns:
        JobResult dict matching the TypeScript JobResult interface.
    """
    settings = get_settings()
    start_time = time.monotonic()
    work_dir = tempfile.mkdtemp(prefix=f"ff_{job_id}_", dir=settings.tmp_dir if os.path.isdir(settings.tmp_dir) else None)
    task_logger.info("Job %s started — workdir: %s", job_id, work_dir)

    try:
        # ------------------------------------------------------------------
        # Stage 1: Download audio from S3
        # ------------------------------------------------------------------
        _post_progress(settings, job_id, "downloading", 5.0, "Downloading audio from S3")
        s3 = _build_s3_client(settings)
        audio_ext = os.path.splitext(audio_file_key)[1].lower() or ".mp3"
        local_audio_path = os.path.join(work_dir, f"input{audio_ext}")

        try:
            s3.download_file(settings.s3_bucket, audio_file_key, local_audio_path)
        except ClientError as exc:
            task_logger.error("S3 download failed for %s: %s", audio_file_key, exc)
            raise

        # Compute SHA-256 of raw audio
        with open(local_audio_path, "rb") as fh:
            audio_hash = hashlib.sha256(fh.read()).hexdigest()

        # ------------------------------------------------------------------
        # Stage 2: Audio analysis
        # ------------------------------------------------------------------
        _post_progress(settings, job_id, "converting", 10.0, "Converting audio to WAV")
        from audio_analysis.pipeline import run_analysis_pipeline

        analysis_result = run_analysis_pipeline(
            audio_path=local_audio_path,
            work_dir=work_dir,
            settings=settings,
            audio_hash=audio_hash,
        )
        _post_progress(settings, job_id, "analyzing_energy", 50.0, "Audio analysis complete")

        # ------------------------------------------------------------------
        # Stage 3: Choreography generation
        # ------------------------------------------------------------------
        _post_progress(settings, job_id, "generating_choreography", 55.0, "Generating choreography")
        from choreography.engine import run_choreography_engine

        song_name = os.path.splitext(os.path.basename(audio_file_key))[0]
        show_timeline = run_choreography_engine(
            analysis_result=analysis_result,
            fountain_config=fountain_config,
            song_name=song_name,
            settings=settings,
        )
        _post_progress(settings, job_id, "generating_choreography", 70.0, "Choreography generated")

        # ------------------------------------------------------------------
        # Stage 4: Code generation
        # ------------------------------------------------------------------
        _post_progress(settings, job_id, "generating_code", 75.0, "Generating control code")
        from code_generation.generator import run_code_generation

        generation_results = run_code_generation(
            show_timeline=show_timeline,
            fountain_config=fountain_config,
            target_platforms=target_platforms,
            settings=settings,
        )
        _post_progress(settings, job_id, "packaging", 88.0, "Packaging output files")

        # ------------------------------------------------------------------
        # Stage 5: Upload results to S3
        # ------------------------------------------------------------------
        _post_progress(settings, job_id, "uploading", 90.0, "Uploading results to S3")
        import json
        import zipfile

        base_key = f"jobs/{job_id}"

        # Upload analysis result JSON
        analysis_json = json.dumps(analysis_result, indent=2, default=str)
        analysis_key = f"{base_key}/analysis.json"
        s3.put_object(
            Bucket=settings.s3_bucket,
            Key=analysis_key,
            Body=analysis_json.encode("utf-8"),
            ContentType="application/json",
        )

        # Upload timeline JSON
        timeline_json = json.dumps(show_timeline, indent=2, default=str)
        timeline_key = f"{base_key}/timeline.json"
        s3.put_object(
            Bucket=settings.s3_bucket,
            Key=timeline_key,
            Body=timeline_json.encode("utf-8"),
            ContentType="application/json",
        )

        # Package generated code into a ZIP
        zip_path = os.path.join(work_dir, "code_package.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for gen_result in generation_results:
                for generated_file in gen_result.get("files", []):
                    fname = generated_file["filename"]
                    if generated_file["content_type"] == "text":
                        zf.writestr(fname, generated_file.get("content", ""))
                    else:
                        import base64
                        raw = base64.b64decode(generated_file.get("content_b64", ""))
                        zf.writestr(fname, raw)

        code_key = f"{base_key}/code_package.zip"
        with open(zip_path, "rb") as fh:
            s3.put_object(
                Bucket=settings.s3_bucket,
                Key=code_key,
                Body=fh.read(),
                ContentType="application/zip",
            )

        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        # timeline_key doubles as simulation_data_key — the 3D viewer reads the
        # same JSON to drive particle heights and LED colors.
        _post_progress(
            settings,
            job_id,
            "completed",
            100.0,
            f"Completed in {elapsed_ms}ms",
            status="completed",
            extra={
                "analysis_result_key": analysis_key,
                "timeline_key": timeline_key,
                "code_package_key": code_key,
                "simulation_data_key": timeline_key,
                "processing_time_ms": elapsed_ms,
            },
        )

        result: dict[str, Any] = {
            "job_id": job_id,
            "status": "completed",
            "analysis_result_key": analysis_key,
            "timeline_key": timeline_key,
            "code_package_key": code_key,
            "simulation_data_key": timeline_key,
            "processing_time_ms": elapsed_ms,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        task_logger.info("Job %s completed in %dms", job_id, elapsed_ms)
        return result

    except Exception as exc:
        task_logger.exception("Job %s failed: %s", job_id, exc)
        _post_progress(
            settings, job_id, "failed", 0.0, f"Failed: {exc}",
            status="failed",
            extra={"error_message": str(exc)},
        )
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 30)

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
