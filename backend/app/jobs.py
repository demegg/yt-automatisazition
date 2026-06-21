import threading
from typing import Any

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def create_job(job_id: str, user_id: int) -> None:
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
        }


def update_job(job_id: str, **kwargs: Any) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(kwargs)


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def set_video_paths(job_id: str, video1: str, video2: str | None) -> None:
    update_job(job_id, video1_path=video1, video2_path=video2, status="uploaded")
