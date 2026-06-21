import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Loader2,
  XCircle,
  Youtube,
} from "lucide-react";
import {
  connectPlatformUrl,
  createSchedule,
  formatScheduleTime,
  getSchedulePreview,
  getSocialStatus,
  listSchedules,
} from "../api";
import type { ScheduledPost, SocialAccount, SocialStatus } from "../types";

const RETURN_KEY = "shortforge_return_job";

interface Props {
  jobId: string;
  shortCount: number;
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9.01a8.24 8.24 0 0 0 4.74 1.52V7.06a4.83 4.83 0 0 1-1.05-.25z" />
    </svg>
  );
}

const POSTS_OPTIONS = [1, 2, 3, 5];

export function saveReturnJob(jobId: string) {
  sessionStorage.setItem(RETURN_KEY, jobId);
}

export function popReturnJob(): string | null {
  const id = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  return id;
}

export default function PublishPanel({ jobId, shortCount }: Props) {
  const [social, setSocial] = useState<SocialStatus | null>(null);
  const [youtubeId, setYoutubeId] = useState<number | null>(null);
  const [tiktokId, setTiktokId] = useState<number | null>(null);
  const [youtubeOn, setYoutubeOn] = useState(true);
  const [tiktokOn, setTiktokOn] = useState(true);
  const [postsPerDay, setPostsPerDay] = useState(2);
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof getSchedulePreview>
  > | null>(null);
  const [schedules, setSchedules] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const youtubeAccounts =
    social?.accounts.filter((a) => a.platform === "youtube") ?? [];
  const tiktokAccounts =
    social?.accounts.filter((a) => a.platform === "tiktok") ?? [];

  const pickDefaults = useCallback((status: SocialStatus) => {
    const yt = status.accounts.filter((a) => a.platform === "youtube");
    const tt = status.accounts.filter((a) => a.platform === "tiktok");
    if (yt.length > 0) {
      const def = yt.find((a) => a.is_default) ?? yt[0];
      setYoutubeId(def.id);
      setYoutubeOn(true);
    } else {
      setYoutubeId(null);
      setYoutubeOn(false);
    }
    if (tt.length > 0) {
      const def = tt.find((a) => a.is_default) ?? tt[0];
      setTiktokId(def.id);
      setTiktokOn(true);
    } else {
      setTiktokId(null);
      setTiktokOn(false);
    }
  }, []);

  const loadSocial = useCallback(async (resetDefaults = false) => {
    try {
      const status = await getSocialStatus();
      setSocial(status);
      if (resetDefaults) pickDefaults(status);
      return status;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
      return null;
    }
  }, [pickDefaults]);

  const activeYoutubeId = youtubeOn ? youtubeId : null;
  const activeTiktokId = tiktokOn ? tiktokId : null;

  const loadPreviewAndQueue = useCallback(async () => {
    if (activeYoutubeId || activeTiktokId) {
      try {
        const previewData = await getSchedulePreview(
          jobId,
          postsPerDay,
          activeYoutubeId,
          activeTiktokId
        );
        setPreview(previewData);
      } catch (e) {
        setPreview(null);
        const msg = e instanceof Error ? e.message : "";
        if (msg && !msg.includes("No shorts")) setError(msg);
      }
    } else {
      setPreview(null);
    }

    try {
      setSchedules(await listSchedules(jobId));
    } catch {
      setSchedules([]);
    }
  }, [jobId, postsPerDay, activeYoutubeId, activeTiktokId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadSocial(true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSocial]);

  useEffect(() => {
    if (loading) return;
    loadPreviewAndQueue();
  }, [loading, loadPreviewAndQueue]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await loadSocial(false);
    await loadPreviewAndQueue();
    setLoading(false);
  }, [loadSocial, loadPreviewAndQueue]);

  const handleConnect = (platform: "youtube" | "tiktok") => {
    saveReturnJob(jobId);
    window.location.href = connectPlatformUrl(platform);
  };

  const handleSchedule = async () => {
    const targets: { platform: string; account_id: number }[] = [];
    if (youtubeOn && youtubeId) {
      targets.push({ platform: "youtube", account_id: youtubeId });
    }
    if (tiktokOn && tiktokId) {
      targets.push({ platform: "tiktok", account_id: tiktokId });
    }
    if (targets.length === 0) {
      setError("Connect at least one account above, then try again.");
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
        `Done! ${result.total_scheduled} posts scheduled. They'll upload automatically — 9am–9pm, ${postsPerDay} per day per platform.`
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scheduling failed");
    } finally {
      setScheduling(false);
    }
  };

  const accountLabel = (accounts: SocialAccount[], id: number | null) =>
    accounts.find((a) => a.id === id)?.display_name ?? "Connected";

  const canSchedule =
    (youtubeOn && youtubeId) || (tiktokOn && tiktokId);

  return (
    <div className="rounded-2xl border border-surface-border bg-surface/40 p-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/20">
          <CalendarClock className="h-5 w-5 text-brand" />
        </div>
        <div>
          <h3 className="font-display text-xl font-bold">Publish & schedule</h3>
          <p className="text-sm text-gray-400">
            Connect accounts once, then schedule all {shortCount} clips
          </p>
        </div>
      </div>

      {/* Step 1 — Connect */}
      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-white">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/20 text-xs text-brand">
            1
          </span>
          Connect your accounts
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-surface-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <Youtube className="h-5 w-5 text-red-500" />
              <span className="font-medium">YouTube Shorts</span>
            </div>
            {youtubeAccounts.length > 0 ? (
              <p className="mb-3 flex items-center gap-2 text-sm text-brand">
                <CheckCircle2 className="h-4 w-4" />
                {accountLabel(youtubeAccounts, youtubeId)}
              </p>
            ) : social?.youtube_configured ? (
              <p className="mb-3 text-sm text-gray-500">Not connected yet</p>
            ) : (
              <p className="mb-3 text-sm text-gray-500">Add Google keys to backend/.env</p>
            )}
            {social?.youtube_configured && (
              <button
                type="button"
                onClick={() => handleConnect("youtube")}
                className="btn-secondary w-full text-sm"
              >
                <ExternalLink className="h-4 w-4" />
                {youtubeAccounts.length > 0 ? "Connect another" : "Connect YouTube"}
              </button>
            )}
          </div>
          <div className="rounded-xl border border-surface-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <TikTokIcon className="h-5 w-5" />
              <span className="font-medium">TikTok</span>
            </div>
            {tiktokAccounts.length > 0 ? (
              <p className="mb-3 flex items-center gap-2 text-sm text-brand">
                <CheckCircle2 className="h-4 w-4" />
                {accountLabel(tiktokAccounts, tiktokId)}
              </p>
            ) : social?.tiktok_configured ? (
              <p className="mb-3 text-sm text-gray-500">Not connected yet</p>
            ) : (
              <p className="mb-3 text-sm text-gray-500">Add TikTok keys to backend/.env</p>
            )}
            {social?.tiktok_configured && (
              <button
                type="button"
                onClick={() => handleConnect("tiktok")}
                className="btn-secondary w-full text-sm"
              >
                <ExternalLink className="h-4 w-4" />
                {tiktokAccounts.length > 0 ? "Connect another" : "Connect TikTok"}
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
        >
          <ChevronDown className={`h-3 w-3 transition ${showHelp ? "rotate-180" : ""}`} />
          First time? OAuth setup help
        </button>
        {showHelp && (
          <div className="mt-2 rounded-lg border border-surface-border bg-surface/60 p-3 text-xs text-gray-400">
            <p className="mb-2 text-gray-300">Google Cloud (YouTube):</p>
            <p>Credentials → OAuth client → add redirect URIs:</p>
            <code className="block text-brand">http://127.0.0.1:8890/api/social/youtube/callback</code>
            <code className="block text-brand">http://localhost:8890/api/social/youtube/callback</code>
            <p className="mt-2">
              OAuth consent screen → <strong className="text-gray-300">Test users</strong> → add the
              exact Gmail you use on the Google sign-in screen (e.g. urdiademetre@gmail.com).
            </p>
            <p className="mt-2 text-amber-200/90">
              If Google shows &quot;has not completed verification&quot; or Error 403 access_denied,
              your app is still in Testing mode — add yourself as a test user, or publish to
              Production after Google verification.
            </p>
            <p className="mt-3 mb-2 text-gray-300">TikTok (developers.tiktok.com):</p>
            <code className="block text-brand">http://127.0.0.1:8890/api/social/tiktok/callback</code>
          </div>
        )}
      </div>

      {/* Step 2 — Choose platforms */}
      {(youtubeAccounts.length > 0 || tiktokAccounts.length > 0) && (
        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-white">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/20 text-xs text-brand">
              2
            </span>
            Post to
          </p>
          <div className="flex flex-wrap gap-3">
            {youtubeAccounts.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-surface-border px-4 py-2">
                <input
                  type="checkbox"
                  checked={youtubeOn}
                  onChange={(e) => setYoutubeOn(e.target.checked)}
                  className="accent-brand"
                />
                <Youtube className="h-4 w-4 text-red-500" />
                YouTube
              </label>
            )}
            {tiktokAccounts.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-surface-border px-4 py-2">
                <input
                  type="checkbox"
                  checked={tiktokOn}
                  onChange={(e) => setTiktokOn(e.target.checked)}
                  className="accent-brand"
                />
                <TikTokIcon className="h-4 w-4" />
                TikTok
              </label>
            )}
          </div>
          {youtubeAccounts.length > 1 && youtubeOn && (
            <select
              className="mt-3 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm"
              value={youtubeId ?? ""}
              onChange={(e) => setYoutubeId(Number(e.target.value))}
            >
              {youtubeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
          )}
          {tiktokAccounts.length > 1 && tiktokOn && (
            <select
              className="mt-3 ml-0 sm:ml-3 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm"
              value={tiktokId ?? ""}
              onChange={(e) => setTiktokId(Number(e.target.value))}
            >
              {tiktokAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Step 3 — Schedule */}
      {canSchedule && (
        <div className="mb-6">
          <p className="mb-3 text-sm font-medium text-white">
            <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/20 text-xs text-brand">
              3
            </span>
            How many posts per day?
          </p>
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
      )}

      {loading && canSchedule && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preview...
        </div>
      )}

      {preview && canSchedule && (
        <div className="mb-6 rounded-xl bg-brand/10 p-4 text-sm text-gray-300">
          {preview.platforms.youtube && (
            <p>
              YouTube: <strong>{preview.platforms.youtube.available_to_schedule}</strong> clips
              over ~<strong>{preview.platforms.youtube.estimated_days}</strong> days
            </p>
          )}
          {preview.platforms.tiktok && (
            <p className={preview.platforms.youtube ? "mt-1" : ""}>
              TikTok: <strong>{preview.platforms.tiktok.available_to_schedule}</strong> clips
              over ~<strong>{preview.platforms.tiktok.estimated_days}</strong> days
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

      {canSchedule ? (
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
              Schedule all clips
            </>
          )}
        </button>
      ) : (
        <p className="text-sm text-gray-500">
          Connect YouTube or TikTok above to schedule uploads.
        </p>
      )}

      {schedules.length > 0 && (
        <div className="mt-8">
          <h4 className="mb-3 font-medium text-gray-300">Queue</h4>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {schedules.slice(0, 20).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-surface-border bg-surface/60 px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
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
                    : s.status === "failed"
                      ? "Failed"
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
