import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  LogOut,
  Pencil,
  RotateCcw,
  Scissors,
  Settings2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import ProjectTabs from "./components/ProjectTabs";
import ResultsGrid from "./components/ResultsGrid";
import SettingsPanel from "./components/SettingsPanel";
import VideoEditor from "./components/VideoEditor";
import VideoUpload from "./components/VideoUpload";
import type {
  AppSettings,
  EditorState,
  JobStatus,
  LayoutOption,
  Step,
  VideoInput,
} from "./types";
import { emptyEditorState, emptyVideoInput, hasVideoSource } from "./types";
import {
  canUseNotifications,
  ensureNotificationPermission,
  notifyStageFailed,
  notifyStageReady,
} from "./notifications";

const DEFAULT_SETTINGS: AppSettings = {
  segmentLength: 60,
  layout: "single",
  captionsEnabled: false,
  captionStyle: "tiktok",
  maxShorts: null,
};

const STEPS: { id: Step; label: string; icon: typeof Upload }[] = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "edit", label: "Edit", icon: Pencil },
  { id: "configure", label: "Configure", icon: Settings2 },
  { id: "processing", label: "Process", icon: Scissors },
  { id: "results", label: "Results", icon: Clapperboard },
];

type Project = {
  localId: string;
  jobId: string | null;
  step: Step;
  video1: VideoInput;
  video2: VideoInput;
  settings: AppSettings;
  editor: EditorState;
  batchName: string;
  jobStatus: JobStatus | null;
  uploading: boolean;
  importMessage: string;
  error: string | null;
};

function newLocalId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createEmptyProject(): Project {
  return {
    localId: newLocalId(),
    jobId: null,
    step: "upload",
    video1: emptyVideoInput(),
    video2: emptyVideoInput(),
    settings: { ...DEFAULT_SETTINGS },
    editor: emptyEditorState(),
    batchName: "",
    jobStatus: null,
    uploading: false,
    importMessage: "",
    error: null,
  };
}

function projectLabel(p: Project): string {
  const name = p.batchName.trim() || p.jobStatus?.batch_name?.trim();
  if (name) return name;
  return "New project";
}

export default function App() {
  const { user, loading, logout, authFetch } = useAuth();
  const [projects, setProjects] = useState<Project[]>(() => [createEmptyProject()]);
  const [activeId, setActiveId] = useState("");
  const [layouts, setLayouts] = useState<LayoutOption[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => canUseNotifications() && Notification.permission === "granted"
  );

  const active = useMemo(() => {
    if (activeId) {
      return projects.find((p) => p.localId === activeId) ?? projects[0];
    }
    return projects[0];
  }, [projects, activeId]);

  useEffect(() => {
    if (!activeId && projects[0]) {
      setActiveId(projects[0].localId);
    }
  }, [activeId, projects]);

  const updateProject = useCallback((localId: string, patch: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p))
    );
  }, []);

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
        const localId = newLocalId();
        const restored: Project = {
          ...createEmptyProject(),
          localId,
          jobId: savedJob,
          step: "results",
        };
        setProjects((prev) => [...prev, restored]);
        setActiveId(localId);
        getJobStatus(savedJob)
          .then((status) => {
            updateProject(localId, {
              jobStatus: status,
              batchName: status.batch_name || "",
              step: status.status === "completed" ? "results" : "processing",
            });
          })
          .catch(console.error);
      }
      if (success === "0") {
        setProjects((prev) =>
          prev.map((p, i) =>
            i === prev.length - 1
              ? {
                  ...p,
                  error: `Could not connect ${oauth}. Open "OAuth setup help" on the Results page.`,
                }
              : p
          )
        );
      }
    }
  }, [user, updateProject]);

  useEffect(() => {
    if (!active) return;
    if (!hasVideoSource(active.video2) && active.settings.layout !== "single") {
      updateProject(active.localId, {
        settings: { ...active.settings, layout: "single" },
      });
    }
  }, [active, updateProject]);

  // Poll every project that is importing or processing — not just the active tab.
  useEffect(() => {
    const watch = projects.filter(
      (p) =>
        p.jobId &&
        (p.step === "processing" ||
          p.uploading ||
          ["queued", "processing", "importing"].includes(p.jobStatus?.status || ""))
    );
    if (watch.length === 0) return;

    const interval = setInterval(async () => {
      await Promise.all(
        watch.map(async (p) => {
          if (!p.jobId) return;
          try {
            const status = await getJobStatus(p.jobId);
            const prevStatus = p.jobStatus?.status;
            const patch: Partial<Project> = { jobStatus: status };

            if (status.status === "completed" && p.step === "processing") {
              patch.step = "results";
              if (prevStatus !== "completed") {
                notifyStageReady(
                  "ShortForge — Shorts ready!",
                  `${status.batch_name || projectLabel(p)}: ${status.completed_shorts} shorts ready.`
                );
              }
            } else if (status.status === "failed" && p.step === "processing") {
              patch.error = status.error || status.message || "Something went wrong.";
              if (prevStatus !== "failed") {
                notifyStageFailed(
                  "ShortForge — Processing failed",
                  status.error || status.message || "Something went wrong."
                );
              }
            }
            updateProject(p.localId, patch);
          } catch {
            /* retry next tick */
          }
        })
      );
    }, 1500);

    return () => clearInterval(interval);
  }, [projects, updateProject]);

  const handleEnableNotifications = async () => {
    const granted = await ensureNotificationPermission();
    setNotificationsEnabled(granted);
  };

  const handleNewProject = () => {
    const p = createEmptyProject();
    setProjects((prev) => [...prev, p]);
    setActiveId(p.localId);
  };

  const handleCloseProject = (localId: string) => {
    setProjects((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((p) => p.localId !== localId);
      if (activeId === localId) {
        setActiveId(next[next.length - 1]?.localId ?? next[0].localId);
      }
      return next;
    });
  };

  const handleStartUpload = async () => {
    if (!active || !hasVideoSource(active.video1)) return;
    const name = active.batchName.trim();
    if (!name) {
      updateProject(active.localId, {
        error: "Give this batch a name before continuing.",
      });
      return;
    }
    const localId = active.localId;
    updateProject(localId, {
      uploading: true,
      error: null,
      importMessage: "",
    });
    await ensureNotificationPermission();
    setNotificationsEnabled(
      canUseNotifications() && Notification.permission === "granted"
    );
    try {
      const id = await createJob(name);
      updateProject(localId, { jobId: id });
      const result = await submitVideos(
        id,
        active.video1,
        hasVideoSource(active.video2) ? active.video2 : null
      );
      if (result.status === "importing") {
        updateProject(localId, { importMessage: "Downloading video..." });
        await waitForImport(id, (msg) =>
          updateProject(localId, { importMessage: msg })
        );
      }
      notifyStageReady(
        "ShortForge — Import complete",
        `${name} is ready. Edit clips and soundtrack, then generate shorts.`
      );
      updateProject(localId, { step: "edit", uploading: false, importMessage: "" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      updateProject(localId, {
        error: message,
        uploading: false,
        importMessage: "",
      });
      notifyStageFailed("ShortForge — Import failed", message);
    }
  };

  const handleContinueFromEdit = () => {
    if (!active) return;
    if (active.editor.cutMode === "custom") {
      if (active.editor.clips.length === 0) {
        updateProject(active.localId, {
          error: "Add at least one custom part, or switch back to auto parts.",
        });
        return;
      }
      const invalid = active.editor.clips.some((c) => c.end - c.start < 1);
      if (invalid) {
        updateProject(active.localId, {
          error: "Each custom part must be at least 1 second.",
        });
        return;
      }
    } else if (active.editor.trimEnd - active.editor.trimStart < 1) {
      updateProject(active.localId, {
        error: "Trim range is too short. Keep at least 1 second.",
      });
      return;
    }
    updateProject(active.localId, { error: null, step: "configure" });
  };

  const handleProcess = async () => {
    if (!active?.jobId) return;
    if (!active.batchName.trim()) {
      updateProject(active.localId, {
        error: "Give this batch a name before generating shorts.",
      });
      return;
    }
    if (
      active.editor.cutMode === "auto" &&
      active.editor.trimEnd - active.editor.trimStart < active.settings.segmentLength
    ) {
      updateProject(active.localId, {
        error: `Trimmed range is too short for ${active.settings.segmentLength}s clips. Use custom parts or a shorter clip length.`,
      });
      return;
    }
    const localId = active.localId;
    updateProject(localId, { error: null });
    await ensureNotificationPermission();
    setNotificationsEnabled(
      canUseNotifications() && Notification.permission === "granted"
    );
    try {
      await startProcessing(
        active.jobId,
        active.settings,
        active.editor,
        active.batchName
      );
      updateProject(localId, { step: "processing" });
      const status = await getJobStatus(active.jobId);
      updateProject(localId, { jobStatus: status });
    } catch (e) {
      updateProject(localId, {
        error: e instanceof Error ? e.message : "Processing failed",
      });
    }
  };

  const handleReset = () => {
    if (!active) return;
    updateProject(active.localId, {
      jobId: null,
      step: "upload",
      video1: emptyVideoInput(),
      video2: emptyVideoInput(),
      settings: { ...DEFAULT_SETTINGS },
      editor: emptyEditorState(),
      batchName: "",
      jobStatus: null,
      uploading: false,
      importMessage: "",
      error: null,
    });
  };

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

  if (!active) {
    return null;
  }

  const isGuest = user.email === "guest@local";
  const step = active.step;
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const otherBusy = projects.some(
    (p) =>
      p.localId !== active.localId &&
      (p.step === "processing" ||
        p.uploading ||
        ["queued", "processing", "importing"].includes(p.jobStatus?.status || ""))
  );

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
                Reset project
              </button>
            )}
            {!isGuest && (
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
            )}
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <ProjectTabs
            projects={projects.map((p) => ({
              localId: p.localId,
              label: projectLabel(p),
              step: p.step,
              status: p.jobStatus?.status,
              busy: p.uploading,
            }))}
            activeId={active.localId}
            onSelect={setActiveId}
            onNew={handleNewProject}
            onClose={handleCloseProject}
          />
          {otherBusy && (
            <p className="mt-2 text-xs text-gray-500">
              Other projects keep running in the background — switch tabs anytime.
            </p>
          )}
        </div>
      </header>

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        <nav className="mb-10 flex justify-center">
          <ol className="flex items-center gap-2 sm:gap-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === stepIndex;
              const done = i < stepIndex;
              return (
                <li key={s.id} className="flex items-center gap-2 sm:gap-4">
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition sm:px-4 ${
                      isActive
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

        {active.error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
            {active.error}
          </div>
        )}

        <main className="glass-card p-6 sm:p-8">
          {step === "upload" && (
            <>
              <VideoUpload
                video1={active.video1}
                video2={active.video2}
                onVideo1={(video1) => updateProject(active.localId, { video1 })}
                onVideo2={(video2) => updateProject(active.localId, { video2 })}
                batchName={active.batchName}
                onBatchName={(batchName) =>
                  updateProject(active.localId, { batchName })
                }
              />
              {canUseNotifications() && !notificationsEnabled && (
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  className="mt-4 w-full rounded-xl border border-surface-border bg-surface/50 px-4 py-3 text-left text-sm text-gray-400 transition hover:border-brand/40 hover:text-gray-200"
                >
                  Enable desktop notifications — get alerted when import or processing
                  finishes (even in another tab)
                </button>
              )}
              <div className="mt-8 flex flex-col items-end gap-2">
                {active.uploading && active.importMessage && (
                  <p className="text-sm text-gray-400">{active.importMessage}</p>
                )}
                <button
                  type="button"
                  disabled={
                    !hasVideoSource(active.video1) ||
                    !active.batchName.trim() ||
                    active.uploading
                  }
                  onClick={handleStartUpload}
                  className="btn-primary"
                >
                  {active.uploading
                    ? active.importMessage || "Importing..."
                    : "Continue"}
                  {!active.uploading && <ArrowRight className="h-5 w-5" />}
                </button>
              </div>
            </>
          )}

          {step === "edit" && active.jobId && (
            <>
              <VideoEditor
                jobId={active.jobId}
                hasSecondVideo={hasVideoSource(active.video2)}
                editor={active.editor}
                onChange={(next) => {
                  const localId = active.localId;
                  setProjects((prev) =>
                    prev.map((p) => {
                      if (p.localId !== localId) return p;
                      const editor =
                        typeof next === "function" ? next(p.editor) : next;
                      return { ...p, editor };
                    })
                  );
                }}
                onError={(error) => updateProject(active.localId, { error })}
              />
              <div className="mt-10 flex justify-between">
                <button
                  type="button"
                  onClick={() => updateProject(active.localId, { step: "upload" })}
                  className="btn-secondary"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleContinueFromEdit}
                  className="btn-primary"
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </>
          )}

          {step === "configure" && (
            <>
              <div className="space-y-10">
                <div>
                  <label
                    htmlFor="configure-batch-name"
                    className="font-display mb-1 block text-lg font-semibold"
                  >
                    Batch name
                  </label>
                  <p className="mb-3 text-sm text-gray-400">
                    Shorts will be saved in{" "}
                    <span className="text-gray-300">output/</span> under this name,
                    numbered in order.
                  </p>
                  <input
                    id="configure-batch-name"
                    type="text"
                    maxLength={80}
                    value={active.batchName}
                    onChange={(e) =>
                      updateProject(active.localId, { batchName: e.target.value })
                    }
                    className="w-full max-w-md rounded-xl border border-surface-border bg-surface px-4 py-3 outline-none focus:border-brand"
                  />
                </div>
                <LayoutPicker
                  layouts={layouts}
                  selected={active.settings.layout}
                  hasSecondVideo={hasVideoSource(active.video2)}
                  onSelect={(layout) =>
                    updateProject(active.localId, {
                      settings: { ...active.settings, layout },
                    })
                  }
                />
                <SettingsPanel
                  settings={active.settings}
                  editor={active.editor}
                  onChange={(settings) =>
                    updateProject(active.localId, { settings })
                  }
                />
              </div>
              <div className="mt-10 flex justify-between">
                <button
                  type="button"
                  onClick={() => updateProject(active.localId, { step: "edit" })}
                  className="btn-secondary"
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={!active.batchName.trim()}
                  className="btn-primary"
                >
                  <Scissors className="h-5 w-5" />
                  Generate Shorts
                </button>
              </div>
            </>
          )}

          {step === "processing" && active.jobStatus && (
            <div className="space-y-6">
              <ProgressView status={active.jobStatus} />
              <div className="rounded-xl border border-surface-border bg-surface/40 px-4 py-3 text-sm text-gray-400">
                You can open{" "}
                <button
                  type="button"
                  onClick={handleNewProject}
                  className="text-brand underline-offset-2 hover:underline"
                >
                  New project
                </button>{" "}
                and keep working — this one will finish in the background.
              </div>
            </div>
          )}

          {step === "results" && active.jobId && active.jobStatus && (
            <ResultsGrid
              jobId={active.jobId}
              shorts={active.jobStatus.shorts}
              batchName={active.jobStatus.batch_name || active.batchName}
              batchSlug={active.jobStatus.batch_slug}
            />
          )}
        </main>

        <footer className="mt-8 text-center text-xs text-gray-600">
          Output: 1080×1920 MP4 · H.264 · Optimized for Shorts & TikTok
        </footer>
      </div>
    </div>
  );
}
