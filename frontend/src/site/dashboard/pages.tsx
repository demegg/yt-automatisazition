import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Circle,
  Clapperboard,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  cancelJob,
  changePassword,
  deleteJob,
  downloadAllFiles,
  fetchCapabilities,
  renameJob,
  type Capabilities,
} from "../../api";
import { useAuth } from "../../auth";
import { canUseNotifications, ensureNotificationPermission } from "../../notifications";
import type { JobSummary } from "../../types";
import { usePageMeta } from "../meta";
import {
  CountUp,
  EmptyState,
  Modal,
  Skeleton,
  StatusBadge,
  formatWhen,
  timeAgo,
  useClickOutside,
  useToast,
} from "../ui";
import { Poster, activityLines, clipCount, greetingName, isActive, useJobs } from "./data";

function usePrivateMeta(title: string, path: string) {
  usePageMeta({ title: `${title} — ShortForge`, description: "Private ShortForge workspace.", path, index: false });
}

function Alert({ children }: { children: string }) {
  return (
    <p role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-fade-up">
      {children}
    </p>
  );
}

function PageHeader({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white">{title}</h1>
        {body && <p className="mt-2 max-w-2xl text-sm text-muted">{body}</p>}
      </div>
      {action}
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value || 0)}
      aria-label={label}
    >
      <div className="progress-fill" style={{ width: `${Math.max(2, Math.min(value || 0, 100))}%` }} />
    </div>
  );
}

function ProjectMenu({
  job,
  onRename,
  onDelete,
}: {
  job: JobSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const running = isActive(job);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="icon-btn h-8 w-8"
        aria-label="Project actions"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="menu-panel absolute right-0 mt-1 w-44">
          <Link className="menu-item" to={`/app/projects/${job.job_id}`} onClick={() => setOpen(false)}>
            <FolderOpen className="h-4 w-4 text-muted" /> Open
          </Link>
          <button type="button" className="menu-item" onClick={() => { setOpen(false); onRename(); }}>
            <Pencil className="h-4 w-4 text-muted" /> Rename
          </button>
          <button
            type="button"
            className="menu-item text-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
            disabled={running}
            title={running ? "Cancel processing before deleting" : undefined}
            onClick={() => { setOpen(false); onDelete(); }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function useProjectDialogs(reload: () => Promise<void>) {
  const toast = useToast();
  const [renameTarget, setRenameTarget] = useState<JobSummary | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<JobSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onRename = async () => {
    if (!renameTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await renameJob(renameTarget.job_id, renameValue);
      setRenameTarget(null);
      toast("Project renamed", { body: renameValue.trim() });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteJob(deleteTarget.job_id);
      toast("Project deleted", { body: deleteTarget.batch_name || "Untitled" });
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const dialogs = (
    <>
      {renameTarget && (
        <Modal title="Rename project" onClose={() => setRenameTarget(null)}>
          <p>This changes the display name. Existing export folders keep their original folder name.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (renameValue.trim()) void onRename();
            }}
          >
            <label htmlFor="rename-name" className="mt-4 block text-xs font-medium text-ink">Name</label>
            <input id="rename-name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="field mt-1.5" maxLength={80} />
            {actionError && <p className="mt-2 text-xs text-danger">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRenameTarget(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={busy || !renameValue.trim()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save name
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleteTarget && (
        <Modal title="Delete project?" onClose={() => setDeleteTarget(null)}>
          <p>
            <span className="font-medium text-ink">“{deleteTarget.batch_name || "Untitled"}”</span> and its uploads and rendered shorts will be removed from the server. This can’t be undone.
          </p>
          {actionError && <p className="mt-2 text-xs text-danger">{actionError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>Keep project</button>
            <button type="button" className="btn-danger" disabled={busy} onClick={() => void onDelete()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete project
            </button>
          </div>
        </Modal>
      )}
    </>
  );

  return {
    actionError: renameTarget || deleteTarget ? null : actionError,
    dialogs,
    askRename: (job: JobSummary) => {
      setActionError(null);
      setRenameTarget(job);
      setRenameValue(job.batch_name || "");
    },
    askDelete: (job: JobSummary) => {
      setActionError(null);
      setDeleteTarget(job);
    },
  };
}

function ProjectCard({
  job,
  index = 0,
  selected,
  onToggle,
  onRename,
  onDelete,
}: {
  job: JobSummary;
  index?: number;
  selected?: boolean;
  onToggle?: (checked: boolean) => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`card card-hover group relative overflow-hidden animate-fade-up ${selected ? "border-brand/50 ring-1 ring-brand/40" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <Link to={`/app/projects/${job.job_id}`} className="relative block overflow-hidden" tabIndex={-1} aria-hidden="true">
        {job.has_preview ? (
          <Poster
            jobId={job.job_id}
            enabled
            className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-white/[0.04] to-transparent">
            <Film className="h-8 w-8 text-white/15" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-80" />
        <div className="absolute left-3 top-3">
          <StatusBadge status={job.status} />
        </div>
        {isActive(job) && (
          <div className="absolute inset-x-3 bottom-3">
            <ProgressBar value={job.progress} label="Progress" />
          </div>
        )}
        <span className="absolute bottom-3 right-3 flex h-9 w-9 translate-y-2 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-lg transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowRight className="h-4 w-4" />
        </span>
      </Link>
      {onToggle && (
        <label className={`absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border bg-black/60 backdrop-blur transition ${selected ? "border-brand opacity-100" : "border-white/20 opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
          <input
            type="checkbox"
            className="h-4 w-4"
            aria-label={`Select ${job.batch_name || "project"}`}
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
          />
        </label>
      )}
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <Link to={`/app/projects/${job.job_id}`} className="block truncate text-sm font-semibold transition hover:text-brand">
            {job.batch_name || "Untitled"}
          </Link>
          <p className="mt-1 text-xs text-muted">
            {timeAgo(job.updated_at || job.created_at)} · {clipCount(job)} clip{clipCount(job) === 1 ? "" : "s"}
          </p>
        </div>
        <ProjectMenu job={job} onRename={onRename} onDelete={onDelete} />
      </div>
    </article>
  );
}

function CardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card overflow-hidden">
          <Skeleton className="aspect-[4/5] rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </>
  );
}

export function OverviewPage() {
  usePrivateMeta("Overview", "/app");
  const { user } = useAuth();
  const { jobs, error, reload } = useJobs();
  const guest = !user || user.guest || user.email === "guest@local";
  const name = greetingName(user?.email, guest);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const checklistKey = `sf-start-${user?.id || "guest"}`;
  const [hideChecklist, setHideChecklist] = useState(() => {
    try {
      return localStorage.getItem(checklistKey) === "hidden";
    } catch {
      return false;
    }
  });
  const dialogs = useProjectDialogs(reload);

  useEffect(() => {
    fetchCapabilities().then(setCaps).catch(() => setCaps(null));
  }, []);

  const list = jobs ?? [];
  const clips = list.reduce((sum, job) => sum + clipCount(job), 0);
  const running = list.filter(isActive);
  const failed = list.filter((job) => job.status === "failed");
  const recent = [...list].sort((a, b) => (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || ""));
  const featured = recent.find((job) => job.has_preview) ?? recent[0];
  const exports = recent.filter((job) => clipCount(job) > 0).slice(0, 8);
  const created = list.length > 0;
  const imported = list.some((job) => job.has_preview || !["pending"].includes(job.status));
  const generated = clips > 0;
  const steps = [
    ["Create a project", created],
    ["Import a video", imported],
    ["Generate clips", generated],
  ] as const;
  const doneSteps = steps.filter(([, done]) => done).length;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const stats = [
    { label: "Projects", value: jobs?.length, detail: jobs && jobs.length === 100 ? "Latest 100 on this account" : "Saved on this account", icon: FolderOpen, tone: "text-accent" },
    { label: "Generated clips", value: jobs ? clips : undefined, detail: "Finished shorts across projects", icon: Clapperboard, tone: "text-brand" },
    { label: "Processing", value: jobs ? running.length : undefined, detail: "Importing, queued, or rendering", icon: Loader2, tone: "text-[#ff4d7e]" },
    { label: "Failed", value: jobs ? failed.length : undefined, detail: failed.length ? "Open the queue for details" : "Nothing needs attention", icon: Bell, tone: failed.length ? "text-danger" : "text-ok" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <section className="relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-[#0b0c13] p-6 sm:p-8">
        <div className="ambient opacity-70" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="section-kicker">
              <Sparkles className="h-3.5 w-3.5" />
              {list.length === 0 ? "Welcome" : greeting}
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {list.length === 0 ? (
                <>Let’s make your <span className="text-gradient">first short.</span></>
              ) : name ? (
                <>Welcome back, <span className="text-gradient">{name}.</span></>
              ) : (
                <>Your next great short <span className="text-gradient">starts here.</span></>
              )}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted">
              {list.length === 0
                ? "Import a long video and turn the ranges you choose into vertical clips."
                : running.length
                  ? `${running.length} project${running.length === 1 ? " is" : "s are"} rendering right now.`
                  : "Pick up where you left off, or start something new."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/new" className="btn-primary px-5 py-3">
              <Plus className="h-4 w-4" />
              New project
            </Link>
            <Link to="/app/projects" className="btn-secondary px-5 py-3">Browse projects</Link>
          </div>
        </div>
      </section>

      {error && <Alert>{error}</Alert>}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, detail, icon: Icon, tone }, index) => (
          <div key={label} className="card card-hover p-5 animate-fade-up" style={{ animationDelay: `${index * 60}ms` }}>
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-muted">{label}</dt>
              <Icon className={`h-4 w-4 ${tone} ${label === "Processing" && running.length ? "animate-spin" : ""}`} />
            </div>
            <dd className="mt-3 font-display text-3xl font-semibold tracking-tight text-white tabular-nums">
              {value === undefined ? <Skeleton className="h-8 w-12" /> : <CountUp value={value} />}
            </dd>
            <p className="mt-1 text-xs text-faint">{detail}</p>
          </div>
        ))}
      </dl>

      {jobs && jobs.length === 0 && (
        <section className="gradient-border grid gap-8 rounded-[28px] bg-white/[0.02] p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
          <div>
            <p className="section-kicker">First project</p>
            <h2 className="mt-3 font-display text-2xl font-semibold text-white">Upload a long video.</h2>
            <ol className="mt-5 space-y-3 text-sm text-muted">
              {[
                "Name the batch and add the primary file, or a link the server can try.",
                "Trim or mark the parts you want in the editor.",
                "The server renders 1080×1920 H.264 files you can download.",
              ].map((text, i) => (
                <li key={text} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand">{i + 1}</span>
                  {text}
                </li>
              ))}
            </ol>
            {caps && (
              <p className="mt-5 text-xs text-faint">
                {caps.video_extensions.join(", ")} · up to {caps.max_upload_mb} MB
              </p>
            )}
            <Link to="/app/new" className="btn-primary mt-6">
              <Upload className="h-4 w-4" />
              Upload your first video
            </Link>
          </div>
          <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-black/30 p-6">
            <div className="relative h-56 w-32">
              <div className="absolute inset-0 rotate-[-8deg] rounded-2xl border border-white/10 bg-gradient-to-b from-violet-500/30 to-transparent animate-float-slow" />
              <div className="absolute inset-0 rotate-[6deg] rounded-2xl border border-white/10 bg-gradient-to-b from-ember-500/40 to-transparent animate-float" />
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl border border-white/15 bg-[#11131b]">
                <Upload className="h-8 w-8 text-brand" />
              </div>
            </div>
          </div>
        </section>
      )}

      {jobs && jobs.length > 0 && !hideChecklist && steps.some(([, done]) => !done) && (
        <section className="card p-5 animate-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Getting started</h2>
              <p className="mt-0.5 text-xs text-muted">{doneSteps} of {steps.length} done</p>
            </div>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => {
                try {
                  localStorage.setItem(checklistKey, "hidden");
                } catch {
                  /* storage unavailable */
                }
                setHideChecklist(true);
              }}
            >
              Dismiss
            </button>
          </div>
          <div className="mt-3">
            <ProgressBar value={(doneSteps / steps.length) * 100} label="Getting started progress" />
          </div>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            {steps.map(([label, done]) => (
              <li key={label} className={`flex items-center gap-2 ${done ? "text-muted line-through" : "text-ink"}`}>
                {done ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <Circle className="h-4 w-4 text-faint" />}
                {label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured && (
        <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
          <Link to={`/app/projects/${featured.job_id}`} className="group relative block min-h-72 overflow-hidden rounded-[28px] border border-white/[0.08] bg-black">
            {featured.has_preview ? (
              <Poster jobId={featured.job_id} enabled className="absolute inset-0 h-full w-full object-cover transition duration-[1.2s] group-hover:scale-105" />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,107,61,0.22),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(124,92,255,0.2),transparent_55%)]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/60">Continue creating</p>
              <p className="mt-2 font-display text-3xl font-semibold text-white">{featured.batch_name || "Untitled"}</p>
              <p className="mt-1 text-xs text-white/70">
                {timeAgo(featured.updated_at || featured.created_at)}
                {clipCount(featured) ? ` · ${clipCount(featured)} clip${clipCount(featured) === 1 ? "" : "s"}` : ""}
                {!featured.has_preview ? " · no preview yet" : ""}
              </p>
            </div>
            <span className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition duration-300 group-hover:scale-110 group-hover:bg-white group-hover:text-black">
              <ArrowRight className="h-5 w-5" />
            </span>
          </Link>
          <div className="card flex flex-col justify-between p-6">
            <div>
              <StatusBadge status={featured.status} />
              <h2 className="mt-4 font-display text-xl font-semibold">{featured.batch_name || "Untitled"}</h2>
              <p className="mt-2 text-sm text-muted">{featured.message || "Open the project to trim, render, or download."}</p>
              {isActive(featured) && (
                <div className="mt-4">
                  <ProgressBar value={featured.progress} label="Featured project progress" />
                </div>
              )}
              {featured.error && <p className="mt-2 text-sm text-danger">{featured.error}</p>}
            </div>
            <Link to={`/app/projects/${featured.job_id}`} className="btn-primary mt-6 w-fit">
              Continue editing
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      {jobs === null && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeletons />
        </div>
      )}

      {recent.length > 1 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent projects</h2>
            <Link to="/app/projects" className="group inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover">
              View all <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.slice(0, 4).map((job, index) => (
              <ProjectCard
                key={job.job_id}
                job={job}
                index={index}
                onRename={() => dialogs.askRename(job)}
                onDelete={() => dialogs.askDelete(job)}
              />
            ))}
          </div>
          {dialogs.actionError && <div className="mt-3"><Alert>{dialogs.actionError}</Alert></div>}
          {dialogs.dialogs}
        </section>
      )}

      {running.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Processing</h2>
            <Link to="/app/queue" className="text-sm font-medium text-brand hover:text-brand-hover">Open queue</Link>
          </div>
          <ul className="mt-4 space-y-3">
            {running.map((job) => (
              <li key={job.job_id} className="card grid gap-4 p-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center">
                <Poster jobId={job.job_id} enabled={job.has_preview === true} className="h-16 w-16 rounded-xl object-cover" />
                <div className="min-w-0">
                  <Link className="text-sm font-semibold hover:text-brand" to={`/app/projects/${job.job_id}`}>{job.batch_name || "Untitled"}</Link>
                  <p className="text-xs text-muted">{job.message || job.status}{job.total_shorts ? ` · ${job.completed_shorts}/${job.total_shorts}` : ""}</p>
                  <div className="mt-2.5">
                    <ProgressBar value={job.progress} label={`${job.batch_name || "Project"} progress`} />
                  </div>
                </div>
                <StatusBadge status={job.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.7fr)]">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent exports</h2>
            <Link to="/app/exports" className="text-sm font-medium text-brand hover:text-brand-hover">View all exports</Link>
          </div>
          {exports.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted">
              Finished shorts show up here after a job writes files.
            </p>
          ) : (
            <div className="no-scrollbar -mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
              {exports.map((job) => (
                <Link key={job.job_id} to={`/app/projects/${job.job_id}`} className="group w-36 shrink-0 snap-start">
                  <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
                    <Poster jobId={job.job_id} enabled={job.has_preview === true} className="aspect-[9/16] w-full object-cover transition duration-700 group-hover:scale-105" />
                  </div>
                  <p className="mt-2 truncate text-sm font-medium transition group-hover:text-brand">{job.batch_name || "Untitled"}</p>
                  <p className="text-xs text-muted">{clipCount(job)} clips · MP4</p>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Activity</h2>
          {jobs && activityLines(jobs).length === 0 ? (
            <p className="mt-3 text-sm text-muted">Project events appear after you create one.</p>
          ) : (
            <ol className="relative mt-4 space-y-4 border-l border-white/10 pl-5">
              {activityLines(list).map((line) => (
                <li key={line.id} className="relative text-sm">
                  <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-brand ring-4 ring-canvas" />
                  <p className="text-ink/90">{line.text}</p>
                  <p className="text-xs text-faint" title={formatWhen(line.at)}>{timeAgo(line.at)}</p>
                </li>
              ))}
            </ol>
          )}
          {failed.length > 0 && (
            <Link to="/app/queue" className="mt-5 block rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger transition hover:bg-danger/15">
              {failed.length} project{failed.length === 1 ? "" : "s"} failed. Open the queue for the recorded error.
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

export function ProjectsPage() {
  usePrivateMeta("Projects", "/app/projects");
  const toast = useToast();
  const { jobs, error, reload } = useJobs();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [sort, setSort] = useState<"edited" | "created" | "name">("edited");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return localStorage.getItem("sf-projects-view") === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const dialogs = useProjectDialogs(reload);

  useEffect(() => {
    setQuery(params.get("q") || "");
  }, [params]);

  useEffect(() => {
    try {
      localStorage.setItem("sf-projects-view", view);
    } catch {
      /* storage unavailable */
    }
  }, [view]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (jobs ?? []).filter((job) => {
      if (status !== "all" && job.status !== status) return false;
      if (!q) return true;
      return (job.batch_name || "").toLowerCase().includes(q) || job.status.includes(q);
    });
    rows.sort((a, b) => {
      if (sort === "name") return (a.batch_name || "").localeCompare(b.batch_name || "");
      if (sort === "created") return (b.created_at || "").localeCompare(a.created_at || "");
      return (b.updated_at || b.created_at || "").localeCompare(a.updated_at || a.created_at || "");
    });
    return rows;
  }, [jobs, query, sort, status]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const statuses = Array.from(new Set((jobs ?? []).map((job) => job.status))).sort();

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    // Drop selections for projects that no longer exist.
    if (!jobs) return;
    setSelected((current) => current.filter((id) => jobs.some((job) => job.job_id === id)));
  }, [jobs]);

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)));

  const allVisibleSelected = visible.length > 0 && visible.every((job) => selected.includes(job.job_id));

  const bulkDelete = async () => {
    setBulkError(null);
    setBulkBusy(true);
    const blocked: string[] = [];
    let removed = 0;
    for (const id of selected) {
      try {
        await deleteJob(id);
        removed += 1;
      } catch (err) {
        blocked.push(err instanceof Error ? err.message : id);
      }
    }
    setSelected([]);
    setBulkOpen(false);
    setBulkBusy(false);
    if (removed) toast(`Deleted ${removed} project${removed === 1 ? "" : "s"}`);
    if (blocked.length) setBulkError(blocked[0]);
    await reload();
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Projects"
        body="Search, filter, open, rename, or delete your projects."
        action={
          <Link to="/app/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            New project
          </Link>
        }
      />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <label className="sr-only" htmlFor="project-search">Search projects</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            id="project-search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            placeholder="Search by name"
            className="field pl-10"
          />
        </div>
        <select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} className="field w-auto capitalize">
          <option value="all">All statuses</option>
          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Sort projects" value={sort} onChange={(event) => setSort(event.target.value as "edited" | "created" | "name")} className="field w-auto">
          <option value="edited">Recently edited</option>
          <option value="created">Recently created</option>
          <option value="name">Name</option>
        </select>
        <div className="ml-auto flex rounded-full border border-white/10 bg-white/[0.03] p-1" role="group" aria-label="View">
          {([["grid", LayoutGrid], ["list", List]] as const).map(([mode, Icon]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              aria-label={`${mode} view`}
              className={`flex h-8 w-9 items-center justify-center rounded-full transition ${view === mode ? "bg-white/[0.12] text-ink" : "text-muted hover:text-ink"}`}
              onClick={() => setView(mode)}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="sticky top-20 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-[#140f12]/90 px-4 py-2.5 shadow-lift backdrop-blur-xl animate-scale-in">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSelected(Array.from(new Set([...selected, ...visible.map((job) => job.job_id)])))}>
            Select page
          </button>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSelected([])}>Clear</button>
          <button type="button" className="btn-danger ml-auto px-4 py-1.5" onClick={() => setBulkOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Delete {selected.length}
          </button>
        </div>
      )}

      {(error || dialogs.actionError || bulkError) && <div className="mt-4"><Alert>{error || dialogs.actionError || bulkError || ""}</Alert></div>}

      {jobs === null && !error && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <CardSkeletons count={8} />
        </div>
      )}

      {jobs && filtered.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={jobs.length === 0 ? <FolderOpen className="h-6 w-6" /> : <Search className="h-6 w-6" />}
            title={jobs.length === 0 ? "No projects yet" : "No matches"}
            body={jobs.length === 0 ? "Start with a long video and a batch name." : "Try a different search or status."}
            action={
              jobs.length === 0 ? (
                <Link to="/app/new" className="btn-primary"><Plus className="h-4 w-4" />Create new project</Link>
              ) : (
                <button type="button" className="btn-secondary" onClick={() => { setQuery(""); setStatus("all"); }}>Clear filters</button>
              )
            }
          />
        </div>
      ) : null}

      {view === "grid" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((job, index) => (
            <ProjectCard
              key={job.job_id}
              job={job}
              index={index}
              selected={selected.includes(job.job_id)}
              onToggle={(checked) => toggle(job.job_id, checked)}
              onRename={() => dialogs.askRename(job)}
              onDelete={() => dialogs.askDelete(job)}
            />
          ))}
        </div>
      ) : (
        visible.length > 0 && (
          <div className="card mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-white/[0.07] text-xs text-faint">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on this page"
                      checked={allVisibleSelected}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, ...visible.map((job) => job.job_id)]))
                            : current.filter((id) => !visible.some((job) => job.job_id === id))
                        )
                      }
                    />
                  </th>
                  <th className="py-3 font-medium">Name</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3 font-medium">Clips</th>
                  <th className="py-3 font-medium">Updated</th>
                  <th className="py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {visible.map((job) => (
                  <tr key={job.job_id} className={`transition hover:bg-white/[0.03] ${selected.includes(job.job_id) ? "bg-brand/[0.05]" : ""}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${job.batch_name || "project"}`}
                        checked={selected.includes(job.job_id)}
                        onChange={(event) => toggle(job.job_id, event.target.checked)}
                      />
                    </td>
                    <td className="py-3">
                      <Link className="flex items-center gap-3 font-medium hover:text-brand" to={`/app/projects/${job.job_id}`}>
                        <Poster jobId={job.job_id} enabled={job.has_preview === true} className="h-10 w-8 shrink-0 rounded-md object-cover" />
                        {job.batch_name || "Untitled"}
                      </Link>
                    </td>
                    <td className="py-3"><StatusBadge status={job.status} /></td>
                    <td className="py-3 tabular-nums text-muted">{clipCount(job)}</td>
                    <td className="py-3 text-muted" title={formatWhen(job.updated_at || job.created_at)}>{timeAgo(job.updated_at || job.created_at)}</td>
                    <td className="py-3 pr-3 text-right"><ProjectMenu job={job} onRename={() => dialogs.askRename(job)} onDelete={() => dialogs.askDelete(job)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {pageCount > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button type="button" className="btn-secondary px-4 py-2" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
          <span className="tabular-nums text-muted">Page {safePage + 1} of {pageCount}</span>
          <button type="button" className="btn-secondary px-4 py-2" disabled={safePage + 1 >= pageCount} onClick={() => setPage(safePage + 1)}>Next</button>
        </div>
      )}
      {dialogs.dialogs}
      {bulkOpen && (
        <Modal title={`Delete ${selected.length} project${selected.length === 1 ? "" : "s"}?`} onClose={() => setBulkOpen(false)}>
          <p>Running jobs are refused until you cancel them. Files for deleted projects are removed from the server.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setBulkOpen(false)}>Keep them</button>
            <button type="button" className="btn-danger" disabled={bulkBusy} onClick={() => void bulkDelete()}>
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete selected
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function QueueGroup({ title, jobs, onCancel }: { title: string; jobs: JobSummary[]; onCancel?: (job: JobSummary) => void }) {
  if (jobs.length === 0) return null;
  return (
    <section className="mt-8 animate-fade-up">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-faint">
        {title}
        <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] text-muted">{jobs.length}</span>
      </h2>
      <ul className="mt-3 space-y-3">
        {jobs.map((job) => (
          <li key={job.job_id} className="card flex gap-4 p-4">
            <Poster jobId={job.job_id} enabled={job.has_preview === true} className="h-16 w-12 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link className="truncate font-semibold hover:text-brand" to={`/app/projects/${job.job_id}`}>{job.batch_name || "Untitled"}</Link>
                <StatusBadge status={job.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {job.message || "Working"} · started {timeAgo(job.created_at)}
                {job.total_shorts ? ` · ${job.completed_shorts}/${job.total_shorts} clips` : ""}
              </p>
              {job.error && <p className="mt-1 text-sm text-danger">{job.error}</p>}
              {isActive(job) && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1">
                    <ProgressBar value={job.progress} label={`${job.batch_name || "Project"} progress`} />
                  </div>
                  <span className="text-xs tabular-nums text-muted">{Math.round(job.progress || 0)}%</span>
                  {onCancel && (
                    <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onCancel(job)}>Cancel</button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QueuePage() {
  usePrivateMeta("Processing queue", "/app/queue");
  const toast = useToast();
  const { jobs, error, reload } = useJobs();
  const [cancelTarget, setCancelTarget] = useState<JobSummary | null>(null);
  const list = jobs ?? [];
  const groups = {
    active: list.filter((job) => job.status === "processing" || job.status === "importing"),
    queued: list.filter((job) => job.status === "queued"),
    completed: list.filter((job) => job.status === "completed"),
    failed: list.filter((job) => job.status === "failed" || job.status === "cancelled"),
  };
  const empty = groups.active.length + groups.queued.length + groups.completed.length + groups.failed.length === 0;

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelJob(cancelTarget.job_id);
      toast(
        cancelTarget.status === "queued" ? "Cancelled before rendering started" : "Cancellation requested",
        { tone: "info", body: cancelTarget.status === "queued" ? undefined : "The worker stops after the current step." }
      );
      setCancelTarget(null);
      await reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not cancel", { tone: "error" });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Processing queue" body="Progress is the worker’s completed-part count. Nothing here is a simulated bar." />
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {jobs === null && !error && (
        <div className="mt-8 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}
      {jobs && empty ? (
        <div className="mt-6">
          <EmptyState
            icon={<Clapperboard className="h-6 w-6" />}
            title="Nothing in the queue"
            body="Start a project when you are ready to render."
            action={<Link to="/app/new" className="btn-primary"><Plus className="h-4 w-4" />New project</Link>}
          />
        </div>
      ) : (
        <>
          <QueueGroup title="Active" jobs={groups.active} onCancel={setCancelTarget} />
          <QueueGroup title="Queued" jobs={groups.queued} onCancel={setCancelTarget} />
          <QueueGroup title="Completed" jobs={groups.completed} />
          <QueueGroup title="Failed or cancelled" jobs={groups.failed} />
        </>
      )}
      {cancelTarget && (
        <Modal title="Cancel processing?" onClose={() => setCancelTarget(null)}>
          <p>Cancel “{cancelTarget.batch_name || "Untitled"}”? A queued job stops immediately. A running job finishes its current step first.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCancelTarget(null)}>Keep going</button>
            <button type="button" className="btn-danger" onClick={() => void confirmCancel()}>Cancel job</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ExportsPage() {
  usePrivateMeta("Exports", "/app/exports");
  const toast = useToast();
  const { jobs, error } = useJobs();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const done = (jobs ?? []).filter((job) => clipCount(job) > 0 && (job.batch_name || "").toLowerCase().includes(query.trim().toLowerCase()));
  const total = done.reduce((sum, job) => sum + clipCount(job), 0);

  const download = async (job: JobSummary) => {
    setBusy(job.job_id);
    try {
      const path = await downloadAllFiles(job.job_id, `${job.batch_slug || "shorts"}.zip`);
      toast(path ? "Saved zip" : "Download started", { body: path || job.batch_name || undefined });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Download failed", { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Exports"
        body="Every finished short is 1080×1920 MP4, H.264 and AAC. Downloads use your account. There is no public file link."
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exports" className="field pl-10" aria-label="Search exports" />
        </div>
        {jobs && done.length > 0 && (
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{total}</span> shorts across <span className="font-semibold text-ink">{done.length}</span> project{done.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {jobs === null && !error && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><CardSkeletons /></div>
      )}
      {jobs && done.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Download className="h-6 w-6" />} title="No exports yet" body="Rendered shorts appear after a project completes." />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {done.map((job, index) => (
            <article key={job.job_id} className="card card-hover group overflow-hidden animate-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
              <Link to={`/app/projects/${job.job_id}`} className="relative block overflow-hidden">
                {job.has_preview ? (
                  <Poster jobId={job.job_id} enabled className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-105" />
                ) : (
                  <div className="aspect-[4/5] bg-white/[0.03]" />
                )}
                <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                  {clipCount(job)} file{clipCount(job) === 1 ? "" : "s"}
                </span>
              </Link>
              <div className="space-y-3 p-4">
                <div>
                  <p className="truncate text-sm font-semibold">{job.batch_name || "Untitled"}</p>
                  <p className="text-xs text-muted">1080×1920 · MP4 · {timeAgo(job.updated_at || job.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <Link className="btn-secondary flex-1 px-3 py-2 text-xs" to={`/app/projects/${job.job_id}`}>Preview</Link>
                  <button
                    type="button"
                    className="btn-primary flex-1 px-3 py-2 text-xs"
                    disabled={busy === job.job_id}
                    onClick={() => void download(job)}
                  >
                    {busy === job.job_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Zip
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="card divide-y divide-white/[0.06] text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 px-5 py-3.5 md:grid-cols-[180px_minmax(0,1fr)] md:gap-4">
          <dt className="text-muted">{label}</dt>
          <dd className="text-ink/90">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function UsagePage() {
  usePrivateMeta("Usage and plan", "/app/usage");
  const { jobs } = useJobs();
  const clips = (jobs ?? []).reduce((sum, job) => sum + clipCount(job), 0);
  const running = (jobs ?? []).filter(isActive).length;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Usage and plan"
        body="These counts come from the projects on this account. There is no subscription, allowance, or renewal date in this build."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Projects", jobs?.length],
          ["Clips generated", jobs ? clips : undefined],
          ["Jobs in progress", jobs ? running : undefined],
        ].map(([label, value]) => (
          <div key={label as string} className="card p-5">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums">
              {value === undefined ? <Skeleton className="h-8 w-10" /> : <CountUp value={value as number} />}
            </p>
          </div>
        ))}
      </div>
      <div className="gradient-border rounded-3xl bg-white/[0.02] p-6">
        <p className="section-kicker">Current plan</p>
        <p className="mt-2 font-display text-2xl font-semibold">Self-hosted early access</p>
        <p className="mt-2 text-sm text-muted">Billing is not enabled. Every tool is available and nothing is metered.</p>
      </div>
      <InfoList
        rows={[
          ["Processing minutes", "Not metered. The server does not record render duration as a quota."],
          ["Storage", "Files stay on this server’s disk until you delete the project. Object storage is not connected, so a byte quota is not available."],
          ["Renewal", "Not applicable."],
        ]}
      />
      <p className="text-sm text-muted">
        Pricing on the public site describes this early-access server. It does not start a checkout.{" "}
        <Link className="font-medium text-brand hover:text-brand-hover" to="/pricing">Read the pricing note</Link>
      </p>
    </div>
  );
}

export function SettingsPage() {
  usePrivateMeta("Settings", "/app/settings");
  const toast = useToast();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<string>(() =>
    canUseNotifications() ? Notification.permission : "unsupported"
  );
  useEffect(() => {
    fetchCapabilities().then(setCaps).catch((err) => setError(err instanceof Error ? err.message : "Could not load settings"));
  }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader title="Settings" body="Output is fixed by the renderer. These values are read from the server." />
      {error && <Alert>{error}</Alert>}
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <HardDrive className="h-4 w-4 text-brand" /> Renderer defaults
        </h2>
        {caps ? (
          <InfoList
            rows={[
              ["Aspect", caps.output.aspect],
              ["Resolution", `${caps.output.width}×${caps.output.height}`],
              ["Container / codec", `${caps.output.container.toUpperCase()} · ${caps.output.video_codec} · ${caps.output.audio_codec} · ${caps.output.fps} fps`],
              ["Upload limit", `${caps.max_upload_mb} MB`],
              ["Video types", caps.video_extensions.join(", ")],
              ["Captions", caps.captions],
              ["Links", caps.url_import],
              ["Storage", caps.storage],
              ["Retention", caps.retention],
              ["Billing", caps.billing ? "Enabled" : "Not enabled"],
            ]}
          />
        ) : (
          !error && <Skeleton className="h-80" />
        )}
      </section>
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Bell className="h-4 w-4 text-brand" /> Notifications
        </h2>
        <p className="mt-1 text-sm text-muted">
          The bell in the workspace lists finished, failed, and cancelled jobs. This browser can also show a system notification when an import or render finishes.
        </p>
        {permission === "unsupported" ? (
          <p className="mt-3 text-sm text-muted">This browser does not expose notifications.</p>
        ) : permission === "granted" ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="h-4 w-4" /> Allowed in this browser</p>
        ) : (
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => {
              void ensureNotificationPermission().then((ok) => {
                setPermission(Notification.permission);
                toast(ok ? "Notifications allowed" : "Notifications were not allowed", { tone: ok ? "success" : "info" });
              });
            }}
          >
            Allow browser notifications
          </button>
        )}
      </section>
      <section className="card p-5">
        <h2 className="font-display text-lg font-semibold">Data</h2>
        <p className="mt-1 text-sm text-muted">Deleting a project removes its upload and rendered files from this server. Deleting an entire account is not available from this screen.</p>
        <Link to="/app/account" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-hover">
          Open account <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}

export function AccountPage() {
  usePrivateMeta("Account", "/app/account");
  const toast = useToast();
  const { user } = useAuth();
  const guest = !user || user.guest || user.email === "guest@local";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Password updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <PageHeader title="Account" />
      <div className="card flex items-center gap-4 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient font-display text-xl font-bold text-white">
          {guest ? "G" : (user?.email || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{guest ? "Guest workspace" : user?.email}</p>
          <p className="text-sm text-muted">{guest ? "No password · local only" : "Signed in with email and password"}</p>
        </div>
      </div>
      {guest ? (
        <EmptyState
          icon={<KeyRound className="h-6 w-6" />}
          title="Guest session"
          body="Guest mode has no password. Create an account to keep projects under your email."
          action={<Link to="/register" className="btn-primary">Create an account</Link>}
        />
      ) : (
        <form onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><KeyRound className="h-4 w-4 text-brand" /> Change password</h2>
            <p className="mt-1 text-sm text-muted">Email reset is not available. You need the current password.</p>
          </div>
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-xs font-medium text-muted">Current password</label>
            <input id="current-password" type="password" required value={current} onChange={(event) => setCurrent(event.target.value)} className="field" autoComplete="current-password" />
          </div>
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-xs font-medium text-muted">New password</label>
            <input id="new-password" type="password" required minLength={8} value={next} onChange={(event) => setNext(event.target.value)} className="field" autoComplete="new-password" />
            <p className="mt-1 text-xs text-faint">At least 8 characters.</p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-medium text-muted">Confirm new password</label>
            <input id="confirm-password" type="password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} className={`field ${mismatch ? "border-danger/60" : ""}`} autoComplete="new-password" />
            {mismatch && <p className="mt-1 text-xs text-danger">Passwords do not match.</p>}
          </div>
          {error && <Alert>{error}</Alert>}
          <button type="submit" className="btn-primary" disabled={busy || mismatch}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>
      )}
    </div>
  );
}
