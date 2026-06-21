import os

import secrets

from datetime import datetime, timedelta



import httpx

from fastapi import APIRouter, Depends, HTTPException

from fastapi.responses import RedirectResponse

from google_auth_oauthlib.flow import Flow

from pydantic import BaseModel, Field



from app.auth import CurrentUser, get_current_user

from app.db import (

    delete_social_account,

    get_schedules_for_job,

    get_social_account,

    job_belongs_to_user,

    list_social_accounts,

    save_social_account,

    set_default_account,

)

from app.schedule_service import (

    create_post_schedule,

    get_available_filenames,

    list_job_short_filenames,

)

from app.social.tiktok import TIKTOK_API, get_redirect_uri as tiktok_redirect

from app.social.youtube import fetch_channel_name, get_redirect_uri as youtube_redirect



router = APIRouter(prefix="/api/social", tags=["social"])



_oauth_states: dict[str, tuple[str, int, float]] = {}

STATE_TTL_SECONDS = 600





def _frontend_url() -> str:

    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")





def _store_state(state: str, platform: str, user_id: int) -> None:

    _oauth_states[state] = (platform, user_id, datetime.utcnow().timestamp())





def _pop_state(state: str) -> tuple[str, int] | None:

    entry = _oauth_states.pop(state, None)

    if not entry:

        return None

    platform, user_id, created = entry

    if datetime.utcnow().timestamp() - created > STATE_TTL_SECONDS:

        return None

    return platform, user_id





def _require_job(job_id: str, user: CurrentUser) -> None:

    if not job_belongs_to_user(job_id, user.id):

        raise HTTPException(404, "Job not found")





@router.get("/status")

def social_status(user: CurrentUser = Depends(get_current_user)) -> dict:

    accounts = list_social_accounts(user.id)

    youtube = [a for a in accounts if a["platform"] == "youtube"]

    tiktok = [a for a in accounts if a["platform"] == "tiktok"]

    youtube_redirect_uri = youtube_redirect()

    tiktok_redirect_uri = tiktok_redirect()

    backend_base = youtube_redirect_uri.rsplit("/api/social/", 1)[0]

    return {

        "youtube_configured": bool(os.getenv("GOOGLE_CLIENT_ID")),

        "tiktok_configured": bool(os.getenv("TIKTOK_CLIENT_KEY")),

        "youtube_accounts": len(youtube),

        "tiktok_accounts": len(tiktok),

        "accounts": accounts,

        "backend_url": backend_base,

        "oauth_redirect_uris": {

            "youtube": youtube_redirect_uri,

            "tiktok": tiktok_redirect_uri,

        },

    }





@router.get("/accounts")

def list_accounts(

    platform: str | None = None,

    user: CurrentUser = Depends(get_current_user),

) -> dict:

    return {"accounts": list_social_accounts(user.id, platform)}





@router.delete("/accounts/{account_id}")

def remove_account(

    account_id: int, user: CurrentUser = Depends(get_current_user)

) -> dict:

    if not delete_social_account(account_id, user.id):

        raise HTTPException(404, "Account not found")

    return {"ok": True}





@router.post("/accounts/{account_id}/default")

def make_default_account(

    account_id: int, user: CurrentUser = Depends(get_current_user)

) -> dict:

    account = get_social_account(account_id, user.id)

    if not account:

        raise HTTPException(404, "Account not found")

    set_default_account(account_id, user.id)

    return {"ok": True, "account_id": account_id}





@router.get("/youtube/connect")

def youtube_connect(user: CurrentUser = Depends(get_current_user)) -> RedirectResponse:

    client_id = os.getenv("GOOGLE_CLIENT_ID")

    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

    if not client_id or not client_secret:

        raise HTTPException(400, "YouTube API credentials not configured in .env")



    redirect_uri = youtube_redirect()

    flow = Flow.from_client_config(

        {

            "web": {

                "client_id": client_id,

                "client_secret": client_secret,

                "auth_uri": "https://accounts.google.com/o/oauth2/auth",

                "token_uri": "https://oauth2.googleapis.com/token",

                "redirect_uris": [redirect_uri],

            }

        },

        scopes=["https://www.googleapis.com/auth/youtube.upload"],

        redirect_uri=redirect_uri,

    )

    state = secrets.token_urlsafe(32)

    _store_state(state, "youtube", user.id)

    auth_url, _ = flow.authorization_url(

        access_type="offline",

        include_granted_scopes="true",

        prompt="consent",

        state=state,

    )

    return RedirectResponse(auth_url)





@router.get("/youtube/callback")

def youtube_callback(code: str, state: str) -> RedirectResponse:

    parsed = _pop_state(state)

    if not parsed or parsed[0] != "youtube":

        return RedirectResponse(f"{_frontend_url()}?oauth=youtube&success=0")



    platform, user_id = parsed

    client_id = os.getenv("GOOGLE_CLIENT_ID")

    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

    redirect_uri = youtube_redirect()



    flow = Flow.from_client_config(

        {

            "web": {

                "client_id": client_id,

                "client_secret": client_secret,

                "auth_uri": "https://accounts.google.com/o/oauth2/auth",

                "token_uri": "https://oauth2.googleapis.com/token",

                "redirect_uris": [redirect_uri],

            }

        },

        scopes=["https://www.googleapis.com/auth/youtube.upload"],

        redirect_uri=redirect_uri,

        state=state,

    )

    flow.fetch_token(code=code)

    creds = flow.credentials



    display_name = "YouTube Channel"

    try:

        display_name = fetch_channel_name(creds)

    except Exception:

        pass



    save_social_account(

        user_id,

        "youtube",

        display_name,

        creds.token,

        creds.refresh_token,

        creds.expiry,

    )

    return RedirectResponse(f"{_frontend_url()}?oauth=youtube&success=1")





@router.get("/tiktok/connect")

def tiktok_connect(user: CurrentUser = Depends(get_current_user)) -> RedirectResponse:

    client_key = os.getenv("TIKTOK_CLIENT_KEY")

    if not client_key:

        raise HTTPException(400, "TikTok API credentials not configured in .env")



    state = secrets.token_urlsafe(32)

    _store_state(state, "tiktok", user.id)

    redirect_uri = tiktok_redirect()

    scopes = "video.publish,video.upload"

    url = (

        "https://www.tiktok.com/v2/auth/authorize/"

        f"?client_key={client_key}"

        f"&scope={scopes}"

        f"&response_type=code"

        f"&redirect_uri={redirect_uri}"

        f"&state={state}"

    )

    return RedirectResponse(url)





@router.get("/tiktok/callback")

def tiktok_callback(code: str, state: str) -> RedirectResponse:

    parsed = _pop_state(state)

    if not parsed or parsed[0] != "tiktok":

        return RedirectResponse(f"{_frontend_url()}?oauth=tiktok&success=0")



    platform, user_id = parsed

    client_key = os.getenv("TIKTOK_CLIENT_KEY")

    client_secret = os.getenv("TIKTOK_CLIENT_SECRET")

    redirect_uri = tiktok_redirect()



    with httpx.Client(timeout=30) as client:

        resp = client.post(

            f"{TIKTOK_API}/v2/oauth/token/",

            headers={"Content-Type": "application/x-www-form-urlencoded"},

            data={

                "client_key": client_key,

                "client_secret": client_secret,

                "code": code,

                "grant_type": "authorization_code",

                "redirect_uri": redirect_uri,

            },

        )

        if resp.status_code >= 400:

            return RedirectResponse(f"{_frontend_url()}?oauth=tiktok&success=0")

        data = resp.json()



    access = data.get("access_token") or data.get("data", {}).get("access_token")

    refresh = data.get("refresh_token") or data.get("data", {}).get("refresh_token")

    expires_in = data.get("expires_in") or data.get("data", {}).get("expires_in", 3600)



    if not access:

        return RedirectResponse(f"{_frontend_url()}?oauth=tiktok&success=0")



    count = len(list_social_accounts(user_id, "tiktok"))

    display_name = f"TikTok Account {count + 1}"



    save_social_account(

        user_id,

        "tiktok",

        display_name,

        access,

        refresh,

        datetime.utcnow() + timedelta(seconds=int(expires_in)),

    )

    return RedirectResponse(f"{_frontend_url()}?oauth=tiktok&success=1")





class AccountTarget(BaseModel):

    platform: str

    account_id: int





class ScheduleRequest(BaseModel):

    accounts: list[AccountTarget] = Field(..., min_length=1)

    posts_per_day: int = Field(default=2, ge=1, le=10)

    window_start_hour: int = Field(default=9, ge=0, le=23)

    window_end_hour: int = Field(default=21, ge=1, le=23)

    title_prefix: str = Field(default="Short", max_length=80)





schedule_router = APIRouter(prefix="/api/jobs", tags=["schedule"])





@schedule_router.get("/{job_id}/schedule/preview")

def schedule_preview(

    job_id: str,

    posts_per_day: int = 2,

    youtube_account_id: int | None = None,

    tiktok_account_id: int | None = None,

    user: CurrentUser = Depends(get_current_user),

) -> dict:

    _require_job(job_id, user)

    shorts = list_job_short_filenames(job_id)

    if not shorts:

        raise HTTPException(404, "No shorts found for this job")



    platforms: dict[str, dict] = {}

    if youtube_account_id:

        acc = get_social_account(youtube_account_id, user.id)

        if not acc:

            raise HTTPException(400, "Invalid YouTube account")

        available = get_available_filenames(job_id, "youtube", youtube_account_id)

        days = (len(available) + posts_per_day - 1) // posts_per_day if available else 0

        platforms["youtube"] = {

            "account_id": youtube_account_id,

            "account_name": acc["display_name"],

            "total_shorts": len(shorts),

            "available_to_schedule": len(available),

            "already_posted_or_scheduled": len(shorts) - len(available),

            "estimated_days": days,

        }

    if tiktok_account_id:

        acc = get_social_account(tiktok_account_id, user.id)

        if not acc:

            raise HTTPException(400, "Invalid TikTok account")

        available = get_available_filenames(job_id, "tiktok", tiktok_account_id)

        days = (len(available) + posts_per_day - 1) // posts_per_day if available else 0

        platforms["tiktok"] = {

            "account_id": tiktok_account_id,

            "account_name": acc["display_name"],

            "total_shorts": len(shorts),

            "available_to_schedule": len(available),

            "already_posted_or_scheduled": len(shorts) - len(available),

            "estimated_days": days,

        }



    return {

        "job_id": job_id,

        "total_shorts": len(shorts),

        "posts_per_day": posts_per_day,

        "platforms": platforms,

    }





@schedule_router.post("/{job_id}/schedule")

def create_schedule(

    job_id: str,

    body: ScheduleRequest,

    user: CurrentUser = Depends(get_current_user),

) -> dict:

    _require_job(job_id, user)

    targets = []

    for item in body.accounts:

        if item.platform not in ("youtube", "tiktok"):

            continue

        acc = get_social_account(item.account_id, user.id)

        if not acc or acc["platform"] != item.platform:

            raise HTTPException(400, f"Invalid {item.platform} account")

        targets.append({"platform": item.platform, "account_id": item.account_id})



    if not targets:

        raise HTTPException(400, "Select at least one account")



    if body.window_end_hour <= body.window_start_hour:

        raise HTTPException(400, "End hour must be after start hour")



    result = create_post_schedule(

        job_id=job_id,

        account_targets=targets,

        posts_per_day=body.posts_per_day,

        window_start_hour=body.window_start_hour,

        window_end_hour=body.window_end_hour,

        title_prefix=body.title_prefix,

    )



    if result["total_scheduled"] == 0:

        raise HTTPException(

            400,

            "No new clips to schedule for these accounts.",

        )



    return result





@schedule_router.get("/{job_id}/schedule")

def list_schedule(

    job_id: str, user: CurrentUser = Depends(get_current_user)

) -> dict:

    _require_job(job_id, user)

    schedules = get_schedules_for_job(job_id)

    return {"job_id": job_id, "schedules": schedules}


