import logging
from datetime import datetime

from app.db import get_pending_posts, mark_post_scheduled_result
from app.schedule_service import get_video_path
from app.social.tiktok import upload_video as tiktok_upload
from app.social.youtube import upload_short as youtube_upload

logger = logging.getLogger(__name__)


def process_pending_posts() -> None:
    now = datetime.utcnow()
    pending = get_pending_posts(now)
    if not pending:
        return

    for post in pending:
        post_id = post["id"]
        platform = post["platform"]
        account_id = int(post["account_id"])
        job_id = post["job_id"]
        filename = post["filename"]
        title = post.get("title") or f"Short {filename}"

        try:
            video_path = get_video_path(job_id, filename)
            if platform == "youtube":
                video_id = youtube_upload(
                    video_path,
                    title=title,
                    description="Created with ShortForge\n\n#Shorts",
                    account_id=account_id,
                )
                mark_post_scheduled_result(
                    post_id, "posted", platform_video_id=video_id
                )
            elif platform == "tiktok":
                publish_id = tiktok_upload(
                    video_path, title=title, account_id=account_id
                )
                mark_post_scheduled_result(
                    post_id, "posted", platform_video_id=publish_id
                )
            else:
                mark_post_scheduled_result(
                    post_id, "failed", error=f"Unknown platform: {platform}"
                )
            logger.info(
                "Posted %s to %s account %s", filename, platform, account_id
            )
        except Exception as exc:
            logger.exception("Failed to post %s to %s", filename, platform)
            mark_post_scheduled_result(post_id, "failed", error=str(exc))
