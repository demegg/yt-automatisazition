import shutil
import uuid
import zipfile
from pathlib import Path

from app.captions import generate_captions_for_clip
from app.db import set_job_batch
from app.jobs import get_job, update_job
from app.models import CutMode, ProcessRequest, ShortInfo
from app.processor import burn_captions, burn_part_label, extract_segment, get_video_duration

from app.paths import (
    OUTPUT_DIR,
    UPLOAD_DIR,
    ensure_data_dirs,
    list_short_files,
    slugify_batch_name,
    unique_batch_dir,
)


def ensure_dirs() -> None:
    ensure_data_dirs()


def _clip_ranges(request: ProcessRequest, usable_duration: float) -> list[tuple[float, float]]:
    if request.cut_mode == CutMode.CUSTOM and request.clips:
        ranges: list[tuple[float, float]] = []
        for clip in request.clips:
            start = max(0.0, min(clip.start, usable_duration))
            end = max(start, min(clip.end, usable_duration))
            if end - start >= 1.0:
                ranges.append((start, end))
        if request.max_shorts:
            ranges = ranges[: request.max_shorts]
        return ranges

    trim_start = request.trim_start if request.trim_start is not None else 0.0
    trim_end = request.trim_end if request.trim_end is not None else usable_duration
    trim_start = max(0.0, min(trim_start, usable_duration))
    trim_end = max(trim_start, min(trim_end, usable_duration))
    window = trim_end - trim_start
    segment_len = request.segment_length
    total_segments = int(window // segment_len)
    if request.max_shorts:
        total_segments = min(total_segments, request.max_shorts)
    return [
        (trim_start + i * segment_len, trim_start + (i + 1) * segment_len)
        for i in range(total_segments)
    ]


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

    batch_name = (request.batch_name or job.get("batch_name") or "Untitled batch").strip()
    folder = unique_batch_dir(slugify_batch_name(batch_name))
    folder.mkdir(parents=True, exist_ok=True)
    stem = folder.name
    update_job(
        request.job_id,
        batch_name=batch_name,
        batch_slug=stem,
        output_dir=str(folder),
    )
    set_job_batch(request.job_id, batch_name, stem)

    job_output = folder

    try:
        duration1 = get_video_duration(video1)
        duration2 = get_video_duration(video2) if video2 else duration1
        usable_duration = min(duration1, duration2) if video2 else duration1

        music_path = job.get("music_path") if request.music_enabled else None
        music = Path(music_path) if music_path else None
        if music and not music.exists():
            music = None

        ranges = _clip_ranges(request, usable_duration)
        total_segments = len(ranges)

        if total_segments == 0:
            min_len = (
                1.0
                if request.cut_mode == CutMode.CUSTOM
                else float(request.segment_length)
            )
            update_job(
                request.job_id,
                status="failed",
                error=f"Video too short. Need at least {min_len} seconds in the selected range.",
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

        for i, (start, end) in enumerate(ranges):
            clip_duration = end - start
            part_num = i + 1
            part_label = f"Part {part_num}"
            raw_path = job_output / f"{stem}_Part_{part_num}_raw.mp4"
            labeled_path = job_output / f"{stem}_Part_{part_num}_labeled.mp4"
            final_path = job_output / f"{stem}_Part_{part_num}.mp4"

            update_job(
                request.job_id,
                progress=(i / total_segments) * 100,
                message=f"Creating {batch_name} {part_label} of {total_segments}...",
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
                duration=clip_duration,
                start2=start2,
                music=music,
                mute_original=request.mute_original,
                original_volume=request.original_volume,
                music_volume=request.music_volume,
            )

            burn_part_label(raw_path, labeled_path, part_num)
            raw_path.unlink(missing_ok=True)

            if request.captions_enabled:
                update_job(
                    request.job_id,
                    message=f"Adding captions to {batch_name} {part_label}...",
                )
                srt_path = job_output / f"{stem}_Part_{part_num}.srt"
                try:
                    generate_captions_for_clip(
                        labeled_path, srt_path, request.caption_style.value
                    )
                    burn_captions(
                        labeled_path,
                        final_path,
                        srt_path,
                        request.caption_style.value,
                    )
                    labeled_path.unlink(missing_ok=True)
                except Exception as caption_exc:
                    update_job(
                        request.job_id,
                        message=(
                            f"Captions failed on {part_label} "
                            f"({caption_exc}); saving without captions..."
                        ),
                    )
                    if final_path.exists():
                        final_path.unlink(missing_ok=True)
                    labeled_path.replace(final_path)
                    srt_path.unlink(missing_ok=True)
            else:
                labeled_path.replace(final_path)

            short_info = ShortInfo(
                filename=final_path.name,
                index=part_num,
                start_time=start,
                end_time=end,
                duration=clip_duration,
                title=part_label,
            )
            shorts.append(short_info)
            update_job(
                request.job_id,
                completed_shorts=part_num,
                shorts=[s.model_dump() for s in shorts],
                progress=(part_num / total_segments) * 100,
            )

        update_job(
            request.job_id,
            status="completed",
            progress=100.0,
            message=f"Done! Created {len(shorts)} shorts in {stem}.",
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
    from app.jobs import resolve_output_dir

    job_output = resolve_output_dir(job_id)
    if not job_output.exists():
        return None

    mp4_files = list_short_files(job_output)
    if not mp4_files:
        return None

    slug = job_output.name
    zip_path = job_output / f"{slug}_shorts.zip"
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

    job_output = None
    job = get_job(job_id)
    if job and job.get("output_dir"):
        job_output = Path(job["output_dir"])
    else:
        job_output = OUTPUT_DIR / job_id
    if job_output.exists():
        shutil.rmtree(job_output, ignore_errors=True)


def new_job_id() -> str:
    return str(uuid.uuid4())
