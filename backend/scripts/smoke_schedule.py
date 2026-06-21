"""Smoke test for YouTube/TikTok scheduling API and worker (no real uploads)."""
from __future__ import annotations

import shutil
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.db import get_conn, init_db, list_social_accounts, save_social_account  # noqa: E402
from app.main import app  # noqa: E402
from app.paths import OUTPUT_DIR  # noqa: E402
from app.schedule_worker import process_pending_posts  # noqa: E402

JOB_ID = "smoke-test-job-001"
PASS = 0
FAIL = 0


def ok(name: str, detail: str = "") -> None:
    global PASS
    PASS += 1
    suffix = f" — {detail}" if detail else ""
    print(f"  PASS  {name}{suffix}")


def fail(name: str, detail: str = "") -> None:
    global FAIL
    FAIL += 1
    suffix = f" — {detail}" if detail else ""
    print(f"  FAIL  {name}{suffix}")


def ensure_test_shorts() -> None:
    job_dir = OUTPUT_DIR / JOB_ID
    job_dir.mkdir(parents=True, exist_ok=True)
    for i in (1, 2):
        dest = job_dir / f"short_{i:03d}.mp4"
        if dest.exists() and dest.stat().st_size > 1000:
            continue
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=duration=3:size=1080x1920:rate=30",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-an",
                str(dest),
            ],
            capture_output=True,
            check=True,
        )


def ensure_test_accounts() -> tuple[int, int]:
    accounts = list_social_accounts()
    yt = next((a for a in accounts if a["platform"] == "youtube"), None)
    tt = next((a for a in accounts if a["platform"] == "tiktok"), None)
    if not yt:
        yt_id = save_social_account(
            "youtube",
            "Smoke Test YouTube",
            "fake-yt-token",
            "fake-yt-refresh",
            datetime.utcnow() + timedelta(days=1),
        )
    else:
        yt_id = yt["id"]
    if not tt:
        tt_id = save_social_account(
            "tiktok",
            "Smoke Test TikTok",
            "fake-tt-token",
            "fake-tt-refresh",
            datetime.utcnow() + timedelta(days=1),
        )
    else:
        tt_id = tt["id"]
    return int(yt_id), int(tt_id)


def clear_smoke_schedules() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM scheduled_posts WHERE job_id = ?", (JOB_ID,))
        conn.execute("DELETE FROM posted_clips WHERE job_id = ?", (JOB_ID,))


def run_api_tests(client: TestClient, yt_id: int, tt_id: int) -> None:
    r = client.get("/api/social/status")
    if r.status_code == 200 and "accounts" in r.json():
        ok("GET /api/social/status")
    else:
        fail("GET /api/social/status", r.text)
        return

    r = client.get(
        f"/api/jobs/{JOB_ID}/schedule/preview",
        params={
            "posts_per_day": 2,
            "youtube_account_id": yt_id,
            "tiktok_account_id": tt_id,
        },
    )
    if r.status_code == 200:
        data = r.json()
        yt = data.get("platforms", {}).get("youtube", {})
        tt = data.get("platforms", {}).get("tiktok", {})
        if yt.get("available_to_schedule", 0) >= 2 and tt.get("available_to_schedule", 0) >= 2:
            ok("GET schedule preview", f"yt={yt['available_to_schedule']} tt={tt['available_to_schedule']}")
        else:
            fail("GET schedule preview", str(data))
    else:
        fail("GET schedule preview", r.text)

    r = client.post(
        f"/api/jobs/{JOB_ID}/schedule",
        json={
            "accounts": [
                {"platform": "youtube", "account_id": yt_id},
                {"platform": "tiktok", "account_id": tt_id},
            ],
            "posts_per_day": 2,
            "window_start_hour": 9,
            "window_end_hour": 21,
            "title_prefix": "Smoke",
        },
    )
    if r.status_code == 200 and r.json().get("total_scheduled", 0) >= 4:
        ok("POST schedule", f"total={r.json()['total_scheduled']}")
    else:
        fail("POST schedule", r.text)

    r = client.get(f"/api/jobs/{JOB_ID}/schedule")
    if r.status_code == 200:
        schedules = r.json().get("schedules", [])
        platforms = {s["platform"] for s in schedules}
        if "youtube" in platforms and "tiktok" in platforms:
            ok("GET schedule list", f"{len(schedules)} posts queued")
        else:
            fail("GET schedule list", str(platforms))
    else:
        fail("GET schedule list", r.text)


def run_worker_test(yt_id: int, tt_id: int) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE scheduled_posts
            SET scheduled_at = ?, status = 'pending'
            WHERE job_id = ? AND status = 'pending'
            """,
            ((datetime.utcnow() - timedelta(minutes=1)).isoformat(), JOB_ID),
        )
        row = conn.execute(
            """
            SELECT id FROM scheduled_posts
            WHERE job_id = ? AND platform = 'youtube' LIMIT 1
            """,
            (JOB_ID,),
        ).fetchone()
        yt_post_id = row["id"] if row else None

    with (
        patch("app.schedule_worker.youtube_upload", return_value="yt-smoke-video-id"),
        patch("app.schedule_worker.tiktok_upload", return_value="tt-smoke-publish-id"),
    ):
        process_pending_posts()

    with get_conn() as conn:
        posted = conn.execute(
            """
            SELECT platform, status, platform_video_id, error
            FROM scheduled_posts WHERE job_id = ?
            """,
            (JOB_ID,),
        ).fetchall()

    yt_posted = [r for r in posted if r["platform"] == "youtube" and r["status"] == "posted"]
    tt_posted = [r for r in posted if r["platform"] == "tiktok" and r["status"] == "posted"]
    yt_failed = [r for r in posted if r["platform"] == "youtube" and r["status"] == "failed"]
    tt_failed = [r for r in posted if r["platform"] == "tiktok" and r["status"] == "failed"]

    if yt_posted and yt_posted[0]["platform_video_id"] == "yt-smoke-video-id":
        ok("Worker YouTube upload (mocked)")
    elif yt_failed:
        fail("Worker YouTube upload", yt_failed[0]["error"] or "failed")
    else:
        fail("Worker YouTube upload", "no posted row")

    if tt_posted and tt_posted[0]["platform_video_id"] == "tt-smoke-publish-id":
        ok("Worker TikTok upload (mocked)")
    elif tt_failed:
        fail("Worker TikTok upload", tt_failed[0]["error"] or "failed")
    else:
        fail("Worker TikTok upload", "no posted row")

    if yt_post_id:
        with get_conn() as conn:
            dup = conn.execute(
                """
                SELECT COUNT(*) AS c FROM scheduled_posts
                WHERE job_id = ? AND platform = 'youtube'
                  AND filename = (
                    SELECT filename FROM scheduled_posts WHERE id = ?
                  )
                """,
                (JOB_ID, yt_post_id),
            ).fetchone()["c"]
        if dup == 1:
            ok("Dedup per account (single row per clip)")
        else:
            fail("Dedup per account", f"count={dup}")


def main() -> int:
    if not shutil.which("ffmpeg"):
        print("ffmpeg not found — install ffmpeg first")
        return 1

    print("ShortForge schedule smoke test")
    print("=" * 40)

    init_db()
    clear_smoke_schedules()
    ensure_test_shorts()
    yt_id, tt_id = ensure_test_accounts()
    print(f"  job={JOB_ID} youtube_account={yt_id} tiktok_account={tt_id}\n")

    client = TestClient(app)
    run_api_tests(client, yt_id, tt_id)
    print()
    run_worker_test(yt_id, tt_id)

    print()
    print("=" * 40)
    print(f"Results: {PASS} passed, {FAIL} failed")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
