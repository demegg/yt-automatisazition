import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  Youtube,
} from "lucide-react";
import {
  createSchedule,
  formatScheduleTime,
  getSchedulePreview,
  listSchedules,
} from "../api";
import type { ScheduledPost, SocialAccount } from "../types";

interface Props {
  jobId: string;
  shortCount: number;
  youtubeAccountId: number | null;
  tiktokAccountId: number | null;
  accounts: SocialAccount[];
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9.01a8.24 8.24 0 0 0 4.74 1.52V7.06a4.83 4.83 0 0 1-1.05-.25z" />
    </svg>
  );
}

const POSTS_OPTIONS = [1, 2, 3, 5];

export default function SchedulePanel({
  jobId,
  shortCount,
  youtubeAccountId,
  tiktokAccountId,
  accounts,
}: Props) {
  const [postsPerDay, setPostsPerDay] = useState(2);
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof getSchedulePreview>
  > | null>(null);
  const [schedules, setSchedules] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const youtubeName = accounts.find((a) => a.id === youtubeAccountId)?.display_name;
  const tiktokName = accounts.find((a) => a.id === tiktokAccountId)?.display_name;

  const refresh = useCallback(async () => {
    if (!youtubeAccountId && !tiktokAccountId) return;

    setLoading(true);
    setError(null);

    try {
      const previewData = await getSchedulePreview(
        jobId,
        postsPerDay,
        youtubeAccountId,
        tiktokAccountId
      );
      setPreview(previewData);
    } catch (e) {
      setPreview(null);
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("No shorts") || msg.toLowerCase().includes("not found")) {
        setError(
          "Shorts not found on the server for this job. Generate shorts again, then return here to schedule."
        );
      } else if (msg) {
        setError(msg);
      }
    }

    try {
      const scheduleList = await listSchedules(jobId);
      setSchedules(scheduleList);
    } catch {
      setSchedules([]);
    }

    setLoading(false);
  }, [jobId, postsPerDay, youtubeAccountId, tiktokAccountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSchedule = async () => {
    const targets: { platform: string; account_id: number }[] = [];
    if (youtubeAccountId) {
      targets.push({ platform: "youtube", account_id: youtubeAccountId });
    }
    if (tiktokAccountId) {
      targets.push({ platform: "tiktok", account_id: tiktokAccountId });
    }
    if (targets.length === 0) {
      setError("Select at least one account on the Accounts step");
      return;
    }

    setScheduling(true);
    setError(null);
    setMessage(null);
    try {
      const result = await createSchedule(jobId, {
        accounts: targets,
        posts_per_day: postsPerDay,
        window_start_hour: 9,
        window_end_hour: 21,
        title_prefix: "Short",
      });
      setMessage(
        `Scheduled ${result.total_scheduled} posts. Clips won't be posted twice to the same account.`
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scheduling failed");
    } finally {
      setScheduling(false);
    }
  };

  if (!youtubeAccountId && !tiktokAccountId) {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface/40 p-6 text-gray-400">
        No accounts selected. Go back to Accounts and pick YouTube or TikTok targets.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/20">
          <CalendarClock className="h-5 w-5 text-brand" />
        </div>
        <div>
          <h3 className="font-display text-xl font-bold">Schedule uploads</h3>
          <p className="text-sm text-gray-400">
            Auto-post to your selected accounts — never reposts the same clip twice
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        {youtubeAccountId && (
          <div className="flex items-center gap-2 rounded-xl border border-surface-border px-4 py-2 text-sm">
            <Youtube className="h-4 w-4 text-red-500" />
            <span>{youtubeName || "YouTube"}</span>
            <CheckCircle2 className="h-4 w-4 text-brand" />
          </div>
        )}
        {tiktokAccountId && (
          <div className="flex items-center gap-2 rounded-xl border border-surface-border px-4 py-2 text-sm">
            <TikTokIcon className="h-4 w-4" />
            <span>{tiktokName || "TikTok"}</span>
            <CheckCircle2 className="h-4 w-4 text-brand" />
          </div>
        )}
      </div>

      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-gray-300">Posts per day</p>
        <div className="flex flex-wrap gap-2">
          {POSTS_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPostsPerDay(n)}
              className={`rounded-xl px-5 py-2 text-sm font-medium transition ${
                postsPerDay === n
                  ? "bg-accent text-white"
                  : "border border-surface-border hover:border-brand/50"
              }`}
            >
              {n} / day
            </button>
          ))}
        </div>
      </div>

      {loading && !preview && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preview...
        </div>
      )}

      {preview && (
        <div className="mb-6 rounded-xl bg-brand/10 p-4 text-sm text-gray-300">
          <p>
            <strong className="text-white">{shortCount}</strong> shorts total
          </p>
          {preview.platforms.youtube && (
            <p className="mt-1">
              {preview.platforms.youtube.account_name}:{" "}
              <strong>{preview.platforms.youtube.available_to_schedule}</strong>{" "}
              clips over{" "}
              <strong>{preview.platforms.youtube.estimated_days}</strong> days
              ({preview.platforms.youtube.already_posted_or_scheduled} already
              posted/scheduled)
            </p>
          )}
          {preview.platforms.tiktok && (
            <p className="mt-1">
              {preview.platforms.tiktok.account_name}:{" "}
              <strong>{preview.platforms.tiktok.available_to_schedule}</strong>{" "}
              clips over{" "}
              <strong>{preview.platforms.tiktok.estimated_days}</strong> days
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-gray-200">
          {message}
        </div>
      )}

      <button
        type="button"
        disabled={scheduling || loading}
        onClick={handleSchedule}
        className="btn-primary"
      >
        {scheduling ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Scheduling...
          </>
        ) : (
          <>
            <CalendarClock className="h-5 w-5" />
            Schedule posts
          </>
        )}
      </button>

      {schedules.length > 0 && (
        <div className="mt-8">
          <h4 className="mb-3 font-medium text-gray-300">Scheduled queue</h4>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-surface-border bg-surface/60 px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {s.status === "posted" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
                  ) : s.status === "failed" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                  ) : (
                    <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                  )}
                  <span className="truncate">
                    {s.account_name || s.platform} · {s.filename}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  {s.status === "posted"
                    ? "Posted"
                    : formatScheduleTime(s.scheduled_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
