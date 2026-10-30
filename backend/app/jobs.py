import logging
import threading
from typing import Any

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}
_log = logging.getLogger("shortforge.jobs")


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
    snapshot: dict[str, Any] | None = None
    with _lock:
        if job_id not in _jobs:
            return
        _jobs[job_id].update(kwargs)
        snapshot = dict(_jobs[job_id])
    if snapshot is None:
        return
    try:
        from app.db import persist_job_snapshot

        persist_job_snapshot(job_id, snapshot)
    except Exception:
        _log.exception("Could not persist job %s", job_id)


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if job is not None:
            return dict(job)
    try:
        from app.db import load_job_snapshot

        loaded = load_job_snapshot(job_id)
    except Exception:
        _log.exception("Could not load job %s", job_id)
        return None
    if not loaded:
        return None
    with _lock:
        _jobs.setdefault(job_id, loaded)
        return dict(_jobs[job_id])


def drop_job(job_id: str) -> None:
    with _lock:
        _jobs.pop(job_id, None)


def list_jobs_for_user(user_id: int) -> list[dict[str, Any]]:
    with _lock:
        return [
            {"job_id": job_id, **dict(job)}
            for job_id, job in _jobs.items()
            if job.get("user_id") == user_id
        ]


def set_video_paths(job_id: str, video1: str, video2: str | None) -> None:
    update_job(job_id, video1_path=video1, video2_path=video2, status="uploaded")


def recover_disk_exports(job_id: str) -> None:
    """Fill jobs that finished before shorts were stored in the database.

    Older rows can say "saved" while the MP4s are already in the output folder.
    Pending and running jobs are left alone so a new batch cannot claim another
    folder that happens to share its slug.
    """
    job = get_job(job_id)
    if not job or job.get("shorts"):
        return
    if job.get("status") not in {"saved", "uploaded", "completed"}:
        return
    from pathlib import Path

    from app.paths import OUTPUT_DIR, clip_index_label, list_short_files, safe_output_dir

    candidates: list[Path] = []
    if job.get("output_dir"):
        candidates.append(Path(job["output_dir"]))
    slug = job.get("batch_slug")
    if slug:
        candidates.append(OUTPUT_DIR / slug)
    candidates.append(OUTPUT_DIR / job_id)
    found: list[Path] = []
    output_dir: str | None = None
    for candidate in candidates:
        root = safe_output_dir(candidate)
        if root is None or not root.exists():
            continue
        found = list_short_files(root)
        if found:
            output_dir = str(root)
            break
    if not found or output_dir is None:
        return
    shorts: list[dict[str, Any]] = []
    for path in found:
        label = clip_index_label(path.name)
        index = int(label) if label.isdigit() else len(shorts) + 1
        shorts.append(
            {
                "filename": path.name,
                "index": index,
                "start_time": 0.0,
                "end_time": 0.0,
                "duration": 0.0,
                "title": None,
            }
        )
    update_job(
        job_id,
        shorts=shorts,
        total_shorts=len(shorts),
        completed_shorts=len(shorts),
        status="completed",
        progress=100.0,
        message=job.get("message") or f"{len(shorts)} shorts found on disk",
        output_dir=output_dir,
    )


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
