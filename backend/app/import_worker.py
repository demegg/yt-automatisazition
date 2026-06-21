import logging
from pathlib import Path

from app.downloader import download_from_url, normalize_url_label
from app.jobs import get_job, set_video_paths, update_job
from app.paths import UPLOAD_DIR

logger = logging.getLogger(__name__)


def _download_slot(job_id: str, slot: str, url: str) -> tuple[str, Path, str]:
    label = "video 1" if slot == "video1" else "video 2"
    path = UPLOAD_DIR / f"{job_id}_{slot}.mp4"

    def on_progress(message: str) -> None:
        update_job(job_id, message=f"Downloading {label}: {message}")

    update_job(job_id, message=f"Downloading {label}...")
    logger.info("Downloading %s for job %s", label, job_id)
    download_from_url(url, path, on_progress=on_progress)
    logger.info("Finished downloading %s for job %s", label, job_id)
    return slot, path, normalize_url_label(url)


def run_url_imports(
    job_id: str,
    url1: str | None,
    url2: str | None,
    path1: Path | None,
    path2: Path | None,
) -> None:
    job = get_job(job_id)
    if not job:
        return

    downloads: list[tuple[str, str]] = []
    if url1 and path1 is None:
        downloads.append(("video1", url1))
    if url2 and path2 is None:
        downloads.append(("video2", url2))

    final_path1 = path1
    final_path2 = path2

    try:
        if downloads:
            # Sequential downloads — more reliable with yt-dlp on Windows.
            for slot, url in downloads:
                slot_key, downloaded_path, _ = _download_slot(job_id, slot, url)
                if slot_key == "video1":
                    final_path1 = downloaded_path
                else:
                    final_path2 = downloaded_path

        if final_path1 is None:
            raise ValueError("Primary video was not imported")

        if not final_path1.exists() or final_path1.stat().st_size == 0:
            raise ValueError("Downloaded primary video file is missing or empty")

        set_video_paths(
            job_id,
            str(final_path1),
            str(final_path2) if final_path2 else None,
        )
        update_job(job_id, message="Videos ready!", progress=0)
        logger.info("Import complete for job %s", job_id)
    except Exception as exc:
        logger.exception("Import failed for job %s", job_id)
        update_job(
            job_id,
            status="failed",
            error=str(exc),
            message="Import failed",
        )
