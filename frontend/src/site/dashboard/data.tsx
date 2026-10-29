import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listJobs, listNotices, markNoticesRead, type Notice } from "../../api";
import { useAuth } from "../../auth";
import type { JobSummary } from "../../types";

type JobsContextValue = {
  jobs: JobSummary[] | null;
  error: string | null;
  reload: () => Promise<void>;
  notices: Notice[];
  markRead: (keys: string[]) => Promise<void>;
};

const JobsContext = createContext<JobsContextValue | null>(null);

export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  const reload = async () => {
    try {
      const [nextJobs, nextNotices] = await Promise.all([
        listJobs(100, 0),
        listNotices().catch(() => [] as Notice[]),
      ]);
      setJobs(nextJobs);
      setNotices(nextNotices);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load projects");
    }
  };

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const markRead = async (keys: string[]) => {
    if (keys.length === 0) return;
    setNotices((current) =>
      current.map((notice) => (keys.includes(notice.key) ? { ...notice, read: true } : notice)),
    );
    try {
      await markNoticesRead(keys);
    } catch {
      void reload();
    }
  };

  return (
    <JobsContext.Provider value={{ jobs, error, reload, notices, markRead }}>
      {children}
    </JobsContext.Provider>
  );
}

export function useJobs() {
  const value = useContext(JobsContext);
  if (!value) throw new Error("Workspace data is unavailable");
  return value;
}

export function isActive(job: JobSummary) {
  return ["queued", "processing", "importing"].includes(job.status);
}

export function clipCount(job: JobSummary) {
  return job.completed_shorts || 0;
}

export function greetingName(email?: string, guest?: boolean) {
  if (!email || guest || email === "guest@local") return null;
  const local = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() ?? "";
  if (local.length < 2 || !/^[a-z ]+$/i.test(local)) return null;
  return local.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function activityLines(jobs: JobSummary[]) {
  const lines: { id: string; at: string; text: string }[] = [];
  for (const job of jobs) {
    const name = job.batch_name || "Untitled";
    if (job.created_at) {
      lines.push({ id: `${job.job_id}-created`, at: job.created_at, text: `Created “${name}”` });
    }
    const at = job.updated_at || job.created_at;
    if (!at || at === job.created_at) continue;
    if (job.status === "completed") {
      lines.push({ id: `${job.job_id}-done`, at, text: `Finished “${name}” · ${clipCount(job)} clip${clipCount(job) === 1 ? "" : "s"}` });
    } else if (job.status === "failed") {
      lines.push({ id: `${job.job_id}-failed`, at, text: `Failed “${name}”` });
    } else if (job.status === "cancelled") {
      lines.push({ id: `${job.job_id}-cancelled`, at, text: `Cancelled “${name}”` });
    } else if (isActive(job)) {
      lines.push({ id: `${job.job_id}-run`, at, text: `${job.status} “${name}”` });
    }
  }
  return lines.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
}

let posterChain: Promise<unknown> = Promise.resolve();

export function Poster({ jobId, enabled, className }: { jobId: string; enabled: boolean; className?: string }) {
  const { authFetch } = useAuth();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let url: string | null = null;
    let cancelled = false;
    posterChain = posterChain.catch(() => undefined).then(async () => {
      const res = await authFetch(`/jobs/${jobId}/poster`);
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [authFetch, enabled, jobId]);
  if (!src) {
    return <div className={`${enabled ? "skeleton !rounded-[inherit]" : "bg-white/[0.03]"} ${className || "aspect-[9/16]"}`} />;
  }
  return <img src={src} alt="" className={`object-cover animate-fade-in ${className || "aspect-[9/16] w-full"}`} />;
}
