import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Any

from app.paths import DB_PATH, ensure_data_dirs

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_jobs (
    job_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_jobs_user ON user_jobs(user_id);

CREATE TABLE IF NOT EXISTS social_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    display_name TEXT NOT NULL,
    external_id TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    extra_json TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    title TEXT,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    platform_video_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(job_id, platform, filename, account_id)
);

CREATE TABLE IF NOT EXISTS posted_clips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    platform_video_id TEXT,
    posted_at TEXT NOT NULL,
    UNIQUE(job_id, platform, filename, account_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_time
    ON scheduled_posts(status, scheduled_at);
"""


def init_db() -> None:
    ensure_data_dirs()
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        _migrate_legacy_oauth(conn)
        _ensure_account_id_columns(conn)
        _migrate_unique_constraints(conn)
        _migrate_multi_user(conn)
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_social_accounts_user_platform
            ON social_accounts(user_id, platform)
            """
        )


def _migrate_multi_user(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(social_accounts)")}
    if "user_id" not in cols:
        conn.executescript(
            """
            CREATE TABLE social_accounts_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                platform TEXT NOT NULL,
                display_name TEXT NOT NULL,
                external_id TEXT,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                expires_at TEXT,
                extra_json TEXT,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            DROP TABLE social_accounts;
            ALTER TABLE social_accounts_new RENAME TO social_accounts;
            CREATE INDEX IF NOT EXISTS idx_social_accounts_user_platform
                ON social_accounts(user_id, platform);
            """
        )


def _migrate_legacy_oauth(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(social_accounts)")}
    if "user_id" in cols:
        return
    try:
        rows = conn.execute("SELECT * FROM oauth_tokens").fetchall()
    except sqlite3.OperationalError:
        return
    for row in rows:
        platform = row["platform"]
        name = "YouTube" if platform == "youtube" else "TikTok"
        existing = conn.execute(
            "SELECT id FROM social_accounts WHERE platform = ? LIMIT 1",
            (platform,),
        ).fetchone()
        if existing:
            continue
        now = datetime.utcnow().isoformat()
        conn.execute(
            """
            INSERT INTO social_accounts
            (platform, display_name, external_id, access_token, refresh_token,
             expires_at, extra_json, is_default, created_at, updated_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                platform,
                f"{name} Account",
                row["access_token"],
                row["refresh_token"],
                row["expires_at"],
                row["extra_json"],
                now,
                now,
            ),
        )


def _ensure_account_id_columns(conn: sqlite3.Connection) -> None:
    for table in ("scheduled_posts", "posted_clips"):
        cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if "account_id" not in cols:
            conn.execute(
                f"ALTER TABLE {table} ADD COLUMN account_id INTEGER NOT NULL DEFAULT 0"
            )


def _migrate_unique_constraints(conn: sqlite3.Connection) -> None:
    """Rebuild legacy tables so UNIQUE includes account_id."""
    for table in ("posted_clips", "scheduled_posts"):
        row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        if not row or not row[0]:
            continue
        if "UNIQUE(job_id, platform, filename, account_id)" in row[0]:
            continue

        if table == "posted_clips":
            conn.executescript(
                """
                CREATE TABLE posted_clips_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    account_id INTEGER NOT NULL,
                    filename TEXT NOT NULL,
                    platform_video_id TEXT,
                    posted_at TEXT NOT NULL,
                    UNIQUE(job_id, platform, filename, account_id)
                );
                INSERT INTO posted_clips_new
                    (id, job_id, platform, account_id, filename, platform_video_id, posted_at)
                SELECT id, job_id, platform, account_id, filename, platform_video_id, posted_at
                FROM posted_clips;
                DROP TABLE posted_clips;
                ALTER TABLE posted_clips_new RENAME TO posted_clips;
                """
            )
        elif table == "scheduled_posts":
            conn.executescript(
                """
                CREATE TABLE scheduled_posts_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    account_id INTEGER NOT NULL,
                    filename TEXT NOT NULL,
                    title TEXT,
                    scheduled_at TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    error TEXT,
                    platform_video_id TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE(job_id, platform, filename, account_id)
                );
                INSERT INTO scheduled_posts_new
                    (id, job_id, platform, account_id, filename, title, scheduled_at,
                     status, error, platform_video_id, created_at)
                SELECT id, job_id, platform, account_id, filename, title, scheduled_at,
                       status, error, platform_video_id, created_at
                FROM scheduled_posts;
                DROP TABLE scheduled_posts;
                ALTER TABLE scheduled_posts_new RENAME TO scheduled_posts;
                CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status_time
                    ON scheduled_posts(status, scheduled_at);
                """
            )


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def create_user(email: str, password_hash: str) -> int:
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
            (email.lower().strip(), password_hash, now),
        )
        return int(cur.lastrowid)


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email.lower().strip(),)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def assign_job_to_user(job_id: str, user_id: int) -> None:
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO user_jobs (job_id, user_id, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET user_id = excluded.user_id
            """,
            (job_id, user_id, now),
        )


def get_job_owner(job_id: str) -> int | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT user_id FROM user_jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
    return int(row["user_id"]) if row else None


def job_belongs_to_user(job_id: str, user_id: int) -> bool:
    owner = get_job_owner(job_id)
    return owner is not None and owner == user_id


def save_social_account(
    user_id: int,
    platform: str,
    display_name: str,
    access_token: str,
    refresh_token: str | None,
    expires_at: datetime | None,
    external_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> int:
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        count = conn.execute(
            """
            SELECT COUNT(*) FROM social_accounts
            WHERE user_id = ? AND platform = ?
            """,
            (user_id, platform),
        ).fetchone()[0]
        is_default = 1 if count == 0 else 0
        cur = conn.execute(
            """
            INSERT INTO social_accounts
            (user_id, platform, display_name, external_id, access_token, refresh_token,
             expires_at, extra_json, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                platform,
                display_name,
                external_id,
                access_token,
                refresh_token,
                expires_at.isoformat() if expires_at else None,
                json.dumps(extra or {}),
                is_default,
                now,
                now,
            ),
        )
        return int(cur.lastrowid)


def update_social_account_tokens(
    account_id: int,
    access_token: str,
    refresh_token: str | None,
    expires_at: datetime | None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE social_accounts
            SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                access_token,
                refresh_token,
                expires_at.isoformat() if expires_at else None,
                datetime.utcnow().isoformat(),
                account_id,
            ),
        )


def list_social_accounts(
    user_id: int, platform: str | None = None
) -> list[dict[str, Any]]:
    with get_conn() as conn:
        if platform:
            rows = conn.execute(
                """
                SELECT id, platform, display_name, external_id, is_default, created_at, updated_at
                FROM social_accounts
                WHERE user_id = ? AND platform = ?
                ORDER BY is_default DESC, id
                """,
                (user_id, platform),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, platform, display_name, external_id, is_default, created_at, updated_at
                FROM social_accounts
                WHERE user_id = ?
                ORDER BY platform, is_default DESC, id
                """,
                (user_id,),
            ).fetchall()
    return [dict(r) for r in rows]


def get_social_account(
    account_id: int, user_id: int | None = None
) -> dict[str, Any] | None:
    with get_conn() as conn:
        if user_id is not None:
            row = conn.execute(
                "SELECT * FROM social_accounts WHERE id = ? AND user_id = ?",
                (account_id, user_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM social_accounts WHERE id = ?", (account_id,)
            ).fetchone()
    if not row:
        return None
    return _account_row_to_dict(row)


def delete_social_account(account_id: int, user_id: int) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT platform FROM social_accounts WHERE id = ? AND user_id = ?",
            (account_id, user_id),
        ).fetchone()
        if not row:
            return False
        conn.execute(
            "DELETE FROM social_accounts WHERE id = ? AND user_id = ?",
            (account_id, user_id),
        )
        remaining = conn.execute(
            """
            SELECT id FROM social_accounts
            WHERE user_id = ? AND platform = ? ORDER BY id
            """,
            (user_id, row["platform"]),
        ).fetchall()
        if remaining:
            conn.execute(
                """
                UPDATE social_accounts SET is_default = 0
                WHERE user_id = ? AND platform = ?
                """,
                (user_id, row["platform"]),
            )
            conn.execute(
                "UPDATE social_accounts SET is_default = 1 WHERE id = ?",
                (remaining[0]["id"],),
            )
    return True


def set_default_account(account_id: int, user_id: int) -> None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT platform FROM social_accounts WHERE id = ? AND user_id = ?",
            (account_id, user_id),
        ).fetchone()
        if not row:
            return
        conn.execute(
            """
            UPDATE social_accounts SET is_default = 0
            WHERE user_id = ? AND platform = ?
            """,
            (user_id, row["platform"]),
        )
        conn.execute(
            """
            UPDATE social_accounts SET is_default = 1
            WHERE id = ? AND user_id = ?
            """,
            (account_id, user_id),
        )


def get_default_account_id(user_id: int, platform: str) -> int | None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id FROM social_accounts
            WHERE user_id = ? AND platform = ?
            ORDER BY is_default DESC, id LIMIT 1
            """,
            (user_id, platform),
        ).fetchone()
    return int(row["id"]) if row else None


def _account_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "platform": row["platform"],
        "display_name": row["display_name"],
        "external_id": row["external_id"],
        "access_token": row["access_token"],
        "refresh_token": row["refresh_token"],
        "expires_at": row["expires_at"],
        "extra": json.loads(row["extra_json"] or "{}"),
        "is_default": bool(row["is_default"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_posted_filenames(
    job_id: str, platform: str, account_id: int
) -> set[str]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT filename FROM posted_clips
            WHERE job_id = ? AND platform = ? AND account_id = ?
            """,
            (job_id, platform, account_id),
        ).fetchall()
    return {r["filename"] for r in rows}


def get_scheduled_filenames(
    job_id: str, platform: str, account_id: int
) -> set[str]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT filename FROM scheduled_posts
            WHERE job_id = ? AND platform = ? AND account_id = ?
              AND status IN ('pending', 'posted')
            """,
            (job_id, platform, account_id),
        ).fetchall()
    return {r["filename"] for r in rows}


def create_scheduled_posts(rows: list[dict[str, Any]]) -> int:
    now = datetime.utcnow().isoformat()
    with get_conn() as conn:
        count = 0
        for row in rows:
            try:
                conn.execute(
                    """
                    INSERT INTO scheduled_posts
                    (job_id, platform, account_id, filename, title, scheduled_at, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
                    """,
                    (
                        row["job_id"],
                        row["platform"],
                        row["account_id"],
                        row["filename"],
                        row.get("title"),
                        row["scheduled_at"],
                        now,
                    ),
                )
                count += 1
            except sqlite3.IntegrityError:
                continue
    return count


def get_schedules_for_job(job_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT sp.id, sp.job_id, sp.platform, sp.account_id, sp.filename,
                   sp.title, sp.scheduled_at, sp.status, sp.error, sp.platform_video_id,
                   sa.display_name AS account_name
            FROM scheduled_posts sp
            LEFT JOIN social_accounts sa ON sa.id = sp.account_id
            WHERE sp.job_id = ? ORDER BY sp.scheduled_at
            """,
            (job_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_pending_posts(now: datetime) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT * FROM scheduled_posts
            WHERE status = 'pending' AND scheduled_at <= ?
            ORDER BY scheduled_at
            LIMIT 5
            """,
            (now.isoformat(),),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_post_scheduled_result(
    post_id: int,
    status: str,
    platform_video_id: str | None = None,
    error: str | None = None,
) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            UPDATE scheduled_posts
            SET status = ?, platform_video_id = ?, error = ?
            WHERE id = ?
            """,
            (status, platform_video_id, error, post_id),
        )
        if status == "posted":
            row = conn.execute(
                """
                SELECT job_id, platform, filename, account_id
                FROM scheduled_posts WHERE id = ?
                """,
                (post_id,),
            ).fetchone()
            if row:
                conn.execute(
                    """
                    INSERT INTO posted_clips
                    (job_id, platform, account_id, filename, platform_video_id, posted_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(job_id, platform, filename, account_id) DO NOTHING
                    """,
                    (
                        row["job_id"],
                        row["platform"],
                        row["account_id"],
                        row["filename"],
                        platform_video_id,
                        datetime.utcnow().isoformat(),
                    ),
                )


# Legacy helpers for compatibility during transition
def is_platform_connected(user_id: int, platform: str) -> bool:
    return get_default_account_id(user_id, platform) is not None
