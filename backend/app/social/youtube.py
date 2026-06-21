import os
from datetime import datetime
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from app.db import get_social_account, update_social_account_tokens

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def get_redirect_uri() -> str:
    explicit = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if explicit:
        return explicit
    base = os.getenv("BACKEND_URL", "http://127.0.0.1:8890")
    return f"{base.rstrip('/')}/api/social/youtube/callback"


def build_credentials(account_id: int) -> Credentials | None:
    account = get_social_account(account_id)
    if not account or account["platform"] != "youtube":
        return None

    creds = Credentials(
        token=account["access_token"],
        refresh_token=account.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=SCOPES,
    )
    if account.get("expires_at"):
        try:
            creds.expiry = datetime.fromisoformat(account["expires_at"])
        except ValueError:
            pass

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        update_social_account_tokens(
            account_id, creds.token, creds.refresh_token, creds.expiry
        )
    return creds


def fetch_channel_name(creds: Credentials) -> str:
    youtube = build("youtube", "v3", credentials=creds)
    resp = youtube.channels().list(part="snippet", mine=True).execute()
    items = resp.get("items", [])
    if items:
        return items[0]["snippet"]["title"]
    return "YouTube Channel"


def upload_short(
    video_path: Path,
    title: str,
    description: str,
    account_id: int,
) -> str:
    creds = build_credentials(account_id)
    if not creds:
        raise ValueError("YouTube account not found or invalid")

    youtube = build("youtube", "v3", credentials=creds)
    body = {
        "snippet": {
            "title": title[:100],
            "description": (description + "\n\n#Shorts")[:5000],
            "categoryId": "22",
        },
        "status": {
            "privacyStatus": "public",
            "selfDeclaredMadeForKids": False,
        },
    }
    media = MediaFileUpload(
        str(video_path),
        chunksize=1024 * 1024,
        resumable=True,
        mimetype="video/mp4",
    )
    request = youtube.videos().insert(
        part="snippet,status",
        body=body,
        media_body=media,
    )
    response = None
    while response is None:
        status, response = request.next_chunk()
    video_id = response.get("id")
    if not video_id:
        raise ValueError("YouTube upload returned no video ID")
    return video_id
