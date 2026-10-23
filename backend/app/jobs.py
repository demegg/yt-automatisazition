import threading
from typing import Any

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def create_job(
    job_id: str,
    user_id: int,
    batch_name: str = "Untitled batch",
    batch_slug: str = "batch",
) -> None:
    with _lock:
        _jobs[job_id] = {
            "user_id": user_id,
            "status": "pending",
            "progress": 0.0,
            "message": "Waiting to start...",
            "total_shorts": 0,
            "completed_shorts": 0,
            "shorts": [],
            "error": None,
            "video1_path": None,
            "video2_path": None,
            "music_path": None,
            "music_name": None,
            "batch_name": batch_name,
            "batch_slug": batch_slug,
            "output_dir": None,
        }


def update_job(job_id: str, **kwargs: Any) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(kwargs)


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def list_jobs_for_user(user_id: int) -> list[dict[str, Any]]:
    with _lock:
        return [
            {"job_id": job_id, **dict(job)}
            for job_id, job in _jobs.items()
            if job.get("user_id") == user_id
        ]


def set_video_paths(job_id: str, video1: str, video2: str | None) -> None:
    update_job(job_id, video1_path=video1, video2_path=video2, status="uploaded")


def resolve_output_dir(job_id: str):
    from pathlib import Path

    from app.db import get_job_batch
    from app.paths import OUTPUT_DIR

    job = get_job(job_id)
    if job:
        if job.get("output_dir"):
            path = Path(job["output_dir"])
            if path.exists():
                return path
        slug = job.get("batch_slug")
        if slug:
            path = OUTPUT_DIR / slug
            if path.exists():
                return path
    rec = get_job_batch(job_id)
    if rec and rec.get("batch_slug"):
        path = OUTPUT_DIR / rec["batch_slug"]
        if path.exists():
            return path
    return OUTPUT_DIR / job_id
