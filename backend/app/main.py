import os
import shutil
from pathlib import Path
from typing import Optional

# Limit BLAS/MKL threads early to reduce Whisper/onnxruntime OOM on Windows.
for _k, _v in (
    ("OMP_NUM_THREADS", "1"),
    ("MKL_NUM_THREADS", "1"),
    ("OPENBLAS_NUM_THREADS", "1"),
    ("NUMEXPR_NUM_THREADS", "1"),
):
    os.environ.setdefault(_k, _v)

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
from app.db import assign_job_to_user, init_db, job_belongs_to_user, list_user_jobs
from app.downloader import normalize_url_label
from app.import_worker import run_url_imports
from app.jobs import create_job, get_job, list_jobs_for_user, resolve_output_dir, set_video_paths, update_job
from app.models import CreateJobRequest, JobStatus, ProcessRequest
from app.paths import UPLOAD_DIR, ensure_data_dirs, slugify_batch_name
from app.processor import get_video_duration
from app.schedule_worker import process_pending_posts
from app.social_routes import router as social_router
from app.social_routes import schedule_router
from app.task_runner import run_in_background
from app.worker import create_zip, new_job_id, run_processing

app = FastAPI(title="ShortForge API", version="1.0.0")
scheduler = BackgroundScheduler()

_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:8891,http://127.0.0.1:8891,http://localhost:8765,http://127.0.0.1:8765",
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
def create_new_job(
    body: CreateJobRequest, user: CurrentUser = Depends(get_current_user)
) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Give this batch a name")
    slug = slugify_batch_name(name)
    job_id = new_job_id()
    create_job(job_id, user.id, batch_name=name, batch_slug=slug)
    assign_job_to_user(job_id, user.id, batch_name=name, batch_slug=slug)
    return {"job_id": job_id, "batch_name": name, "batch_slug": slug}


@app.get("/api/jobs")
def list_jobs(user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    """Active in-memory jobs plus recent DB history for the project switcher."""
    live = {j["job_id"]: j for j in list_jobs_for_user(user.id)}
    seen: set[str] = set()
    out: list[dict] = []

    for job_id, job in live.items():
        seen.add(job_id)
        out.append(
            {
                "job_id": job_id,
                "status": job.get("status", "pending"),
                "progress": job.get("progress", 0),
                "message": job.get("message"),
                "batch_name": job.get("batch_name"),
                "batch_slug": job.get("batch_slug"),
                "total_shorts": job.get("total_shorts", 0),
                "completed_shorts": job.get("completed_shorts", 0),
                "error": job.get("error"),
                "live": True,
            }
        )

    for row in list_user_jobs(user.id):
        if row["job_id"] in seen:
            continue
        out.append(
            {
                "job_id": row["job_id"],
                "status": "archived",
                "progress": 0,
                "message": None,
                "batch_name": row.get("batch_name"),
                "batch_slug": row.get("batch_slug"),
                "total_shorts": 0,
                "completed_shorts": 0,
                "error": None,
                "live": False,
                "created_at": row.get("created_at"),
            }
        )

    return out


AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".opus"}
MEDIA_TYPES = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".opus": "audio/opus",
}


async def _save_upload(upload: UploadFile, dest: Path) -> None:
    with dest.open("wb") as f:
        shutil.copyfileobj(upload.file, f)


def _media_type(path: Path) -> str:
    return MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")


def _clear_music_files(job_id: str) -> None:
    for old in UPLOAD_DIR.glob(f"{job_id}_music.*"):
        old.unlink(missing_ok=True)


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
            run_in_background(run_url_imports, job_id, url1, url2, path1, path2)
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


@app.get("/api/jobs/{job_id}/edit-info")
def edit_info(job_id: str, user: CurrentUser = Depends(get_current_user)) -> dict:
    _require_job(job_id, user)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    video1 = job.get("video1_path")
    if not video1 or not Path(video1).exists():
        raise HTTPException(400, "Video is not ready yet")

    info: dict = {
        "duration1": get_video_duration(video1),
        "duration2": None,
        "has_video2": False,
        "music_name": job.get("music_name"),
        "music_duration": None,
    }
    video2 = job.get("video2_path")
    if video2 and Path(video2).exists():
        info["duration2"] = get_video_duration(video2)
        info["has_video2"] = True
    music = job.get("music_path")
    if music and Path(music).exists():
        try:
            info["music_duration"] = get_video_duration(music)
        except Exception:
            info["music_duration"] = None
        if not info["music_name"]:
            info["music_name"] = Path(music).name
    return info


@app.get("/api/jobs/{job_id}/source/{slot}")
def source_video(
    job_id: str, slot: int, user: CurrentUser = Depends(get_current_user)
) -> FileResponse:
    _require_job(job_id, user)
    if slot not in (1, 2):
        raise HTTPException(400, "slot must be 1 or 2")
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    key = "video1_path" if slot == 1 else "video2_path"
    path_str = job.get(key)
    if not path_str:
        raise HTTPException(404, "Source video not found")
    path = Path(path_str)
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Source video not found")
    return FileResponse(path, media_type=_media_type(path), filename=path.name)


@app.post("/api/jobs/{job_id}/music")
async def upload_music(
    job_id: str,
    user: CurrentUser = Depends(get_current_user),
    music: UploadFile = File(...),
) -> dict:
    _require_job(job_id, user)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") in {"processing", "queued"}:
        raise HTTPException(400, "Cannot change music while processing")

    filename = music.filename or "track.mp3"
    ext = Path(filename).suffix.lower() or ".mp3"
    if ext not in AUDIO_EXTENSIONS:
        raise HTTPException(
            400, "Unsupported audio format. Use MP3, WAV, M4A, AAC, OGG, or FLAC."
        )

    ensure_dirs()
    _clear_music_files(job_id)
    dest = UPLOAD_DIR / f"{job_id}_music{ext}"
    await _save_upload(music, dest)
    duration = None
    try:
        duration = get_video_duration(dest)
    except Exception:
        duration = None
    update_job(job_id, music_path=str(dest), music_name=filename)
    return {"filename": filename, "duration": duration}


@app.delete("/api/jobs/{job_id}/music")
def delete_music(job_id: str, user: CurrentUser = Depends(get_current_user)) -> dict:
    _require_job(job_id, user)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    path_str = job.get("music_path")
    if path_str:
        Path(path_str).unlink(missing_ok=True)
    _clear_music_files(job_id)
    update_job(job_id, music_path=None, music_name=None)
    return {"ok": True}


@app.get("/api/jobs/{job_id}/music")
def get_music(job_id: str, user: CurrentUser = Depends(get_current_user)) -> FileResponse:
    _require_job(job_id, user)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    path_str = job.get("music_path")
    if not path_str:
        raise HTTPException(404, "No soundtrack uploaded")
    path = Path(path_str)
    if not path.exists():
        raise HTTPException(404, "No soundtrack uploaded")
    return FileResponse(path, media_type=_media_type(path), filename=path.name)


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
    if request.batch_name:
        update_job(job_id, batch_name=request.batch_name.strip())
    update_job(job_id, status="queued", message="Queued for processing...")
    run_in_background(run_processing, request)
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
        batch_name=job.get("batch_name"),
        batch_slug=job.get("batch_slug"),
    )


def _downloads_dir() -> Path:
    home = Path.home()
    for candidate in (home / "Downloads", home / "OneDrive" / "Downloads", home / "Desktop"):
        if candidate.exists():
            return candidate
    candidate = home / "Downloads"
    candidate.mkdir(parents=True, exist_ok=True)
    return candidate


def _unique_dest(directory: Path, filename: str) -> Path:
    dest = directory / filename
    if not dest.exists():
        return dest
    stem, suffix = dest.stem, dest.suffix
    n = 2
    while True:
        candidate = directory / f"{stem} ({n}){suffix}"
        if not candidate.exists():
            return candidate
        n += 1


def _reveal_in_explorer(path: Path) -> None:
    try:
        import subprocess

        subprocess.run(
            ["explorer", "/select,", str(path)],
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except Exception:
        pass


def _copy_to_downloads(src: Path, filename: str) -> Path:
    dest = _unique_dest(_downloads_dir(), filename)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    _reveal_in_explorer(dest)
    return dest


@app.get("/api/jobs/{job_id}/download/{filename}")
def download_short(
    job_id: str, filename: str, user: CurrentUser = Depends(get_current_user)
) -> FileResponse:
    _require_job(job_id, user)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid filename")

    path = resolve_output_dir(job_id) / filename
    if not path.exists():
        raise HTTPException(404, "File not found")

    return FileResponse(
        path,
        media_type="video/mp4",
        filename=filename,
        content_disposition_type="attachment",
    )


@app.get("/api/jobs/{job_id}/download-all")
def download_all(job_id: str, user: CurrentUser = Depends(get_current_user)) -> FileResponse:
    _require_job(job_id, user)
    zip_path = create_zip(job_id)
    if not zip_path:
        raise HTTPException(404, "No shorts available")

    job = get_job(job_id)
    slug = (job or {}).get("batch_slug") or job_id[:8]
    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=f"{slug}_shorts.zip",
        content_disposition_type="attachment",
    )


@app.post("/api/local/save/{job_id}/{filename}")
def local_save_short(
    job_id: str, filename: str, user: CurrentUser = Depends(get_current_user)
) -> dict:
    """Copy a short into the user's Downloads folder (desktop WebView)."""
    _require_job(job_id, user)
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(400, "Invalid filename")
    path = resolve_output_dir(job_id) / filename
    if not path.exists():
        raise HTTPException(404, "File not found")
    dest = _copy_to_downloads(path, filename)
    return {"ok": True, "path": str(dest)}


@app.post("/api/local/save-all/{job_id}")
def local_save_all(job_id: str, user: CurrentUser = Depends(get_current_user)) -> dict:
    """Zip all shorts and copy into Downloads (desktop WebView)."""
    _require_job(job_id, user)
    zip_path = create_zip(job_id)
    if not zip_path:
        raise HTTPException(404, "No shorts available")
    job = get_job(job_id)
    slug = (job or {}).get("batch_slug") or job_id[:8]
    dest = _copy_to_downloads(Path(zip_path), f"{slug}_shorts.zip")
    return {"ok": True, "path": str(dest)}


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


def _register_frontend() -> None:
    dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    index = dist / "index.html"
    if not index.exists():
        return

    @app.get("/")
    def frontend_root() -> FileResponse:
        return FileResponse(index)

    @app.get("/{full_path:path}")
    def frontend_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api"):
            raise HTTPException(404, "Not found")
        dist_resolved = dist.resolve()
        target = (dist / full_path).resolve()
        if not str(target).startswith(str(dist_resolved)):
            raise HTTPException(404, "Not found")
        if target.is_file():
            return FileResponse(target)
        return FileResponse(index)


_register_frontend()
