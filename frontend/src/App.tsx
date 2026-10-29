import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  Clapperboard,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Scissors,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePageMeta } from "./site/meta";
import { useToast } from "./site/ui";
import {
  cancelJob,
  createJob,
  fetchLayouts,
  formatTime,
  getJobStatus,
  setApiAuthFetch,
  startProcessing,
  submitVideos,
  waitForImport,
} from "./api";
import { popReturnJob } from "./components/PublishPanel";
import { useAuth } from "./auth";
import LayoutPicker from "./components/LayoutPicker";
import ProgressView from "./components/ProgressView";
import ProjectTabs from "./components/ProjectTabs";
import ResultsGrid from "./components/ResultsGrid";
import SettingsPanel, { estimateShorts } from "./components/SettingsPanel";
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
  { id: "upload", label: "Import", icon: Upload },
  { id: "edit", label: "Edit", icon: Pencil },
  { id: "configure", label: "Configure", icon: Settings2 },
  { id: "processing", label: "Render", icon: Scissors },
  { id: "results", label: "Results", icon: Clapperboard },
];

type Project = {
  localId: string;
  jobId: string | null;
  step: Step;
  video1: VideoInput;
  video2: VideoInput;
  /** Whether the server has a second video for this job. Known after upload or from edit-info. */
  secondVideo: boolean;
  settings: AppSettings;
  editor: EditorState;
  batchName: string;
  jobStatus: JobStatus | null;
  uploading: boolean;
  uploadProgress: number | null;
  importMessage: string;
  error: string | null;
};

const RUNNING = ["queued", "processing", "importing"];

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
    secondVideo: false,
    settings: { ...DEFAULT_SETTINGS },
    editor: emptyEditorState(),
    batchName: "",
    jobStatus: null,
    uploading: false,
    uploadProgress: null,
    importMessage: "",
    error: null,
  };
}

function projectLabel(p: Project): string {
  const name = p.batchName.trim() || p.jobStatus?.batch_name?.trim();
  if (name) return name;
  return "New project";
}

function stepForStatus(status: string): Step {
  if (status === "completed") return "results";
  if (RUNNING.includes(status)) return "processing";
  if (status === "failed" || status === "cancelled") return "processing";
  if (status === "uploaded") return "edit";
  return "upload";
}

function Stepper({
  stepIndex,
  canJump,
  onJump,
}: {
  stepIndex: number;
  canJump: (step: Step) => boolean;
  onJump: (step: Step) => void;
}) {
  return (
    <nav aria-label="Project steps" className="relative">
      <ol className="relative grid grid-cols-5 gap-2">
        <li aria-hidden="true" className="pointer-events-none absolute left-[10%] right-[10%] top-5 h-0.5 rounded-full bg-white/[0.07]">
          <span
            className="block h-full rounded-full bg-brand-gradient transition-[width] duration-700 ease-out"
            style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
          />
        </li>
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === stepIndex;
          const done = i < stepIndex;
          const clickable = !isActive && canJump(s.id);
          return (
            <li key={s.id} className="relative flex flex-col items-center gap-2" aria-current={isActive ? "step" : undefined}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onJump(s.id)}
                title={clickable ? `Go to ${s.label}` : undefined}
                className={`relative flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-500 ${
                  isActive
                    ? "scale-110 border-transparent bg-brand-gradient text-white shadow-glow"
                    : done
                      ? "border-brand/40 bg-[#1a1210] text-brand"
                      : "border-white/10 bg-[#0d0f16] text-faint"
                } ${clickable ? "cursor-pointer hover:scale-110 hover:border-brand/70" : "cursor-default"}`}
              >
                {isActive && <span className="absolute inset-0 rounded-full bg-brand/40 animate-pulse-ring" />}
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </button>
              <span className={`text-xs font-medium transition ${isActive ? "text-ink" : done ? "text-muted" : "text-faint"}`}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function App() {
  const { user, authFetch } = useAuth();
  const toast = useToast();
  const { jobId: routeJobId } = useParams();
  const submitLock = useRef(false);
  const [routeReady, setRouteReady] = useState(!routeJobId);
  const [routeError, setRouteError] = useState<string | null>(null);
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

  const openedName = active?.batchName.trim() || active?.jobStatus?.batch_name?.trim() || "";
  usePageMeta({
    title: `${routeJobId ? openedName || "Project" : "New project"} — ShortForge`,
    description: "Private ShortForge project.",
    path: routeJobId ? `/app/projects/${routeJobId}` : "/app/new",
    index: false,
  });

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
    if (!routeJobId || !user) return;
    let cancelled = false;
    setRouteReady(false);
    setRouteError(null);
    getJobStatus(routeJobId)
      .then((status) => {
        if (cancelled) return;
        const localId = newLocalId();
        const restored: Project = {
          ...createEmptyProject(),
          localId,
          jobId: routeJobId,
          batchName: status.batch_name || "",
          jobStatus: status,
          step: stepForStatus(status.status),
          error:
            status.status === "failed"
              ? status.error || status.message || "Processing failed"
              : null,
        };
        setProjects([restored]);
        setActiveId(localId);
        setRouteReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setRouteError(err instanceof Error ? err.message : "Could not open project");
        setRouteReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [routeJobId, user]);

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
      } else {
        toast(`Connected ${oauth}`);
      }
    }
  }, [user, updateProject, toast]);

  useEffect(() => {
    if (!active) return;
    if (!active.secondVideo && active.settings.layout !== "single") {
      updateProject(active.localId, {
        settings: { ...active.settings, layout: "single" },
      });
    }
  }, [active, updateProject]);

  // Poll every project that is importing or processing — not just the active tab.
  const watchKey = projects
    .filter(
      (p) =>
        p.jobId &&
        (p.step === "processing" || p.uploading || RUNNING.includes(p.jobStatus?.status || ""))
    )
    .map((p) => `${p.localId}:${p.jobId}:${p.step}:${p.jobStatus?.status ?? ""}`)
    .join("|");
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  useEffect(() => {
    if (!watchKey) return;
    const interval = setInterval(async () => {
      const watch = projectsRef.current.filter(
        (p) =>
          p.jobId &&
          (p.step === "processing" || p.uploading || RUNNING.includes(p.jobStatus?.status || ""))
      );
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
                toast("Shorts ready", { body: `${status.batch_name || projectLabel(p)} · ${status.completed_shorts} files` });
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
  }, [watchKey, updateProject, toast]);

  const handleEnableNotifications = async () => {
    const granted = await ensureNotificationPermission();
    setNotificationsEnabled(granted);
    toast(granted ? "Desktop notifications on" : "Notifications were not allowed", { tone: granted ? "success" : "info" });
  };

  const handleNewProject = () => {
    const p = createEmptyProject();
    setProjects((prev) => [...prev, p]);
    setActiveId(p.localId);
  };

  const handleCloseProject = (localId: string) => {
    if (projects.length <= 1) return;
    const next = projects.filter((p) => p.localId !== localId);
    setProjects(next);
    if (active?.localId === localId) {
      setActiveId(next[next.length - 1]?.localId ?? next[0].localId);
    }
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
    const second = hasVideoSource(active.video2);
    updateProject(localId, {
      uploading: true,
      uploadProgress: active.video1.mode === "file" ? 0 : null,
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
        second ? active.video2 : null,
        (percent) => updateProject(localId, { uploadProgress: percent })
      );
      if (result.status === "importing") {
        updateProject(localId, { importMessage: "Downloading video…", uploadProgress: null });
        await waitForImport(id, (msg) =>
          updateProject(localId, { importMessage: msg })
        );
      }
      notifyStageReady(
        "ShortForge — Import complete",
        `${name} is ready. Edit clips and soundtrack, then generate shorts.`
      );
      toast("Import complete", { body: `${name} is ready to edit.` });
      updateProject(localId, {
        step: "edit",
        secondVideo: second,
        uploading: false,
        uploadProgress: null,
        importMessage: "",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      updateProject(localId, {
        error: message,
        uploading: false,
        uploadProgress: null,
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
    if (submitLock.current) return;
    submitLock.current = true;
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
    } finally {
      submitLock.current = false;
    }
  };

  const handleCancel = async () => {
    if (!active?.jobId) return;
    try {
      await cancelJob(active.jobId);
      const status = await getJobStatus(active.jobId);
      updateProject(active.localId, { jobStatus: status, error: null });
      toast("Stopping after the current step", { tone: "info" });
    } catch (e) {
      updateProject(active.localId, {
        error: e instanceof Error ? e.message : "Could not cancel",
      });
    }
  };

  const handleReset = () => {
    if (!active) return;
    updateProject(active.localId, {
      ...createEmptyProject(),
      localId: active.localId,
    });
  };

  /** Go back to the editor for a project whose source is already on the server. */
  const handleReedit = () => {
    if (!active?.jobId) return;
    updateProject(active.localId, { step: "edit", error: null });
  };

  if (!routeReady) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-4">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-[420px] w-full rounded-3xl" />
      </div>
    );
  }

  if (routeError) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center animate-fade-up">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-semibold">Couldn’t open this project</h1>
        <p role="alert" className="mt-2 text-sm text-muted">{routeError}</p>
        <Link to="/app/projects" className="btn-secondary mt-6">
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </Link>
      </div>
    );
  }

  if (!user || !active) {
    return null;
  }

  const step = active.step;
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const busy = active.uploading || RUNNING.includes(active.jobStatus?.status || "");
  const otherBusy = projects.some(
    (p) =>
      p.localId !== active.localId &&
      (p.step === "processing" || p.uploading || RUNNING.includes(p.jobStatus?.status || ""))
  );
  const canJump = (target: Step) => {
    if (busy || !active.jobId) return false;
    if (target === "edit") return step !== "upload";
    if (target === "configure") return step !== "configure" && active.editor.duration > 0;
    if (target === "results") return active.jobStatus?.status === "completed";
    return false;
  };
  const estimate = estimateShorts(active.settings, active.editor);
  const status = active.jobStatus?.status;

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link to="/app/projects" className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> All projects
          </Link>
          <h1 className="mt-2 truncate font-display text-3xl font-semibold tracking-tight">{projectLabel(active)}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {step !== "upload" && !busy && (
            <button type="button" onClick={handleReset} className="btn-ghost">
              <RotateCcw className="h-4 w-4" />
              Start over
            </button>
          )}
        </div>
      </div>
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
        <p className="mt-2 flex items-center gap-2 text-xs text-faint">
          <Loader2 className="h-3 w-3 animate-spin" />
          Other drafts keep running in the background.
        </p>
      )}

      <div className="py-8">
        <div className="mb-8">
          <Stepper stepIndex={stepIndex} canJump={canJump} onJump={(target) => updateProject(active.localId, { step: target, error: null })} />
        </div>

        {active.error && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-fade-up">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1">{active.error}</p>
            <button
              type="button"
              className="rounded-full p-1 transition hover:bg-danger/20"
              aria-label="Dismiss error"
              onClick={() => updateProject(active.localId, { error: null })}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <section key={`${active.localId}-${step}`} className="glass-card p-5 animate-fade-up sm:p-8">
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
                disabled={active.uploading}
              />
              {canUseNotifications() && !notificationsEnabled && (
                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  className="mt-5 flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-left text-sm text-muted transition hover:border-brand/40 hover:text-ink"
                >
                  <Bell className="h-4 w-4 text-brand" />
                  Get a desktop notification when import or rendering finishes — even in another tab.
                </button>
              )}
              <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
                {active.uploading && (
                  <div className="flex-1 sm:max-w-sm" role="status">
                    <div className="mb-1.5 flex justify-between text-xs text-muted">
                      <span>{active.uploadProgress !== null ? "Uploading" : active.importMessage || "Importing…"}</span>
                      {active.uploadProgress !== null && <span className="tabular-nums">{active.uploadProgress}%</span>}
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${active.uploadProgress !== null ? Math.max(2, active.uploadProgress) : 100}%` }}
                      />
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  disabled={
                    !hasVideoSource(active.video1) ||
                    !active.batchName.trim() ||
                    active.uploading
                  }
                  onClick={handleStartUpload}
                  className="btn-primary px-6 py-3"
                >
                  {active.uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {active.uploadProgress !== null && active.uploadProgress >= 100 ? "Processing upload…" : "Importing…"}
                    </>
                  ) : (
                    <>
                      Continue to editor
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {step === "edit" && active.jobId && (
            <>
              <VideoEditor
                jobId={active.jobId}
                hasSecondVideo={active.secondVideo}
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
                onInfo={(info) => updateProject(active.localId, { secondVideo: info.has_video2 })}
                onError={(error) => updateProject(active.localId, { error })}
              />
              <div className="mt-10 flex justify-between gap-3">
                {active.jobStatus?.status === "completed" ? (
                  <button
                    type="button"
                    onClick={() => updateProject(active.localId, { step: "results" })}
                    className="btn-secondary"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to results
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleContinueFromEdit}
                  className="btn-primary px-6"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}

          {step === "configure" && (
            <>
              <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-10">
                  <div>
                    <label
                      htmlFor="configure-batch-name"
                      className="mb-1 block font-display text-lg font-semibold"
                    >
                      Batch name
                    </label>
                    <p className="mb-3 text-sm text-muted">
                      Shorts are saved in <span className="text-ink/80">output/</span> under this name, numbered in order.
                    </p>
                    <input
                      id="configure-batch-name"
                      type="text"
                      maxLength={80}
                      value={active.batchName}
                      onChange={(e) =>
                        updateProject(active.localId, { batchName: e.target.value })
                      }
                      className="field max-w-md py-3"
                    />
                  </div>
                  <LayoutPicker
                    layouts={layouts}
                    selected={active.settings.layout}
                    hasSecondVideo={active.secondVideo}
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
                <aside className="xl:sticky xl:top-24 xl:self-start">
                  <div className="gradient-border rounded-3xl bg-[#0d0e15] p-5">
                    <p className="section-kicker">Render summary</p>
                    <p className="mt-4 font-display text-5xl font-semibold tabular-nums text-white">
                      {estimate}
                    </p>
                    <p className="text-sm text-muted">short{estimate === 1 ? "" : "s"} will be created</p>
                    <dl className="mt-5 space-y-2.5 border-t border-white/[0.07] pt-4 text-sm">
                      {[
                        ["Cut", active.editor.cutMode === "custom" ? `${active.editor.clips.length} custom part${active.editor.clips.length === 1 ? "" : "s"}` : `${formatTime(active.settings.segmentLength)} each`],
                        ["Range", active.editor.cutMode === "custom" ? "Custom" : `${formatTime(active.editor.trimStart)} – ${formatTime(active.editor.trimEnd)}`],
                        ["Layout", layouts.find((l) => l.id === active.settings.layout)?.name || active.settings.layout],
                        ["Captions", active.settings.captionsEnabled ? active.settings.captionStyle.replace("_", " ") : "Off"],
                        ["Soundtrack", active.editor.musicName ? "Mixed in" : "Original audio"],
                        ["Output", "1080×1920 · MP4"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <dt className="text-muted">{k}</dt>
                          <dd className="truncate text-right text-ink first-letter:uppercase">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {active.settings.captionsEnabled && (
                      <p className="mt-4 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-muted">
                        Captions add transcription time. Try a low max-shorts value first.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleProcess}
                      disabled={!active.batchName.trim() || estimate === 0}
                      className="btn-primary mt-5 w-full py-3"
                    >
                      <Scissors className="h-4 w-4" />
                      Generate {estimate || ""} short{estimate === 1 ? "" : "s"}
                    </button>
                  </div>
                </aside>
              </div>
              <div className="mt-10 flex justify-between">
                <button
                  type="button"
                  onClick={() => updateProject(active.localId, { step: "edit" })}
                  className="btn-secondary"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to editor
                </button>
              </div>
            </>
          )}

          {step === "processing" && active.jobStatus && (
            <div className="space-y-6">
              <ProgressView status={active.jobStatus} />
              <div className="flex flex-wrap justify-center gap-3">
                {status && RUNNING.includes(status) && (
                  <button type="button" className="btn-secondary" onClick={() => void handleCancel()}>
                    <X className="h-4 w-4" />
                    Stop processing
                  </button>
                )}
                {(status === "failed" || status === "cancelled") && (
                  <button type="button" className="btn-primary" onClick={handleReedit}>
                    <RefreshCw className="h-4 w-4" />
                    Adjust and try again
                  </button>
                )}
              </div>
              {status && RUNNING.includes(status) && (
                <p className="mx-auto max-w-md text-center text-xs text-faint">
                  You can leave this page or open another draft. Rendering continues on the server until it finishes or you stop it.
                </p>
              )}
            </div>
          )}

          {step === "results" && active.jobId && active.jobStatus && (
            <ResultsGrid
              jobId={active.jobId}
              shorts={active.jobStatus.shorts}
              batchName={active.jobStatus.batch_name || active.batchName}
              batchSlug={active.jobStatus.batch_slug}
              onReedit={handleReedit}
            />
          )}
        </section>

        <p className="mt-8 text-center text-xs text-faint">
          Output is fixed at 1080×1920 MP4, H.264, AAC, 30 fps.
        </p>
      </div>
    </div>
  );
}
