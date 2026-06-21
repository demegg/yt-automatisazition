from datetime import datetime, timedelta
from pathlib import Path

from app.db import (
    create_scheduled_posts,
    get_posted_filenames,
    get_scheduled_filenames,
    get_social_account,
)
from app.paths import OUTPUT_DIR


def list_job_short_filenames(job_id: str) -> list[str]:
    job_output = OUTPUT_DIR / job_id
    if not job_output.exists():
        return []
    return sorted(f.name for f in job_output.glob("short_*.mp4") if f.is_file())


def get_available_filenames(
    job_id: str, platform: str, account_id: int
) -> list[str]:
    all_shorts = list_job_short_filenames(job_id)
    posted = get_posted_filenames(job_id, platform, account_id)
    scheduled = get_scheduled_filenames(job_id, platform, account_id)
    blocked = posted | scheduled
    return [f for f in all_shorts if f not in blocked]


def build_schedule_times(
    count: int,
    posts_per_day: int,
    start: datetime,
    window_start_hour: int = 9,
    window_end_hour: int = 21,
) -> list[datetime]:
    if count == 0:
        return []

    posts_per_day = max(1, min(posts_per_day, 10))
    times: list[datetime] = []
    day_offset = 0

    while len(times) < count:
        day = start + timedelta(days=day_offset)
        remaining = count - len(times)
        slots_today = min(posts_per_day, remaining)
        span = max(1, window_end_hour - window_start_hour)

        if slots_today == 1:
            hours = [window_start_hour + span // 2]
        else:
            step = span / (slots_today - 1)
            hours = [
                window_start_hour + int(step * i) for i in range(slots_today)
            ]

        for h in hours:
            times.append(
                day.replace(
                    hour=min(h, 23), minute=0, second=0, microsecond=0
                )
            )

        day_offset += 1

    return times[:count]


def create_post_schedule(
    job_id: str,
    account_targets: list[dict[str, int | str]],
    posts_per_day: int,
    start_date: datetime | None = None,
    window_start_hour: int = 9,
    window_end_hour: int = 21,
    title_prefix: str = "Short",
) -> dict:
    start = start_date or (datetime.now() + timedelta(hours=1))
    start = start.replace(minute=0, second=0, microsecond=0)

    summary: dict[str, dict] = {}
    total_created = 0

    for target in account_targets:
        platform = str(target["platform"])
        account_id = int(target["account_id"])
        account = get_social_account(account_id)
        if not account or account["platform"] != platform:
            raise ValueError(f"Invalid account for {platform}")

        available = get_available_filenames(job_id, platform, account_id)
        key = f"{platform}:{account_id}"
        if not available:
            summary[key] = {
                "platform": platform,
                "account_id": account_id,
                "account_name": account["display_name"],
                "scheduled": 0,
                "available": 0,
                "days": 0,
            }
            continue

        times = build_schedule_times(
            len(available),
            posts_per_day,
            start,
            window_start_hour,
            window_end_hour,
        )
        rows = []
        for filename, scheduled_at in zip(available, times):
            index = filename.replace("short_", "").replace(".mp4", "")
            rows.append(
                {
                    "job_id": job_id,
                    "platform": platform,
                    "account_id": account_id,
                    "filename": filename,
                    "title": f"{title_prefix} #{index}",
                    "scheduled_at": scheduled_at.isoformat(),
                }
            )

        created = create_scheduled_posts(rows)
        days = (times[-1] - times[0]).days + 1 if times else 0
        summary[key] = {
            "platform": platform,
            "account_id": account_id,
            "account_name": account["display_name"],
            "scheduled": created,
            "available": len(available),
            "days": days,
        }
        total_created += created

    return {
        "total_scheduled": total_created,
        "accounts": summary,
        "posts_per_day": posts_per_day,
    }


def get_video_path(job_id: str, filename: str) -> Path:
    path = OUTPUT_DIR / job_id / filename
    if not path.exists():
        raise FileNotFoundError(f"Video not found: {filename}")
    return path
