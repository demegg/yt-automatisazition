export type SegmentLength = 30 | 60 | 120;

export type LayoutMode =
  | "single"
  | "stack_vertical"
  | "stack_horizontal"
  | "picture_in_picture"
  | "main_with_reaction";

export type CaptionStyle = "bold_center" | "karaoke" | "minimal" | "tiktok";

export interface LayoutOption {
  id: LayoutMode;
  name: string;
  description: string;
  requires_two: boolean;
}

export interface SocialAccount {
  id: number;
  platform: "youtube" | "tiktok";
  display_name: string;
  external_id?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPost {
  id: number;
  job_id: string;
  platform: string;
  account_id: number;
  account_name?: string;
  filename: string;
  title?: string;
  scheduled_at: string;
  status: string;
  error?: string | null;
  platform_video_id?: string | null;
}

export interface SocialStatus {
  youtube_configured: boolean;
  tiktok_configured: boolean;
  youtube_accounts: number;
  tiktok_accounts: number;
  accounts: SocialAccount[];
  backend_url?: string;
  oauth_redirect_uris?: {
    youtube: string;
    tiktok: string;
  };
}

export interface SchedulePreview {
  job_id: string;
  total_shorts: number;
  posts_per_day: number;
  platforms: Record<
    string,
    {
      account_id: number;
      account_name: string;
      total_shorts: number;
      available_to_schedule: number;
      already_posted_or_scheduled: number;
      estimated_days: number;
    }
  >;
}

export interface ShortInfo {
  filename: string;
  index: number;
  start_time: number;
  startTime?: number;
  end_time: number;
  endTime?: number;
  duration: number;
}

export interface JobStatus {
  job_id: string;
  status: string;
  progress: number;
  message: string;
  total_shorts: number;
  completed_shorts: number;
  shorts: ShortInfo[];
  error?: string | null;
}

export interface AppSettings {
  segmentLength: SegmentLength;
  layout: LayoutMode;
  captionsEnabled: boolean;
  captionStyle: CaptionStyle;
  maxShorts: number | null;
}

export type Step = "upload" | "configure" | "processing" | "results";

export type InputMode = "file" | "url";

export interface VideoInput {
  mode: InputMode;
  file: File | null;
  url: string;
}

export const emptyVideoInput = (): VideoInput => ({
  mode: "file",
  file: null,
  url: "",
});

export function isValidVideoUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function hasVideoSource(input: VideoInput): boolean {
  if (input.mode === "file") return input.file !== null;
  return isValidVideoUrl(input.url);
}
