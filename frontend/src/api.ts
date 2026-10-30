import type {
  AppSettings,
  EditInfo,
  EditorState,
  JobStatus,
  JobSummary,
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

/** FastAPI returns `detail` as a string, or as a list of validation errors. */
function detailMessage(data: { detail?: unknown }, fallback: string): string {
  const detail = data?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
}

async function api(input: string, init?: RequestInit): Promise<Response> {
  return authFetch(apiPath(input), init);
}



export interface Capabilities {
  output: {
    width: number;
    height: number;
    aspect: string;
    container: string;
    video_codec: string;
    audio_codec: string;
    fps: number;
    crf: number;
  };
  max_upload_mb: number;
  video_extensions: string[];
  audio_extensions: string[];
  captions: string;
  url_import: string;
  billing: boolean;
  password_reset_email: boolean;
  auth_required: boolean;
  storage: string;
  retention: string;
}

export async function fetchCapabilities(): Promise<Capabilities> {
  const res = await api("/capabilities");
  if (!res.ok) throw new Error("Could not load server capabilities");
  return res.json();
}

export interface Notice {
  key: string;
  job_id: string;
  kind: string;
  title: string;
  body: string;
  created_at?: string | null;
  read: boolean;
}

export async function listNotices(): Promise<Notice[]> {
  const res = await api("/notices");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Could not load notifications"));
  }
  return res.json();
}

export async function markNoticesRead(keys: string[]): Promise<void> {
  const res = await api("/notices/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Could not update notifications"));
  }
}

export async function listJobs(limit = 48, offset = 0): Promise<JobSummary[]> {
  const res = await api(`/jobs?limit=${limit}&offset=${offset}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Failed to list projects"));
  }
  return res.json();
}

export async function renameJob(jobId: string, name: string): Promise<void> {
  const res = await api(`/jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Could not rename project"));
  }
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await api(`/jobs/${jobId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Could not delete project"));
  }
}

export async function cancelJob(jobId: string): Promise<void> {
  const res = await api(`/jobs/${jobId}/cancel`, { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Could not cancel"));
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await api("/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Could not change password"));
  }
}

function storedToken(): string | null {
  return localStorage.getItem("sf_token");
}

function uploadForm(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiPath(path));
    xhr.withCredentials = true;
    const token = storedToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          headers: {
            "Content-Type": xhr.getResponseHeader("Content-Type") || "application/json",
          },
        })
      );
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(form);
  });
}

export async function createJob(name: string): Promise<string> {

  const res = await api("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Failed to create job"));
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

  video2?: VideoInput | null,

  onProgress?: (percent: number) => void

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



  const res = await uploadForm(`/jobs/${jobId}/upload`, form, onProgress);

  if (!res.ok) {

    let message = "Upload failed";

    try {

      const data = await res.json();

      message = detailMessage(data, message);

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

  settings: AppSettings,

  editor: EditorState,

  batchName: string

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

      cut_mode: editor.cutMode,

      clips:

        editor.cutMode === "custom"

          ? editor.clips.map((c) => ({ start: c.start, end: c.end }))

          : null,

      trim_start: editor.trimStart,

      trim_end: editor.trimEnd || editor.duration,

      music_enabled: editor.musicEnabled && Boolean(editor.musicName),

      mute_original: editor.muteOriginal,

      original_volume: editor.originalVolume,

      music_volume: editor.musicVolume,

      batch_name: batchName.trim(),

    }),

  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail) && detail[0]?.msg) throw new Error(detail[0].msg);
    throw new Error("Failed to start processing");
  }

}

export async function fetchEditInfo(jobId: string): Promise<EditInfo> {
  const res = await api(`/jobs/${jobId}/edit-info`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Failed to load video for editing"));
  }
  return res.json();
}

export function sourceVideoUrl(jobId: string, slot: 1 | 2 = 1): string {
  return `${API}/jobs/${jobId}/source/${slot}`;
}

export function sourceMusicUrl(jobId: string): string {
  return `${API}/jobs/${jobId}/music`;
}

export async function uploadMusic(
  jobId: string,
  file: File
): Promise<{ filename: string; duration: number | null }> {
  const form = new FormData();
  form.append("music", file);
  const res = await api(`/jobs/${jobId}/music`, { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Failed to upload soundtrack"));
  }
  return res.json();
}

export async function removeMusic(jobId: string): Promise<void> {
  const res = await api(`/jobs/${jobId}/music`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Failed to remove soundtrack"));
  }
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
  return `${API}/jobs/${jobId}/download/${encodeURIComponent(filename)}`;
}

export function downloadAllUrl(jobId: string): string {
  return `${API}/jobs/${jobId}/download-all`;
}

function absoluteApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function isShortForgeDesktop(): boolean {
  return typeof navigator !== "undefined" && /ShortForgeDesktop/i.test(navigator.userAgent);
}

async function triggerBlobDownload(res: Response, fallbackName: string) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(detailMessage(data, "Download failed"));
  }
  const blob = await res.blob();
  const header = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(header);
  const name = match ? decodeURIComponent(match[1].replace(/"/g, "")) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Last-resort: navigate/open the file URL (works in browser + some WebViews). */
function openDownloadUrl(path: string) {
  const url = absoluteApiUrl(path);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadShortFile(jobId: string, filename: string): Promise<string | void> {
  const path = `/api/jobs/${jobId}/download/${encodeURIComponent(filename)}`;
  if (isShortForgeDesktop()) {
    try {
      const res = await api(`/local/save/${jobId}/${encodeURIComponent(filename)}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data.detail || data.error || "Desktop save failed");
      return data.path as string;
    } catch (e) {
      console.warn("desktop local save failed", e);
    }
  }
  try {
    const res = await api(`/jobs/${jobId}/download/${encodeURIComponent(filename)}`);
    await triggerBlobDownload(res, filename);
  } catch (e) {
    openDownloadUrl(path);
    throw e instanceof Error ? e : new Error("Download failed — opened file link instead");
  }
}

export async function downloadAllFiles(
  jobId: string,
  zipName = "shorts.zip"
): Promise<string | void> {
  const path = `/api/jobs/${jobId}/download-all`;
  if (isShortForgeDesktop()) {
    try {
      const res = await api(`/local/save-all/${jobId}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data.detail || data.error || "Desktop save failed");
      return data.path as string;
    } catch (e) {
      console.warn("desktop local save-all failed", e);
    }
  }
  try {
    const res = await api(`/jobs/${jobId}/download-all`);
    await triggerBlobDownload(res, zipName);
  } catch (e) {
    openDownloadUrl(path);
    throw e instanceof Error ? e : new Error("Download failed — opened file link instead");
  }
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

    throw new Error(detailMessage(data, "Failed to load account status"));

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

    throw new Error(detailMessage(data, "Failed to load schedule preview"));

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

    throw new Error(detailMessage(data, "Failed to create schedule"));

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


