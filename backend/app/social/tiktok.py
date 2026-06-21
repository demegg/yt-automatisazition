import os
import time
from pathlib import Path

import httpx

from app.db import get_social_account, update_social_account_tokens

TIKTOK_API = "https://open.tiktokapis.com"


def get_redirect_uri() -> str:
    explicit = os.getenv("TIKTOK_REDIRECT_URI", "").strip()
    if explicit:
        return explicit
    base = os.getenv("BACKEND_URL", "http://127.0.0.1:8890")
    return f"{base.rstrip('/')}/api/social/tiktok/callback"


def _client_key() -> str:
    key = os.getenv("TIKTOK_CLIENT_KEY", "")
    if not key:
        raise ValueError("TikTok not configured. Add TIKTOK_CLIENT_KEY to .env")
    return key


def _client_secret() -> str:
    secret = os.getenv("TIKTOK_CLIENT_SECRET", "")
    if not secret:
        raise ValueError("TikTok not configured. Add TIKTOK_CLIENT_SECRET to .env")
    return secret


def _access_token_for_account(account_id: int) -> str:
    account = get_social_account(account_id)
    if not account or account["platform"] != "tiktok":
        raise ValueError("TikTok account not found")

    from datetime import datetime, timedelta

    expires_at = account.get("expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) > datetime.utcnow():
                return account["access_token"]
        except ValueError:
            pass

    refresh = account.get("refresh_token")
    if not refresh:
        return account["access_token"]

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{TIKTOK_API}/v2/oauth/token/",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "client_key": _client_key(),
                "client_secret": _client_secret(),
                "grant_type": "refresh_token",
                "refresh_token": refresh,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    access = data.get("access_token") or data.get("data", {}).get("access_token")
    if not access:
        raise ValueError("TikTok token refresh failed")

    expires_in = data.get("expires_in") or data.get("data", {}).get("expires_in", 3600)
    update_social_account_tokens(
        account_id,
        access,
        data.get("refresh_token") or refresh,
        datetime.utcnow() + timedelta(seconds=int(expires_in)),
    )
    return access


def upload_video(video_path: Path, title: str, account_id: int) -> str:
    access_token = _access_token_for_account(account_id)
    file_size = video_path.stat().st_size

    with httpx.Client(timeout=120) as client:
        init_resp = client.post(
            f"{TIKTOK_API}/v2/post/publish/video/init/",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "post_info": {
                    "title": title[:150],
                    "privacy_level": "PUBLIC_TO_EVERYONE",
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False,
                },
                "source_info": {
                    "source": "FILE_UPLOAD",
                    "video_size": file_size,
                    "chunk_size": file_size,
                    "total_chunk_count": 1,
                },
            },
        )
        if init_resp.status_code >= 400:
            raise ValueError(f"TikTok init failed: {init_resp.text}")

        init_data = init_resp.json()
        data = init_data.get("data") or init_data
        publish_id = data.get("publish_id")
        upload_url = data.get("upload_url")
        if not upload_url:
            raise ValueError("TikTok did not return an upload URL")

        with video_path.open("rb") as f:
            upload_resp = client.put(
                upload_url,
                content=f.read(),
                headers={
                    "Content-Type": "video/mp4",
                    "Content-Length": str(file_size),
                },
                timeout=600,
            )
        if upload_resp.status_code >= 400:
            raise ValueError(f"TikTok upload failed: {upload_resp.text}")

        for _ in range(30):
            status_resp = client.post(
                f"{TIKTOK_API}/v2/post/publish/status/fetch/",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"publish_id": publish_id},
            )
            if status_resp.status_code < 400:
                status_data = status_resp.json().get("data") or status_resp.json()
                state = status_data.get("status")
                if state in ("PUBLISH_COMPLETE", "SEND_TO_USER_INBOX"):
                    return publish_id or "published"
                if state == "FAILED":
                    raise ValueError(
                        status_data.get("fail_reason", "TikTok publish failed")
                    )
            time.sleep(2)

    return publish_id or "published"
