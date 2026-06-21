import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.paths import DB_PATH

c = sqlite3.connect(DB_PATH)
for name in ("posted_clips", "scheduled_posts"):
    row = c.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    print(name, ":", row[0] if row else "missing")
