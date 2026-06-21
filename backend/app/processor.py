import json
import subprocess
from pathlib import Path

OUTPUT_WIDTH = 1080
OUTPUT_HEIGHT = 1920
FPS = 30


def _ffmpeg_timeout(duration: float, dual: bool = False) -> int:
    base = 300 if dual else 180
    return max(base, int(duration * 15) + 120)


def _run_ffmpeg(args: list[str], timeout: int | None = None) -> None:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        err = result.stderr.strip() or "FFmpeg failed"
        raise RuntimeError(err)


def get_video_duration(path: str | Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    return float(data["format"]["duration"])


def has_audio_stream(path: Path) -> bool:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index",
        "-of",
        "csv=p=0",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return bool(result.stdout.strip())


def _scale_crop_filter(width: int, height: int) -> str:
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1"
    )


def _video_filter_for_layout(layout: str) -> str:
    half_w = OUTPUT_WIDTH // 2
    half_h = OUTPUT_HEIGHT // 2
    pip_w = int(OUTPUT_WIDTH * 0.35)
    pip_h = int(OUTPUT_HEIGHT * 0.25)
    base = _scale_crop_filter(OUTPUT_WIDTH, OUTPUT_HEIGHT)

    if layout == "stack_vertical":
        top = _scale_crop_filter(OUTPUT_WIDTH, half_h)
        bottom = _scale_crop_filter(OUTPUT_WIDTH, half_h)
        return (
            f"[0:v]{top}[top];"
            f"[1:v]{bottom}[bot];"
            f"[top][bot]vstack=inputs=2[vout]"
        )
    if layout == "stack_horizontal":
        left = _scale_crop_filter(half_w, OUTPUT_HEIGHT)
        right = _scale_crop_filter(half_w, OUTPUT_HEIGHT)
        return (
            f"[0:v]{left}[left];"
            f"[1:v]{right}[right];"
            f"[left][right]hstack=inputs=2[vout]"
        )
    if layout == "picture_in_picture":
        main = _scale_crop_filter(OUTPUT_WIDTH, OUTPUT_HEIGHT)
        pip = _scale_crop_filter(pip_w, pip_h)
        return (
            f"[0:v]{main}[main];"
            f"[1:v]{pip}[pip];"
            f"[main][pip]overlay=W-w-40:H-h-120[vout]"
        )
    if layout == "main_with_reaction":
        main = _scale_crop_filter(OUTPUT_WIDTH, int(OUTPUT_HEIGHT * 0.72))
        react = _scale_crop_filter(OUTPUT_WIDTH, int(OUTPUT_HEIGHT * 0.28))
        return (
            f"[0:v]{main}[main];"
            f"[1:v]{react}[react];"
            f"[main][react]vstack=inputs=2[vout]"
        )
    return f"[0:v]{base}[vout]"


def _audio_map_primary_only(has_audio: bool) -> list[str]:
    """Dual layouts: only primary video (input 0) audio; secondary is always silent."""
    if has_audio:
        return ["-map", "0:a?"]
    return []


def _encode_args(output: Path) -> list[str]:
    return [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-r",
        str(FPS),
        "-movflags",
        "+faststart",
        str(output),
    ]


def extract_segment(
    video1: Path,
    video2: Path | None,
    output: Path,
    layout: str,
    start: float,
    duration: float,
    start2: float | None = None,
) -> None:
    has_second = video2 is not None and layout != "single"
    timeout = _ffmpeg_timeout(duration, dual=has_second)

    if not has_second or layout == "single":
        args = [
            "-ss",
            str(start),
            "-i",
            str(video1),
            "-t",
            str(duration),
            "-vf",
            _scale_crop_filter(OUTPUT_WIDTH, OUTPUT_HEIGHT),
            *_encode_args(output),
        ]
        _run_ffmpeg(args, timeout=timeout)
        return

    assert video2 is not None
    s2 = start2 if start2 is not None else start
    audio1 = has_audio_stream(video1)

    video_filter = _video_filter_for_layout(layout)
    audio_maps = _audio_map_primary_only(audio1)

    args = [
        "-ss",
        str(start),
        "-i",
        str(video1),
        "-ss",
        str(s2),
        "-i",
        str(video2),
        "-t",
        str(duration),
        "-filter_complex",
        video_filter,
        "-map",
        "[vout]",
        *audio_maps,
        *_encode_args(output),
    ]
    _run_ffmpeg(args, timeout=timeout)


def burn_captions(
    input_path: Path,
    output_path: Path,
    srt_path: Path,
    style: str = "tiktok",
) -> None:
    import shutil
    import tempfile

    styles = {
        "tiktok": (
            "FontName=Arial Black,FontSize=22,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00000000,Outline=3,Shadow=2,Alignment=2,MarginV=80,Bold=1"
        ),
        "bold_center": (
            "FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=100,Bold=1"
        ),
        "minimal": (
            "FontName=Helvetica,FontSize=18,PrimaryColour=&H00FFFFFF,"
            "OutlineColour=&H00444444,Outline=1,Alignment=2,MarginV=60"
        ),
        "karaoke": (
            "FontName=Impact,FontSize=26,PrimaryColour=&H0000FFFF,"
            "OutlineColour=&H00000000,Outline=3,Alignment=2,MarginV=90,Bold=1"
        ),
    }
    force_style = styles.get(style, styles["tiktok"])

    with tempfile.NamedTemporaryFile(suffix=".srt", delete=False) as tmp:
        tmp_srt = Path(tmp.name)
    shutil.copy(srt_path, tmp_srt)
    srt_escaped = str(tmp_srt).replace("\\", "/").replace(":", "\\:")

    try:
        args = [
            "-i",
            str(input_path),
            "-vf",
            f"subtitles='{srt_escaped}':force_style='{force_style}'",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "copy",
            str(output_path),
        ]
        _run_ffmpeg(args, timeout=600)
    finally:
        tmp_srt.unlink(missing_ok=True)
