import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

os.environ["SHORTFORGE_DATA_DIR"] = tempfile.mkdtemp(prefix="shortforge-test-")
os.environ["JWT_SECRET"] = "test-secret-value-please-change"
os.environ["AUTH_REQUIRED"] = "true"
os.environ["SHORTFORGE_DISABLE_SCHEDULER"] = "true"
os.environ["MAX_UPLOAD_MB"] = "1"

import pytest
from fastapi.testclient import TestClient

from app.jobs import update_job
from app.main import app
from app.models import ClipRange, CutMode, ProcessRequest
from app.paths import OUTPUT_DIR, contained_file


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def _auth(client: TestClient, email: str | None = None) -> dict[str, str]:
    email = email or f"user-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "correct-horse"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_register_login_and_me(client: TestClient):
    email = f"login-{uuid.uuid4().hex[:8]}@example.com"
    headers = _auth(client, email)
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == email
    assert me.json()["guest"] is False


def test_jobs_are_private(client: TestClient):
    owner = _auth(client)
    other = _auth(client)
    created = client.post("/api/jobs", json={"name": "Owner batch"}, headers=owner)
    assert created.status_code == 200
    job_id = created.json()["job_id"]
    denied = client.get(f"/api/jobs/{job_id}/status", headers=other)
    assert denied.status_code == 404
    missing = client.get(f"/api/jobs/{job_id}/download/clip.mp4", headers=other)
    assert missing.status_code == 404


def test_anonymous_api_rejected(client: TestClient):
    response = client.get("/api/jobs")
    assert response.status_code == 401


def test_rejects_bad_extension_and_oversize(client: TestClient):
    headers = _auth(client)
    created = client.post("/api/jobs", json={"name": "Upload checks"}, headers=headers)
    job_id = created.json()["job_id"]
    bad = client.post(
        f"/api/jobs/{job_id}/upload",
        headers=headers,
        files={"video1": ("notes.txt", b"hello", "text/plain")},
    )
    assert bad.status_code == 400
    huge = client.post(
        f"/api/jobs/{job_id}/upload",
        headers=headers,
        files={"video1": ("big.mp4", b"0" * (1024 * 1024 + 32), "video/mp4")},
    )
    assert huge.status_code == 413


def test_rename_delete_and_cancel(client: TestClient):
    headers = _auth(client)
    created = client.post("/api/jobs", json={"name": "Draft"}, headers=headers)
    job_id = created.json()["job_id"]
    renamed = client.patch(
        f"/api/jobs/{job_id}", json={"name": "Renamed draft"}, headers=headers
    )
    assert renamed.status_code == 200
    listed = client.get("/api/jobs", headers=headers)
    assert listed.status_code == 200
    match = next(item for item in listed.json() if item["job_id"] == job_id)
    assert match["batch_name"] == "Renamed draft"
    assert match["has_preview"] is False
    assert "video1_path" not in match

    update_job(job_id, status="queued")
    cancelled = client.post(f"/api/jobs/{job_id}/cancel", headers=headers)
    assert cancelled.status_code == 200
    status = client.get(f"/api/jobs/{job_id}/status", headers=headers)
    assert status.json()["status"] == "cancelled"

    removed = client.delete(f"/api/jobs/{job_id}", headers=headers)
    assert removed.status_code == 200
    gone = client.get(f"/api/jobs/{job_id}/status", headers=headers)
    assert gone.status_code == 404


def test_disk_shorts_reopen_as_completed(client: TestClient):
    headers = _auth(client)
    created = client.post("/api/jobs", json={"name": "Already rendered"}, headers=headers)
    assert created.status_code == 200, created.text
    body = created.json()
    update_job(body["job_id"], status="saved", shorts=[], total_shorts=0, completed_shorts=0)
    folder = OUTPUT_DIR / body["batch_slug"]
    folder.mkdir(parents=True)
    (folder / "Already_rendered_Part_1.mp4").write_bytes(b"not-a-real-video")
    status = client.get(f"/api/jobs/{body['job_id']}/status", headers=headers)
    assert status.status_code == 200, status.text
    payload = status.json()
    assert payload["status"] == "completed"
    assert payload["shorts"][0]["filename"] == "Already_rendered_Part_1.mp4"
    listed = client.get("/api/jobs", headers=headers).json()
    summary = next(item for item in listed if item["job_id"] == body["job_id"])
    assert summary["status"] == "completed"
    assert summary["has_preview"] is True


def test_capabilities_do_not_invent_billing(client: TestClient):
    response = client.get("/api/capabilities")
    assert response.status_code == 200
    body = response.json()
    assert body["billing"] is False
    assert body["password_reset_email"] is False
    assert body["output"]["width"] == 1080
    assert body["output"]["height"] == 1920
    assert body["auth_required"] is True


def test_contained_file_rejects_traversal(tmp_path: Path):
    assert contained_file(tmp_path, "../secret.mp4") is None
    assert contained_file(tmp_path, "clip.mp4") == (tmp_path / "clip.mp4").resolve()


def test_custom_clips_must_move_forward():
    with pytest.raises(ValueError):
        ProcessRequest(
            job_id="job",
            cut_mode=CutMode.CUSTOM,
            clips=[ClipRange(start=4, end=4)],
        )


def _ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


@pytest.mark.skipif(_ffmpeg() is None, reason="ffmpeg is not installed")
def test_process_small_fixture(client: TestClient):
    headers = _auth(client)
    created = client.post("/api/jobs", json={"name": "Fixture"}, headers=headers)
    job_id = created.json()["job_id"]
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "tiny.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=320x240:rate=12:duration=6",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=44100:duration=6",
                "-shortest",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                str(source),
            ],
            check=True,
            capture_output=True,
        )
        with source.open("rb") as handle:
            uploaded = client.post(
                f"/api/jobs/{job_id}/upload",
                headers=headers,
                files={"video1": ("tiny.mp4", handle, "video/mp4")},
            )
        assert uploaded.status_code == 200, uploaded.text
        started = client.post(
            f"/api/jobs/{job_id}/process",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "job_id": job_id,
                "segment_length": 5,
                "layout": "single",
                "captions_enabled": False,
                "caption_style": "minimal",
                "max_shorts": 1,
                "cut_mode": "auto",
                "trim_start": 0,
                "trim_end": 6,
                "batch_name": "Fixture",
            },
        )
        assert started.status_code == 200, started.text
        duplicate = client.post(
            f"/api/jobs/{job_id}/process",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "job_id": job_id,
                "segment_length": 5,
                "captions_enabled": False,
                "batch_name": "Fixture",
            },
        )
        assert duplicate.status_code == 409

        status = {}
        for _ in range(60):
            status = client.get(f"/api/jobs/{job_id}/status", headers=headers).json()
            if status["status"] in {"completed", "failed", "cancelled"}:
                break
            import time

            time.sleep(1)
        assert status["status"] == "completed", status
        listed = client.get("/api/jobs", headers=headers).json()
        summary = next(item for item in listed if item["job_id"] == job_id)
        assert summary["has_preview"] is True
        filename = status["shorts"][0]["filename"]
        download = client.get(
            f"/api/jobs/{job_id}/download/{filename}", headers=headers
        )
        assert download.status_code == 200
        assert download.content[:8] != b""
        traversal = client.get(
            f"/api/jobs/{job_id}/download/..%2F..%2Fsecret.mp4", headers=headers
        )
        assert traversal.status_code in {400, 404}


def test_notices_are_private_and_mark_read(client: TestClient):
    headers = _auth(client)
    created = client.post("/api/jobs", headers=headers, json={"name": "Notice batch"})
    assert created.status_code == 200, created.text
    job_id = created.json()["job_id"]
    update_job(job_id, status="failed", error="The source file could not be read.", message="Failed")

    notes = client.get("/api/notices", headers=headers)
    assert notes.status_code == 200, notes.text
    match = next(item for item in notes.json() if item["job_id"] == job_id)
    assert match["kind"] == "failed"
    assert match["read"] is False
    assert "could not be read" in match["body"]

    marked = client.post("/api/notices/read", headers=headers, json={"keys": [match["key"]]})
    assert marked.status_code == 200
    again = client.get("/api/notices", headers=headers).json()
    assert next(item for item in again if item["key"] == match["key"])["read"] is True

    other = _auth(client)
    foreign = client.get("/api/notices", headers=other).json()
    assert all(item["job_id"] != job_id for item in foreign)
