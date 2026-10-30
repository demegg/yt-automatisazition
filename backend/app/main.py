import logging
import os
import shutil
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

# Limit BLAS/MKL threads early to reduce Whisper/onnxruntime OOM on Windows.
for _k, _v in (
    ("OMP_NUM_THREADS", "1"),
    ("MKL_NUM_THREADS", "1"),
    ("OPENBLAS_NUM_THREADS", "1"),
    ("NUMEXPR_NUM_THREADS", "1"),
):
    os.environ.setdefault(_k, _v)

from dotenv import load_dotenv
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from apscheduler.schedulers.background import BackgroundScheduler

# Always load .env from backend folder regardless of cwd
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")

from app.auth import CurrentUser, get_current_user
from app.auth_routes import router as auth_router
from app.db import (
    assign_job_to_user,
    delete_user_job,
    init_db,
    job_belongs_to_user,
    list_user_jobs,
    mark_interrupted_jobs,
    mark_notices_read,
    read_notice_keys,
    rename_user_job,
)
from app.downloader import normalize_url_label
from app.import_worker import run_url_imports
from app.jobs import (
    create_job,
    drop_job,
    get_job,
    list_jobs_for_user,
    recover_disk_exports,
    resolve_output_dir,
    set_video_paths,
    update_job,
)
from app.models import CreateJobRequest, JobStatus, ProcessRequest
from app.paths import (
    UPLOAD_DIR,
    contained_file,
    ensure_data_dirs,
    list_short_files,
    safe_output_dir,
    slugify_batch_name,
)
from app.processor import FPS, OUTPUT_HEIGHT, OUTPUT_WIDTH, extract_poster, get_video_duration
from app.schedule_worker import process_pending_posts
from app.social_routes import router as social_router
from app.social_routes import schedule_router
from app.task_runner import run_in_background
from app.worker import cleanup_job, create_zip, new_job_id, run_processing

logger = logging.getLogger("shortforge")
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"}

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


def _scheduler_disabled() -> bool:
    return os.getenv("SHORTFORGE_DISABLE_SCHEDULER", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


@app.on_event("startup")
def startup() -> None:
    ensure_dirs()
    init_db()
    interrupted = mark_interrupted_jobs()
    if interrupted:
        logger.warning("Marked %s job(s) interrupted after restart", interrupted)
    if _scheduler_disabled():
        return
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
    update_job(job_id, status="pending", message="Waiting for a video")
    return {"job_id": job_id, "batch_name": name, "batch_slug": slug}


def _has_preview(job_id: str, video1_path: str | None) -> bool:
    """True when a poster can be made from a finished short or the uploaded source."""
    output = safe_output_dir(resolve_output_dir(job_id))
    if output is not None and output.exists() and list_short_files(output):
        return True
    if not video1_path:
        return False
    try:
        candidate = Path(video1_path).resolve()
    except OSError:
        return False
    upload_root = UPLOAD_DIR.resolve()
    return candidate.is_file() and upload_root in candidate.parents


def _public_summary(row: dict, live: dict | None) -> dict:
    video1 = (live or {}).get("video1_path") or row.get("video1_path")
    if live:
        item = {
            "job_id": row["job_id"],
            "status": live.get("status", row.get("status") or "pending"),
            "progress": live.get("progress", 0),
            "message": live.get("message"),
            "batch_name": live.get("batch_name") or row.get("batch_name"),
            "batch_slug": live.get("batch_slug") or row.get("batch_slug"),
            "total_shorts": live.get("total_shorts", 0),
            "completed_shorts": live.get("completed_shorts", 0),
            "error": live.get("error"),
            "live": True,
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }
    else:
        item = {key: value for key, value in row.items() if key != "video1_path"}
        item["live"] = False
    item["has_preview"] = _has_preview(row["job_id"], video1 if isinstance(video1, str) else None)
    return item


_NOTICE_COPY = {
    "completed": ("Export ready", "Rendering finished. Open the project to preview and download."),
    "failed": ("Processing failed", "Open the project for the error recorded by the worker."),
    "cancelled": ("Processing cancelled", "This job was cancelled before it finished."),
}


@app.get("/api/notices")
def list_notices(user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    """Events derived from this account's saved jobs. Read state is stored per user."""
    seen = read_notice_keys(user.id)
    notices: list[dict] = []
    for row in list_user_jobs(user.id, limit=100, offset=0):
        status = row.get("status") or ""
        copy = _NOTICE_COPY.get(status)
        if not copy:
            continue
        key = f"{row['job_id']}:{status}"
        title, fallback = copy
        detail = row.get("error") if status == "failed" and row.get("error") else fallback
        name = row.get("batch_name") or "Untitled"
        notices.append(
            {
                "key": key,
                "job_id": row["job_id"],
                "kind": status,
                "title": title,
                "body": f"{name}. {detail}",
                "created_at": row.get("updated_at") or row.get("created_at"),
                "read": key in seen,
            }
        )
    notices.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    return notices[:40]


@app.post("/api/notices/read")
def read_notices(body: dict, user: CurrentUser = Depends(get_current_user)) -> dict:
    raw = body.get("keys") if isinstance(body, dict) else None
    if not isinstance(raw, list):
        raise HTTPException(400, "Send a list of notice keys")
    keys = [item for item in raw if isinstance(item, str)]
    mark_notices_read(user.id, keys)
    return {"ok": True}


@app.get("/api/jobs")
def list_jobs(
    user: CurrentUser = Depends(get_current_user),
    limit: int = Query(default=48, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    """Persisted projects for this account, with live status when the worker is running."""
    rows = list_user_jobs(user.id, limit=limit, offset=offset)
    for row in rows:
        if row.get("completed_shorts"):
            continue
        if row.get("status") in {"saved", "uploaded", "completed"}:
            recover_disk_exports(row["job_id"])
    live = {j["job_id"]: j for j in list_jobs_for_user(user.id)}
    return [_public_summary(row, live.get(row["job_id"])) for row in rows]


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


def _max_upload_bytes() -> int:
    try:
        mb = int(os.getenv("MAX_UPLOAD_MB", "2048"))
    except ValueError:
        mb = 2048
    mb = min(max(mb, 1), 8192)
    return mb * 1024 * 1024


def _reject_huge_request(request: Request) -> None:
    raw = request.headers.get("content-length")
    if not raw:
        return
    try:
        size = int(raw)
    except ValueError:
        return
    if size > _max_upload_bytes() * 2 + 2_000_000:
        raise HTTPException(413, "Upload is larger than the server limit")


def _video_suffix(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(
            400,
            "Unsupported video format. Use MP4, MOV, MKV, WebM, AVI, or M4V.",
        )
    return ext


async def _save_upload(upload: UploadFile, dest: Path) -> None:
    limit = _max_upload_bytes()
    total = 0
    try:
        with dest.open("wb") as handle:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > limit:
                    raise HTTPException(
                        413,
                        f"File exceeds the {limit // (1024 * 1024)} MB upload limit",
                    )
                handle.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    if total == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "Uploaded file is empty")


def _http_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _media_type(path: Path) -> str:
    return MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")


def _clear_music_files(job_id: str) -> None:
    for old in UPLOAD_DIR.glob(f"{job_id}_music.*"):
        old.unlink(missing_ok=True)


@app.post("/api/jobs/{job_id}/upload")
async def upload_videos(
    job_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
    video1: UploadFile | None = File(None),
    video1_url: str | None = Form(None),
    video2: UploadFile | None = File(None),
    video2_url: str | None = Form(None),
) -> dict:
    _require_job(job_id, user)
    _reject_huge_request(request)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") in {"processing", "queued"}:
        raise HTTPException(409, "This project is already processing")

    has_video1 = (video1 and video1.filename) or (video1_url and video1_url.strip())
    if not has_video1:
        raise HTTPException(400, "Primary video requires a file upload or URL")

    ensure_dirs()

    url1 = video1_url.strip() if video1_url and video1_url.strip() else None
    url2 = video2_url.strip() if video2_url and video2_url.strip() else None
    if url1 and not _http_url(url1):
        raise HTTPException(400, "Primary link must be an http or https URL")
    if url2 and not _http_url(url2):
        raise HTTPException(400, "Second link must be an http or https URL")

    path1: Path | None = None
    path2: Path | None = None
    label1: str | None = None
    label2: str | None = None

    try:
        if video1 and video1.filename:
            ext = _video_suffix(video1.filename)
            path1 = UPLOAD_DIR / f"{job_id}_video1{ext}"
            await _save_upload(video1, path1)
            label1 = video1.filename
        elif url1:
            label1 = normalize_url_label(url1)

        if video2 and video2.filename:
            ext = _video_suffix(video2.filename)
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
    except Exception:
        logger.exception("Failed to import video for job %s", job_id)
        raise HTTPException(500, "Failed to import video")

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
    path = Path(path_str).resolve()
    upload_root = UPLOAD_DIR.resolve()
    if not path.is_file() or (path != upload_root and upload_root not in path.parents):
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
    path = Path(path_str).resolve()
    upload_root = UPLOAD_DIR.resolve()
    if not path.is_file() or (path != upload_root and upload_root not in path.parents):
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
    if job.get("status") in {"queued", "processing"}:
        raise HTTPException(409, "This project is already processing")

    request.job_id = job_id
    if request.batch_name:
        update_job(job_id, batch_name=request.batch_name.strip())
    update_job(job_id, status="queued", message="Queued for processing...")
    run_in_background(run_processing, request)
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}/status", response_model=JobStatus)
def job_status(job_id: str, user: CurrentUser = Depends(get_current_user)) -> JobStatus:
    _require_job(job_id, user)
    recover_disk_exports(job_id)
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


def _job_output_file(job_id: str, filename: str) -> Path:
    root = safe_output_dir(resolve_output_dir(job_id))
    if root is None:
        raise HTTPException(404, "File not found")
    path = contained_file(root, filename)
    if path is None or not path.is_file():
        raise HTTPException(404, "File not found")
    return path


@app.get("/api/jobs/{job_id}/download/{filename}")
def download_short(
    job_id: str, filename: str, user: CurrentUser = Depends(get_current_user)
) -> FileResponse:
    _require_job(job_id, user)
    path = _job_output_file(job_id, filename)
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=path.name,
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
    path = _job_output_file(job_id, filename)
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


@app.get("/api/capabilities")
def capabilities() -> dict:
    try:
        mb = int(os.getenv("MAX_UPLOAD_MB", "2048"))
    except ValueError:
        mb = 2048
    from app.auth import auth_required

    return {
        "output": {
            "width": OUTPUT_WIDTH,
            "height": OUTPUT_HEIGHT,
            "aspect": "9:16",
            "container": "mp4",
            "video_codec": "h264",
            "audio_codec": "aac",
            "fps": FPS,
            "crf": 23,
        },
        "max_upload_mb": min(max(mb, 1), 8192),
        "video_extensions": sorted(VIDEO_EXTENSIONS),
        "audio_extensions": sorted(AUDIO_EXTENSIONS),
        "captions": "Optional. faster-whisper runs on the server and burns subtitles into each short.",
        "url_import": (
            "Links are downloaded with yt-dlp when the host allows it. "
            "Many YouTube, TikTok, and Instagram URLs fail because of provider restrictions. "
            "A file upload is the reliable path."
        ),
        "billing": False,
        "password_reset_email": False,
        "auth_required": auth_required(),
        "storage": (
            "Video files stay on the server disk. They are not stored inside database rows. "
            "Development and the default deployment use local folders. "
            "Object storage is not wired up."
        ),
        "retention": (
            "Files remain until you delete the project or an operator removes them from disk. "
            "If the server restarts mid-job, that job is marked failed."
        ),
    }


@app.patch("/api/jobs/{job_id}")
def rename_job(
    job_id: str,
    body: CreateJobRequest,
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    _require_job(job_id, user)
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Give this project a name")
    rename_user_job(job_id, name)
    update_job(job_id, batch_name=name)
    return {"job_id": job_id, "batch_name": name}


@app.delete("/api/jobs/{job_id}")
def remove_job(job_id: str, user: CurrentUser = Depends(get_current_user)) -> dict:
    _require_job(job_id, user)
    job = get_job(job_id)
    if job and job.get("status") in {"processing", "queued", "importing"}:
        raise HTTPException(409, "Cancel processing before deleting this project")
    cleanup_job(job_id)
    drop_job(job_id)
    delete_user_job(job_id)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str, user: CurrentUser = Depends(get_current_user)) -> dict:
    _require_job(job_id, user)
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    status = job.get("status")
    if status == "queued":
        update_job(
            job_id,
            status="cancelled",
            cancel_requested=True,
            message="Cancelled before processing started",
            error=None,
        )
        return {"job_id": job_id, "status": "cancelled"}
    if status in {"processing", "importing"}:
        update_job(
            job_id,
            cancel_requested=True,
            message="Cancelling after the current step finishes",
        )
        return {
            "job_id": job_id,
            "status": status,
            "message": "Cancelling after the current step finishes",
        }
    raise HTTPException(400, "This project is not running")


@app.get("/api/jobs/{job_id}/poster")
def job_poster(job_id: str, user: CurrentUser = Depends(get_current_user)) -> FileResponse:
    _require_job(job_id, user)
    source: Path | None = None
    output = safe_output_dir(resolve_output_dir(job_id))
    if output and output.exists():
        shorts = list_short_files(output)
        if shorts:
            source = shorts[0]
    if source is None:
        job = get_job(job_id)
        raw = (job or {}).get("video1_path")
        if raw:
            candidate = Path(raw).resolve()
            upload_root = UPLOAD_DIR.resolve()
            if candidate.is_file() and (
                candidate == upload_root or upload_root in candidate.parents
            ):
                source = candidate
    if source is None:
        raise HTTPException(404, "No preview available")
    poster = UPLOAD_DIR / f"{job_id}_poster.jpg"
    if not poster.exists() or poster.stat().st_mtime < source.stat().st_mtime:
        if not extract_poster(source, poster):
            raise HTTPException(404, "No preview available")
    return FileResponse(poster, media_type="image/jpeg")


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
