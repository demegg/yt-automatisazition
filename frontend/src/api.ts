import type {

  AppSettings,

  JobStatus,

  LayoutOption,

  SchedulePreview,

  ScheduledPost,

  SocialAccount,

  SocialStatus,

  VideoInput,

} from "./types";



const API = "/api";

function apiPath(input: string): string {
  if (input.startsWith("/api")) return input;
  return `${API}${input.startsWith("/") ? input : `/${input}`}`;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

let authFetch: FetchFn = (input, init) =>
  fetch(apiPath(input), { ...init, credentials: "include" });

export function setApiAuthFetch(fn: FetchFn) {
  authFetch = fn;
}

async function api(input: string, init?: RequestInit): Promise<Response> {
  return authFetch(apiPath(input), init);
}



export async function createJob(): Promise<string> {

  const res = await api("/jobs", { method: "POST" });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || "Failed to create job");
  }

  const data = await res.json();

  return data.job_id;

}



export interface UploadResult {

  job_id: string;

  status: string;

  video1?: string;

  video2?: string;

}



export async function submitVideos(

  jobId: string,

  video1: VideoInput,

  video2?: VideoInput | null

): Promise<UploadResult> {

  const form = new FormData();



  if (video1.mode === "file" && video1.file) {

    form.append("video1", video1.file);

  } else if (video1.mode === "url" && video1.url.trim()) {

    form.append("video1_url", video1.url.trim());

  }



  if (video2) {

    if (video2.mode === "file" && video2.file) {

      form.append("video2", video2.file);

    } else if (video2.mode === "url" && video2.url.trim()) {

      form.append("video2_url", video2.url.trim());

    }

  }



  const res = await api(`/jobs/${jobId}/upload`, {

    method: "POST",

    body: form,

  });

  if (!res.ok) {

    let message = "Upload failed";

    try {

      const data = await res.json();

      message = data.detail ?? message;

    } catch {

      const text = await res.text();

      if (text) message = text;

    }

    throw new Error(message);

  }

  return res.json();

}



export async function waitForImport(

  jobId: string,

  onUpdate?: (message: string) => void

): Promise<void> {

  const deadline = Date.now() + 30 * 60 * 1000;



  while (Date.now() < deadline) {

    const status = await getJobStatus(jobId);

    if (status.status === "uploaded") return;

    if (status.status === "failed") {

      throw new Error(status.error || status.message || "Import failed");

    }

    if (onUpdate && status.message) onUpdate(status.message);

    await new Promise((r) => setTimeout(r, 1000));

  }

  throw new Error("Import timed out. Try a shorter video or upload the file directly.");

}



export async function startProcessing(

  jobId: string,

  settings: AppSettings

): Promise<void> {

  const res = await api(`/jobs/${jobId}/process`, {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify({

      job_id: jobId,

      segment_length: settings.segmentLength,

      layout: settings.layout,

      captions_enabled: settings.captionsEnabled,

      caption_style: settings.captionStyle,

      max_shorts: settings.maxShorts,

    }),

  });

  if (!res.ok) throw new Error("Failed to start processing");

}



export async function getJobStatus(jobId: string): Promise<JobStatus> {

  const res = await api(`/jobs/${jobId}/status`);

  if (!res.ok) throw new Error("Failed to get status");

  return res.json();

}



export async function fetchLayouts(): Promise<LayoutOption[]> {

  const res = await fetch(`${API}/layouts`);

  if (!res.ok) throw new Error("Failed to load layouts");

  return res.json();

}



export function downloadUrl(jobId: string, filename: string): string {

  return `${API}/jobs/${jobId}/download/${filename}`;

}



export function downloadAllUrl(jobId: string): string {

  return `${API}/jobs/${jobId}/download-all`;

}



export function formatTime(seconds: number): string {

  const m = Math.floor(seconds / 60);

  const s = Math.floor(seconds % 60);

  return `${m}:${s.toString().padStart(2, "0")}`;

}



export async function getSocialStatus(): Promise<SocialStatus> {

  const res = await api("/social/status");

  if (!res.ok) {

    const data = await res.json().catch(() => ({}));

    throw new Error(data.detail || "Failed to load account status");

  }

  return res.json();

}



export async function listAccounts(

  platform?: "youtube" | "tiktok"

): Promise<SocialAccount[]> {

  const q = platform ? `?platform=${platform}` : "";

  const res = await api(`/social/accounts${q}`);

  if (!res.ok) throw new Error("Failed to load accounts");

  const data = await res.json();

  return data.accounts;

}



export async function deleteAccount(accountId: number): Promise<void> {

  const res = await api(`/social/accounts/${accountId}`, {

    method: "DELETE",

  });

  if (!res.ok) throw new Error("Failed to remove account");

}



export async function setDefaultAccount(accountId: number): Promise<void> {

  const res = await api(`/social/accounts/${accountId}/default`, {

    method: "POST",

  });

  if (!res.ok) throw new Error("Failed to set default account");

}



export function connectPlatformUrl(platform: "youtube" | "tiktok"): string {

  return `${API}/social/${platform}/connect`;

}



export async function getSchedulePreview(

  jobId: string,

  postsPerDay: number,

  youtubeAccountId?: number | null,

  tiktokAccountId?: number | null

): Promise<SchedulePreview> {

  const params = new URLSearchParams({ posts_per_day: String(postsPerDay) });

  if (youtubeAccountId) params.set("youtube_account_id", String(youtubeAccountId));

  if (tiktokAccountId) params.set("tiktok_account_id", String(tiktokAccountId));

  const res = await api(`/jobs/${jobId}/schedule/preview?${params.toString()}`);

  if (!res.ok) {

    const data = await res.json().catch(() => ({}));

    throw new Error(data.detail || "Failed to load schedule preview");

  }

  return res.json();

}



export async function createSchedule(

  jobId: string,

  body: {

    accounts: { platform: string; account_id: number }[];

    posts_per_day: number;

    window_start_hour: number;

    window_end_hour: number;

    title_prefix: string;

  }

): Promise<{ total_scheduled: number; accounts: Record<string, unknown> }> {

  const res = await api(`/jobs/${jobId}/schedule`, {

    method: "POST",

    headers: { "Content-Type": "application/json" },

    body: JSON.stringify(body),

  });

  if (!res.ok) {

    const data = await res.json().catch(() => ({}));

    throw new Error(data.detail || "Failed to create schedule");

  }

  return res.json();

}



export async function listSchedules(jobId: string): Promise<ScheduledPost[]> {

  const res = await api(`/jobs/${jobId}/schedule`);

  if (!res.ok) throw new Error("Failed to load schedules");

  const data = await res.json();

  return data.schedules;

}



export function formatScheduleTime(iso: string): string {

  const d = new Date(iso);

  return d.toLocaleString(undefined, {

    month: "short",

    day: "numeric",

    hour: "numeric",

    minute: "2-digit",

  });

}


