import shutil
import uuid
import zipfile
from pathlib import Path

from app.captions import generate_captions_for_clip
from app.jobs import get_job, update_job
from app.models import ProcessRequest, ShortInfo
from app.processor import burn_captions, extract_segment, get_video_duration

from app.paths import OUTPUT_DIR, UPLOAD_DIR, ensure_data_dirs


def ensure_dirs() -> None:
    ensure_data_dirs()


def run_processing(request: ProcessRequest) -> None:
    ensure_dirs()
    job = get_job(request.job_id)
    if not job or not job.get("video1_path"):
        update_job(request.job_id, status="failed", error="Missing uploaded video")
        return

    video1 = Path(job["video1_path"])
    video2_path = job.get("video2_path")
    video2 = Path(video2_path) if video2_path else None

    layout = request.layout.value
    if video2 is None:
        layout = "single"

    job_output = OUTPUT_DIR / request.job_id
    job_output.mkdir(parents=True, exist_ok=True)

    try:
        duration1 = get_video_duration(video1)
        duration2 = get_video_duration(video2) if video2 else duration1
        usable_duration = min(duration1, duration2) if video2 else duration1

        segment_len = request.segment_length.value
        total_segments = int(usable_duration // segment_len)

        if request.max_shorts:
            total_segments = min(total_segments, request.max_shorts)

        if total_segments == 0:
            update_job(
                request.job_id,
                status="failed",
                error=f"Video too short. Need at least {segment_len} seconds.",
            )
            return

        update_job(
            request.job_id,
            status="processing",
            progress=0.0,
            message="Analyzing video...",
            total_shorts=total_segments,
            completed_shorts=0,
            shorts=[],
        )

        shorts: list[ShortInfo] = []

        for i in range(total_segments):
            start = i * segment_len
            end = start + segment_len
            raw_path = job_output / f"short_{i + 1:03d}_raw.mp4"
            final_path = job_output / f"short_{i + 1:03d}.mp4"

            update_job(
                request.job_id,
                progress=(i / total_segments) * 100,
                message=f"Creating short {i + 1} of {total_segments}...",
            )

            start2 = start if video2 else None
            if video2 and start >= duration2:
                break

            extract_segment(
                video1=video1,
                video2=video2,
                output=raw_path,
                layout=layout,
                start=start,
                duration=segment_len,
                start2=start2,
            )

            if request.captions_enabled:
                update_job(
                    request.job_id,
                    message=f"Adding captions to short {i + 1}...",
                )
                srt_path = job_output / f"short_{i + 1:03d}.srt"
                generate_captions_for_clip(
                    raw_path, srt_path, request.caption_style.value
                )
                burn_captions(
                    raw_path,
                    final_path,
                    srt_path,
                    request.caption_style.value,
                )
                raw_path.unlink(missing_ok=True)
            else:
                raw_path.rename(final_path)

            short_info = ShortInfo(
                filename=final_path.name,
                index=i + 1,
                start_time=start,
                end_time=end,
                duration=segment_len,
            )
            shorts.append(short_info)
            update_job(
                request.job_id,
                completed_shorts=i + 1,
                shorts=[s.model_dump() for s in shorts],
                progress=((i + 1) / total_segments) * 100,
            )

        update_job(
            request.job_id,
            status="completed",
            progress=100.0,
            message=f"Done! Created {len(shorts)} shorts.",
            shorts=[s.model_dump() for s in shorts],
        )
    except Exception as exc:
        update_job(
            request.job_id,
            status="failed",
            error=str(exc),
            message="Processing failed",
        )


def create_zip(job_id: str) -> Path | None:
    job_output = OUTPUT_DIR / job_id
    if not job_output.exists():
        return None

    mp4_files = sorted(job_output.glob("short_*.mp4"))
    if not mp4_files:
        return None

    zip_path = job_output / "all_shorts.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in mp4_files:
            zf.write(f, f.name)

    return zip_path


def cleanup_job(job_id: str) -> None:
    upload1 = UPLOAD_DIR / f"{job_id}_video1"
    upload2 = UPLOAD_DIR / f"{job_id}_video2"
    for p in upload1.parent.glob(f"{job_id}_*"):
        if p.is_file():
            p.unlink(missing_ok=True)

    job_output = OUTPUT_DIR / job_id
    if job_output.exists():
        shutil.rmtree(job_output, ignore_errors=True)


def new_job_id() -> str:
    return str(uuid.uuid4())
