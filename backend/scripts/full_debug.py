"""ShortForge full debug smoke test."""
from __future__ import annotations

import importlib
import os
import sys
import traceback
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

checks: list[tuple[str, str, str]] = []


def ok(name: str, fn) -> None:
    try:
        fn()
        checks.append((name, "OK", ""))
    except Exception as e:
        checks.append((name, "FAIL", f"{type(e).__name__}: {e}"))


def main() -> None:
    ok("import app.main", lambda: importlib.import_module("app.main"))
    ok("import app.desktop", lambda: importlib.import_module("app.desktop"))
    ok("import app.worker", lambda: importlib.import_module("app.worker"))
    ok("import app.processor", lambda: importlib.import_module("app.processor"))
    ok("import app.captions", lambda: importlib.import_module("app.captions"))
    ok("import app.downloader", lambda: importlib.import_module("app.downloader"))
    ok("import app.social_routes", lambda: importlib.import_module("app.social_routes"))

    from app.models import ProcessRequest

    ok(
        "ProcessRequest 5min",
        lambda: ProcessRequest(job_id="x", segment_length=300),
    )
    ok(
        "ProcessRequest reject 0",
        lambda: (
            ProcessRequest(job_id="x", segment_length=0),
            (_ for _ in ()).throw(AssertionError("should have validated")),
        ),
    )

    from app.processor import _find_font
    from app.paths import PROJECT_ROOT, OUTPUT_DIR, UPLOAD_DIR

    font = _find_font()
    print("font=", font)
    print("PROJECT_ROOT", PROJECT_ROOT)
    print("dist", (PROJECT_ROOT / "frontend" / "dist" / "index.html").exists())
    print("uploads", UPLOAD_DIR.exists(), "output", OUTPUT_DIR.exists())

    from app.db import init_db, ensure_guest_user, list_social_accounts

    ok("init_db", init_db)
    guest = ensure_guest_user()
    print("guest", guest["id"], guest["email"])
    accounts = list_social_accounts(guest["id"])
    print("social_accounts", len(accounts))
    for a in accounts:
        print(" -", a.get("platform"), a.get("display_name"))

    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    r = client.get("/api/health")
    print("health", r.status_code, r.json())
    r = client.get("/")
    print("ui_root", r.status_code, "has_root=", 'id="root"' in r.text)
    r = client.get("/api/auth/me")
    print("auth_me", r.status_code, r.json())
    r = client.get("/api/layouts")
    print("layouts", r.status_code, len(r.json()) if r.status_code == 200 else r.text[:120])
    r = client.get("/api/social/status")
    print("social_status", r.status_code, r.json() if r.status_code == 200 else r.text[:200])
    r = client.post("/api/jobs", json={"name": "Debug Batch"})
    print("create_job", r.status_code, r.json() if r.status_code < 500 else r.text[:200])
    job_id = r.json().get("job_id") if r.status_code == 200 else None
    if job_id:
        r = client.get(f"/api/jobs/{job_id}/status")
        print("job_status", r.status_code, r.json().get("status"))
        r = client.get(f"/api/jobs/{job_id}/download-all")
        print("download_all_empty", r.status_code)

    # ffmpeg encode smoke: 2s color clip + Part label
    import subprocess
    import tempfile
    from app.processor import burn_part_label, get_video_duration

    tmp = Path(tempfile.mkdtemp(prefix="sfdebug_"))
    src = tmp / "src.mp4"
    labeled = tmp / "labeled.mp4"
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "color=c=blue:s=1080x1920:d=2",
        "-f", "lavfi", "-i", "sine=f=440:d=2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        "-shortest", str(src),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
        ok("ffmpeg smoke encode", lambda: None)
        print("src_duration", get_video_duration(src))
        burn_part_label(src, labeled, 1)
        ok("burn_part_label", lambda: None)
        print("labeled_exists", labeled.exists(), "size", labeled.stat().st_size)
    except Exception as e:
        checks.append(("ffmpeg/part smoke", "FAIL", f"{type(e).__name__}: {e}"))

    print("\n=== CHECKS ===")
    fails = 0
    for name, status, err in checks:
        # expected fail for segment_length=0
        if name == "ProcessRequest reject 0" and status == "FAIL" and "ValidationError" in err:
            print(f"OK   {name} (validation works)")
            continue
        print(f"{status:4} {name}" + (f" :: {err}" if err else ""))
        if status == "FAIL":
            fails += 1
    print(f"\nTOTAL_FAILS={fails}")
    raise SystemExit(1 if fails else 0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        raise SystemExit(2)
