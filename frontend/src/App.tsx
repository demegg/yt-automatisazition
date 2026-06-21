import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  LogOut,
  RotateCcw,
  Scissors,
  Settings2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createJob,
  fetchLayouts,
  getJobStatus,
  setApiAuthFetch,
  startProcessing,
  submitVideos,
  waitForImport,
} from "./api";
import { popReturnJob } from "./components/PublishPanel";
import LoginPage from "./components/LoginPage";
import Logo from "./components/Logo";
import { useAuth } from "./auth";
import LayoutPicker from "./components/LayoutPicker";
import ProgressView from "./components/ProgressView";
import ResultsGrid from "./components/ResultsGrid";
import SettingsPanel from "./components/SettingsPanel";
import VideoUpload from "./components/VideoUpload";
import type { AppSettings, JobStatus, LayoutOption, Step, VideoInput } from "./types";
import { emptyVideoInput, hasVideoSource } from "./types";
import {
  canUseNotifications,
  ensureNotificationPermission,
  notifyStageFailed,
  notifyStageReady,
} from "./notifications";

const DEFAULT_SETTINGS: AppSettings = {
  segmentLength: 60,
  layout: "single",
  captionsEnabled: true,
  captionStyle: "tiktok",
  maxShorts: null,
};

const STEPS: { id: Step; label: string; icon: typeof Upload }[] = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "configure", label: "Configure", icon: Settings2 },
  { id: "processing", label: "Process", icon: Scissors },
  { id: "results", label: "Results", icon: Clapperboard },
];

export default function App() {
  const { user, loading, logout, authFetch } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [jobId, setJobId] = useState<string | null>(null);
  const [video1, setVideo1] = useState<VideoInput>(emptyVideoInput());
  const [video2, setVideo2] = useState<VideoInput>(emptyVideoInput());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [layouts, setLayouts] = useState<LayoutOption[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => canUseNotifications() && Notification.permission === "granted"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApiAuthFetch(authFetch);
  }, [authFetch]);

  useEffect(() => {
    if (!user) return;
    fetchLayouts().then(setLayouts).catch(console.error);

    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    const success = params.get("success");
    if (oauth) {
      window.history.replaceState({}, "", window.location.pathname);
      const savedJob = popReturnJob();
      if (savedJob) {
        setJobId(savedJob);
        getJobStatus(savedJob)
          .then((status) => {
            setJobStatus(status);
            if (status.status === "completed") setStep("results");
          })
          .catch(console.error);
      }
      if (success === "1") {
        setError(null);
      } else if (success === "0") {
        setError(
          `Could not connect ${oauth}. Open "OAuth setup help" on the Results page.`
        );
      }
    }
  }, [user]);

  useEffect(() => {
    if (!hasVideoSource(video2) && settings.layout !== "single") {
      setSettings((s) => ({ ...s, layout: "single" }));
    }
  }, [video2, settings.layout]);

  const pollStatus = useCallback(async (id: string) => {
    const status = await getJobStatus(id);
    setJobStatus(status);
    return status;
  }, []);

  useEffect(() => {
    if (step !== "processing" || !jobId) return;

    const interval = setInterval(async () => {
      try {
        const status = await pollStatus(jobId);
        if (status.status === "completed") {
          clearInterval(interval);
          notifyStageReady(
            "ShortForge — Shorts ready!",
            `${status.completed_shorts} shorts are ready to download.`
          );
          setStep("results");
        } else if (status.status === "failed") {
          clearInterval(interval);
          notifyStageFailed(
            "ShortForge — Processing failed",
            status.error || status.message || "Something went wrong."
          );
        }
      } catch {
        /* retry next tick */
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [step, jobId, pollStatus]);

  const handleEnableNotifications = async () => {
    const granted = await ensureNotificationPermission();
    setNotificationsEnabled(granted);
  };

  const handleStartUpload = async () => {
    if (!hasVideoSource(video1)) return;
    setUploading(true);
    setError(null);
    setImportMessage("");
    await ensureNotificationPermission();
    setNotificationsEnabled(
      canUseNotifications() && Notification.permission === "granted"
    );
    try {
      const id = await createJob();
      setJobId(id);
      const result = await submitVideos(
        id,
        video1,
        hasVideoSource(video2) ? video2 : null
      );
      if (result.status === "importing") {
        setImportMessage("Downloading video...");
        await waitForImport(id, setImportMessage);
      }
      notifyStageReady(
        "ShortForge — Import complete",
        "Your video is ready. Configure and generate shorts."
      );
      setStep("configure");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setError(message);
      notifyStageFailed("ShortForge — Import failed", message);
    } finally {
      setUploading(false);
      setImportMessage("");
    }
  };

  const handleProcess = async () => {
    if (!jobId) return;
    setError(null);
    await ensureNotificationPermission();
    setNotificationsEnabled(
      canUseNotifications() && Notification.permission === "granted"
    );
    try {
      await startProcessing(jobId, settings);
      setStep("processing");
      await pollStatus(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Processing failed");
    }
  };

  const handleReset = () => {
    setStep("upload");
    setJobId(null);
    setVideo1(emptyVideoInput());
    setVideo2(emptyVideoInput());
    setSettings(DEFAULT_SETTINGS);
    setJobStatus(null);
    setImportMessage("");
    setError(null);
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-gray-400">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <header className="relative border-b border-surface-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Logo size={56} />
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">
                ShortForge
              </h1>
              <p className="text-xs text-gray-400">
                Long video → viral shorts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step !== "upload" && (
              <button
                type="button"
                onClick={handleReset}
                className="btn-secondary text-sm"
              >
                <RotateCcw className="h-4 w-4" />
                Start Over
              </button>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="btn-secondary text-sm"
              title={user.email}
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline max-w-[140px] truncate">
                {user.email}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        <nav className="mb-10 flex justify-center">
          <ol className="flex items-center gap-2 sm:gap-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === stepIndex;
              const done = i < stepIndex;
              return (
                <li key={s.id} className="flex items-center gap-2 sm:gap-4">
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition sm:px-4 ${
                      active
                        ? "bg-brand/20 text-brand"
                        : done
                          ? "text-gray-400"
                          : "text-gray-600"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={`h-px w-6 sm:w-10 ${done ? "bg-brand/40" : "bg-surface-border"}`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
            {error}
          </div>
        )}

        <main className="glass-card p-6 sm:p-8">
          {step === "upload" && (
            <>
              <VideoUpload
                video1={video1}
                video2={video2}
                onVideo1={setVideo1}
                onVideo2={setVideo2}
              />
              {canUseNotifications() && !notificationsEnabled && (
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  className="mt-4 w-full rounded-xl border border-surface-border bg-surface/50 px-4 py-3 text-left text-sm text-gray-400 transition hover:border-brand/40 hover:text-gray-200"
                >
                  Enable desktop notifications — get alerted when import or processing
                  finishes (even in another window)
                </button>
              )}
              <div className="mt-8 flex flex-col items-end gap-2">
                {uploading && importMessage && (
                  <p className="text-sm text-gray-400">{importMessage}</p>
                )}
                <button
                  type="button"
                  disabled={!hasVideoSource(video1) || uploading}
                  onClick={handleStartUpload}
                  className="btn-primary"
                >
                  {uploading
                    ? importMessage || "Importing..."
                    : "Continue"}
                  {!uploading && <ArrowRight className="h-5 w-5" />}
                </button>
              </div>
            </>
          )}

          {step === "configure" && (
            <>
              <div className="space-y-10">
                <LayoutPicker
                  layouts={layouts}
                  selected={settings.layout}
                  hasSecondVideo={hasVideoSource(video2)}
                  onSelect={(layout) =>
                    setSettings((s) => ({ ...s, layout }))
                  }
                />
                <SettingsPanel settings={settings} onChange={setSettings} />
              </div>
              <div className="mt-10 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep("upload")}
                  className="btn-secondary"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleProcess}
                  className="btn-primary"
                >
                  <Scissors className="h-5 w-5" />
                  Generate Shorts
                </button>
              </div>
            </>
          )}

          {step === "processing" && jobStatus && (
            <ProgressView status={jobStatus} />
          )}

          {step === "results" && jobId && jobStatus && (
            <ResultsGrid jobId={jobId} shorts={jobStatus.shorts} />
          )}
        </main>

        <footer className="mt-8 text-center text-xs text-gray-600">
          Output: 1080×1920 MP4 · H.264 · Optimized for Shorts & TikTok
        </footer>
      </div>
    </div>
  );
}
