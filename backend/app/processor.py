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


def extract_poster(source: Path, dest: Path) -> bool:
    """Write one JPEG frame for library previews. Failures are non-fatal."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        _run_ffmpeg(
            [
                "-ss",
                "0.4",
                "-i",
                str(source),
                "-frames:v",
                "1",
                "-vf",
                "scale=480:-2",
                str(dest),
            ],
            timeout=40,
        )
    except (RuntimeError, subprocess.TimeoutExpired, OSError):
        return False
    return dest.exists() and dest.stat().st_size > 0


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


def _encode_args(output: Path, with_audio: bool = True) -> list[str]:
    args = [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
    ]
    if with_audio:
        args += ["-c:a", "aac", "-b:a", "192k"]
    else:
        args += ["-an"]
    args += [
        "-r",
        str(FPS),
        "-movflags",
        "+faststart",
        str(output),
    ]
    return args


def _audio_mix_filter(
    orig_input: int,
    orig_has_audio: bool,
    mute_original: bool,
    original_volume: float,
    music_idx: int | None,
    music_volume: float,
    duration: float,
) -> tuple[str, list[str], bool]:
    """Build audio filter_complex fragment, extra -map args, and whether output has audio."""
    use_orig = orig_has_audio and not mute_original and original_volume > 0.001
    use_music = music_idx is not None and music_volume > 0.001
    fade_d = min(0.5, duration * 0.15) if use_music else 0.0
    fade_out_st = max(0.0, duration - fade_d)

    def prep(idx: int, vol: float, name: str, fade: bool) -> str:
        chain = (
            f"[{idx}:a]volume={vol:.4f},"
            f"aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,"
            f"atrim=0:{duration:.4f},asetpts=PTS-STARTPTS"
        )
        if fade and fade_d >= 0.08:
            chain += (
                f",afade=t=in:st=0:d={fade_d:.3f}"
                f",afade=t=out:st={fade_out_st:.3f}:d={fade_d:.3f}"
            )
        return f"{chain}[{name}]"

    if use_orig and use_music:
        assert music_idx is not None
        fc = (
            f"{prep(orig_input, original_volume, 'aorig', False)};"
            f"{prep(music_idx, music_volume, 'amus', True)};"
            "[aorig][amus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]"
        )
        return fc, ["-map", "[aout]"], True
    if use_music:
        assert music_idx is not None
        return prep(music_idx, music_volume, "aout", True), ["-map", "[aout]"], True
    if use_orig and abs(original_volume - 1.0) > 0.01:
        return prep(orig_input, original_volume, "aout", False), ["-map", "[aout]"], True
    if use_orig:
        return "", ["-map", f"{orig_input}:a?"], True
    return "", [], False


def extract_segment(
    video1: Path,
    video2: Path | None,
    output: Path,
    layout: str,
    start: float,
    duration: float,
    start2: float | None = None,
    music: Path | None = None,
    mute_original: bool = False,
    original_volume: float = 1.0,
    music_volume: float = 0.35,
) -> None:
    has_second = video2 is not None and layout != "single"
    timeout = _ffmpeg_timeout(duration, dual=has_second)
    orig_has_audio = has_audio_stream(video1)
    use_music = music is not None and music.exists()
    if use_music and not has_audio_stream(music):
        use_music = False
    need_mix = (
        use_music
        or mute_original
        or (orig_has_audio and abs(original_volume - 1.0) > 0.01)
    )

    args: list[str] = ["-ss", str(start), "-i", str(video1)]
    if has_second:
        assert video2 is not None
        s2 = start2 if start2 is not None else start
        args += ["-ss", str(s2), "-i", str(video2)]
    music_idx: int | None = None
    if use_music:
        assert music is not None
        music_idx = 2 if has_second else 1
        args += ["-stream_loop", "-1", "-i", str(music)]
    args += ["-t", str(duration)]

    if not need_mix:
        if not has_second or layout == "single":
            args += [
                "-vf",
                _scale_crop_filter(OUTPUT_WIDTH, OUTPUT_HEIGHT),
                *_encode_args(output, with_audio=True),
            ]
            _run_ffmpeg(args, timeout=timeout)
            return

        audio_maps = _audio_map_primary_only(orig_has_audio)
        args += [
            "-filter_complex",
            _video_filter_for_layout(layout),
            "-map",
            "[vout]",
            *audio_maps,
            *_encode_args(output, with_audio=bool(audio_maps)),
        ]
        _run_ffmpeg(args, timeout=timeout)
        return

    if not has_second or layout == "single":
        video_fc = f"[0:v]{_scale_crop_filter(OUTPUT_WIDTH, OUTPUT_HEIGHT)}[vout]"
    else:
        video_fc = _video_filter_for_layout(layout)

    audio_fc, audio_maps, with_audio = _audio_mix_filter(
        orig_input=0,
        orig_has_audio=orig_has_audio,
        mute_original=mute_original,
        original_volume=original_volume,
        music_idx=music_idx,
        music_volume=music_volume,
        duration=duration,
    )
    fc = f"{video_fc};{audio_fc}" if audio_fc else video_fc
    args += ["-filter_complex", fc, "-map", "[vout]", *audio_maps]
    args += _encode_args(output, with_audio=with_audio)
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


def _find_font() -> str | None:
    candidates = [
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return str(path).replace("\\", "/").replace(":", "\\:")
    return None


def burn_part_label(input_path: Path, output_path: Path, part_number: int) -> None:
    """Burn 'Part N' into the top of the clip."""
    label = f"Part {part_number}"
    font = _find_font()
    font_opt = f":fontfile='{font}'" if font else ""
    # Escape drawtext special chars
    text = label.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    vf = (
        f"drawtext=text='{text}'{font_opt}:fontsize=56:fontcolor=white:"
        f"borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.07"
    )
    duration = get_video_duration(input_path)
    args = [
        "-i",
        str(input_path),
        "-vf",
        vf,
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
    _run_ffmpeg(args, timeout=_ffmpeg_timeout(duration))
