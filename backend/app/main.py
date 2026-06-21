import os
import shutil
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from apscheduler.schedulers.background import BackgroundScheduler

# Always load .env from backend folder regardless of cwd
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")

from app.auth import CurrentUser, get_current_user
from app.auth_routes import router as auth_router
from app.db import assign_job_to_user, init_db, job_belongs_to_user
from app.downloader import normalize_url_label
from app.import_worker import run_url_imports
from app.jobs import create_job, get_job, set_video_paths, update_job
from app.models import JobStatus, ProcessRequest
from app.paths import OUTPUT_DIR, UPLOAD_DIR, ensure_data_dirs
from app.schedule_worker import process_pending_posts
from app.social_routes import router as social_router
from app.social_routes import schedule_router
from app.worker import create_zip, new_job_id, run_processing

app = FastAPI(title="ShortForge API", version="1.0.0")
scheduler = BackgroundScheduler()

_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(social_router)
app.include_router(schedule_router)


def ensure_dirs() -> None:
    ensure_data_dirs()


def _require_job(job_id: str, user: CurrentUser) -> None:
    if not job_belongs_to_user(job_id, user.id):
        raise HTTPException(404, "Job not found")


@app.on_event("startup")
def startup() -> None:
    ensure_dirs()
    init_db()
    if not scheduler.running:
        scheduler.add_job(
            process_pending_posts, "interval", minutes=1, id="post_scheduler"
        )
        scheduler.start()


@app.on_event("shutdown")
def shutdown() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "ShortForge"}


@app.post("/api/jobs")
def create_new_job(user: CurrentUser = Depends(get_current_user)) -> dict:
    job_id = new_job_id()
    create_job(job_id, user.id)
    assign_job_to_user(job_id, user.id)
    return {"job_id": job_id}


async def _save_upload(upload: UploadFile, dest: Path) -> None:
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)


@app.post("/api/jobs/{job_id}/upload")
async def upload_videos(
    job_id: str,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    video1: UploadFile | None = File(None),
    video1_url: str | None = Form(None),
    video2: UploadFile | None = File(None),
    video2_url: str | None = Form(None),
) -> dict:
    _require_job(job_id, user)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    has_video1 = (video1 and video1.filename) or (video1_url and video1_url.strip())
    if not has_video1:
        raise HTTPException(400, "Primary video requires a file upload or URL")

    ensure_dirs()

    url1 = video1_url.strip() if video1_url and video1_url.strip() else None
    url2 = video2_url.strip() if video2_url and video2_url.strip() else None

    path1: Path | None = None
    path2: Path | None = None
    label1: str | None = None
    label2: str | None = None

    try:
        if video1 and video1.filename:
            ext = Path(video1.filename).suffix or ".mp4"
            path1 = UPLOAD_DIR / f"{job_id}_video1{ext}"
            await _save_upload(video1, path1)
            label1 = video1.filename
        elif url1:
            label1 = normalize_url_label(url1)

        if video2 and video2.filename:
            ext = Path(video2.filename).suffix or ".mp4"
            path2 = UPLOAD_DIR / f"{job_id}_video2{ext}"
            await _save_upload(video2, path2)
            label2 = video2.filename
        elif url2:
            label2 = normalize_url_label(url2)

        needs_url_download = (url1 and path1 is None) or (url2 and path2 is None)

        if needs_url_download:
            update_job(
                job_id,
                status="importing",
                message="Starting download...",
                progress=0,
                error=None,
            )
            background_tasks.add_task(run_url_imports, job_id, url1, url2, path1, path2)
            return {
                "job_id": job_id,
                "status": "importing",
                "video1": label1,
                "video2": label2,
            }

        if path1 is None:
            raise HTTPException(400, "Primary video could not be saved")

        set_video_paths(job_id, str(path1), str(path2) if path2 else None)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Failed to import video: {exc}") from exc

    return {
        "job_id": job_id,
        "status": "uploaded",
        "video1": label1,
        "video2": label2,
    }


@app.post("/api/jobs/{job_id}/process")
def start_processing(
    job_id: str,
    request: ProcessRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    _require_job(job_id, user)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if not job.get("video1_path"):
        raise HTTPException(400, "Add at least one video first")
    if job.get("status") == "importing":
        raise HTTPException(400, "Still downloading videos — wait for import to finish")

    request.job_id = job_id
    update_job(job_id, status="queued", message="Queued for processing...")
    background_tasks.add_task(run_processing, request)
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}/status", response_model=JobStatus)
def job_status(job_id: str, user: CurrentUser = Depends(get_current_user)) -> JobStatus:
    _require_job(job_id, user)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    from app.models import ShortInfo

    shorts = [ShortInfo(**s) for s in job.get("shorts", [])]

    return JobStatus(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        message=job["message"],
        total_shorts=job["total_shorts"],
        completed_shorts=job["completed_shorts"],
        shorts=shorts,
        error=job.get("error"),
    )


@app.get("/api/jobs/{job_id}/download/{filename}")
def download_short(
    job_id: str, filename: str, user: CurrentUser = Depends(get_current_user)
) -> FileResponse:
    _require_job(job_id, user)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid filename")

    path = OUTPUT_DIR / job_id / filename
    if not path.exists():
        raise HTTPException(404, "File not found")

    return FileResponse(path, media_type="video/mp4", filename=filename)


@app.get("/api/jobs/{job_id}/download-all")
def download_all(job_id: str, user: CurrentUser = Depends(get_current_user)) -> FileResponse:
    _require_job(job_id, user)
    zip_path = create_zip(job_id)
    if not zip_path:
        raise HTTPException(404, "No shorts available")

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"shorts_{job_id[:8]}.zip",
    )


@app.get("/api/layouts")
def list_layouts() -> list[dict]:
    return [
        {
            "id": "single",
            "name": "Single Video",
            "description": "One video full screen — classic Shorts format",
            "requires_two": False,
        },
        {
            "id": "stack_vertical",
            "name": "Top & Bottom",
            "description": "Split screen vertically — great for comparisons",
            "requires_two": True,
        },
        {
            "id": "main_with_reaction",
            "name": "Main + Reaction",
            "description": "Large main video on top, reaction cam below",
            "requires_two": True,
        },
        {
            "id": "picture_in_picture",
            "name": "Picture in Picture",
            "description": "Main video with overlay in corner",
            "requires_two": True,
        },
        {
            "id": "stack_horizontal",
            "name": "Side by Side",
            "description": "Two videos side by side in vertical frame",
            "requires_two": True,
        },
    ]
