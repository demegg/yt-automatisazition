import re
from pathlib import Path

from faster_whisper import WhisperModel


def _format_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def _split_into_chunks(text: str, max_words: int = 4) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks = []
    for i in range(0, len(words), max_words):
        chunks.append(" ".join(words[i : i + max_words]))
    return chunks


def segments_to_srt(segments: list[dict], style: str = "tiktok") -> str:
    lines: list[str] = []
    index = 1
    max_words = 3 if style == "tiktok" else 5

    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue
        start = seg["start"]
        end = seg["end"]
        chunks = _split_into_chunks(text, max_words)

        if not chunks:
            continue

        chunk_duration = (end - start) / len(chunks)
        for i, chunk in enumerate(chunks):
            chunk_start = start + i * chunk_duration
            chunk_end = start + (i + 1) * chunk_duration
            lines.append(str(index))
            lines.append(
                f"{_format_timestamp(chunk_start)} --> {_format_timestamp(chunk_end)}"
            )
            lines.append(chunk.upper() if style in ("tiktok", "karaoke") else chunk)
            lines.append("")
            index += 1

    return "\n".join(lines)


_model_cache: WhisperModel | None = None


def get_whisper_model() -> WhisperModel:
    global _model_cache
    if _model_cache is None:
        _model_cache = WhisperModel("base", device="cpu", compute_type="int8")
    return _model_cache


def generate_captions_for_clip(
    video_path: Path,
    output_srt: Path,
    style: str = "tiktok",
) -> None:
    model = get_whisper_model()
    segments_iter, _info = model.transcribe(str(video_path), beam_size=5)
    segments = [
        {"start": seg.start, "end": seg.end, "text": seg.text.strip()}
        for seg in segments_iter
        if seg.text.strip()
    ]
    srt_content = segments_to_srt(segments, style)
    output_srt.write_text(srt_content, encoding="utf-8")


def sanitize_srt_text(text: str) -> str:
    return re.sub(r"[^\w\s\.,!?'-]", "", text)
