from collections.abc import Callable
from pathlib import Path
from urllib.parse import urlparse

import httpx

VIDEO_EXTENSIONS = {".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"}

# Flexible format — strict 720p mp4 first, then broader fallbacks.
YTDLP_FORMAT = (
    "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/"
    "bestvideo[height<=720]+bestaudio/"
    "best[height<=720]/best"
)


def _is_valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _looks_like_direct_video(url: str) -> bool:
    path = urlparse(url.strip()).path.lower()
    return any(path.endswith(ext) for ext in VIDEO_EXTENSIONS)


def _download_direct(
    url: str,
    output_path: Path,
    on_progress: Callable[[str], None] | None = None,
    timeout: int = 600,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True, timeout=timeout) as resp:
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "video" not in content_type and not _looks_like_direct_video(url):
            raise ValueError(
                "URL does not point to a direct video file. "
                "Use a YouTube/TikTok link or a direct .mp4 URL."
            )
        total = int(resp.headers.get("content-length", 0))
        downloaded = 0
        with output_path.open("wb") as f:
            for chunk in resp.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if on_progress and total > 0:
                    pct = downloaded * 100 // total
                    on_progress(f"{pct}%")
    return output_path


def _download_with_ytdlp(
    url: str,
    output_path: Path,
    on_progress: Callable[[str], None] | None = None,
) -> Path:
    import yt_dlp

    output_path.parent.mkdir(parents=True, exist_ok=True)
    stem = output_path.with_suffix("")
    outtmpl = str(stem) + ".%(ext)s"

    def progress_hook(d: dict) -> None:
        if on_progress and d.get("status") == "downloading":
            pct = (d.get("_percent_str") or "").strip()
            if pct:
                on_progress(pct)

    ydl_opts = {
        "format": YTDLP_FORMAT,
        "outtmpl": outtmpl,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "concurrent_fragment_downloads": 5,
        "retries": 3,
        "progress_hooks": [progress_hook],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if info is None:
            raise ValueError("Could not fetch video from URL")

    candidates = sorted(
        output_path.parent.glob(f"{stem.name}.*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for candidate in candidates:
        if candidate.suffix.lower() in VIDEO_EXTENSIONS | {".mp4"}:
            if candidate != output_path:
                candidate.rename(output_path)
            return output_path

    raise ValueError("Download finished but no video file was found")


def download_from_url(
    url: str,
    output_path: Path,
    on_progress: Callable[[str], None] | None = None,
) -> Path:
    url = url.strip()
    if not _is_valid_url(url):
        raise ValueError("Invalid URL. Use http:// or https://")

    if output_path.suffix.lower() not in VIDEO_EXTENSIONS:
        output_path = output_path.with_suffix(".mp4")

    if _looks_like_direct_video(url):
        try:
            return _download_direct(url, output_path, on_progress=on_progress)
        except httpx.HTTPError:
            pass

    try:
        return _download_with_ytdlp(url, output_path, on_progress=on_progress)
    except Exception as exc:
        raise ValueError(f"Failed to download video: {exc}") from exc


def normalize_url_label(url: str) -> str:
    parsed = urlparse(url.strip())
    host = parsed.netloc.replace("www.", "")
    if "youtube" in host or "youtu.be" in host:
        return "YouTube video"
    if "tiktok" in host:
        return "TikTok video"
    if "instagram" in host:
        return "Instagram video"
    return host or "Video link"
