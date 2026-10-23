from pathlib import Path
import re

# Store uploads/output at project root — outside uvicorn's watched backend/ folder.
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
UPLOAD_DIR = PROJECT_ROOT / "uploads"
OUTPUT_DIR = PROJECT_ROOT / "output"
DB_PATH = DATA_DIR / "shortforge.db"


def ensure_data_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def slugify_batch_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower())
    slug = slug.strip("-")[:50]
    return slug or "batch"


def unique_batch_dir(slug: str) -> Path:
    ensure_data_dirs()
    candidate = OUTPUT_DIR / slug
    if not candidate.exists():
        return candidate
    n = 2
    while True:
        candidate = OUTPUT_DIR / f"{slug}-{n}"
        if not candidate.exists():
            return candidate
        n += 1


def list_short_files(job_output: Path) -> list[Path]:
    if not job_output.exists():
        return []
    files: list[Path] = []
    for path in job_output.iterdir():
        if not path.is_file() or path.suffix.lower() != ".mp4":
            continue
        name = path.name.lower()
        if name.endswith("_raw.mp4") or name.endswith(".zip"):
            continue
        files.append(path)
    return sorted(files, key=lambda p: p.name)


def clip_index_label(filename: str) -> str:
    stem = Path(filename).stem
    # Prefer "..._Part_12" style names
    match = re.search(r"(?:^|_)Part[_\s-]?(\d+)$", stem, flags=re.IGNORECASE)
    if match:
        return str(int(match.group(1)))
    parts = stem.rsplit("_", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return str(int(parts[1]))
    return stem
