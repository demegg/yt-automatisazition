import { useCallback, useRef, useState } from "react";
import { Check, Film, Link2, Upload, X, Video } from "lucide-react";
import type { InputMode, VideoInput } from "../types";
import { hasVideoSource, isValidVideoUrl } from "../types";

interface Props {
  video1: VideoInput;
  video2: VideoInput;
  onVideo1: (v: VideoInput) => void;
  onVideo2: (v: VideoInput) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function VideoSlot({
  label,
  hint,
  input,
  onChange,
  required,
}: {
  label: string;
  hint: string;
  input: VideoInput;
  onChange: (v: VideoInput) => void;
  required?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const filled = hasVideoSource(input);

  const setMode = (mode: InputMode) => {
    onChange({ ...input, mode, file: null, url: "" });
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f?.type.startsWith("video/")) {
        onChange({ mode: "file", file: f, url: "" });
      }
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex rounded-xl bg-surface-border/60 p-1">
        <button
          type="button"
          onClick={() => setMode("file")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
            input.mode === "file"
              ? "bg-surface-raised text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Upload className="h-4 w-4" />
          Upload file
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
            input.mode === "url"
              ? "bg-surface-raised text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <Link2 className="h-4 w-4" />
          Paste link
        </button>
      </div>

      {input.mode === "file" ? (
        <div
          className={`relative flex min-h-[180px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 transition ${
            dragging
              ? "border-brand bg-brand/10"
              : filled
                ? "border-accent/50 bg-accent/5"
                : "border-surface-border hover:border-brand/40"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onChange({ mode: "file", file: f, url: "" });
            }}
          />

          {input.file ? (
            <div className="flex w-full items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent/20">
                <Film className="h-7 w-7 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{input.file.name}</p>
                <p className="text-sm text-gray-400">
                  {formatSize(input.file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChange({ mode: "file", file: null, url: "" })}
                className="rounded-lg p-2 text-gray-400 hover:bg-surface-border hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-border">
                <Upload className="h-7 w-7 text-gray-400" />
              </div>
              <p className="font-display text-lg font-semibold">
                {label}
                {required && <span className="text-accent"> *</span>}
              </p>
              <p className="mt-1 text-center text-sm text-gray-400">{hint}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn-secondary mt-4 text-sm"
              >
                Browse files
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-surface-border p-6">
          <p className="font-display mb-1 text-lg font-semibold">
            {label}
            {required && <span className="text-accent"> *</span>}
          </p>
          <p className="mb-4 text-sm text-gray-400">{hint}</p>

          <input
            type="url"
            value={input.url}
            onChange={(e) =>
              onChange({ mode: "url", file: null, url: e.target.value })
            }
            placeholder="https://youtube.com/watch?v=... or direct .mp4 link"
            className={`w-full rounded-xl border bg-surface px-4 py-3 text-sm outline-none transition ${
              isValidVideoUrl(input.url)
                ? "border-brand ring-1 ring-brand/30"
                : "border-surface-border focus:border-brand"
            }`}
          />

          {isValidVideoUrl(input.url) ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-brand">
              <Check className="h-3.5 w-3.5" />
              Link ready — click Continue to import
            </p>
          ) : input.url.trim() ? (
            <p className="mt-2 text-xs text-amber-400/90">
              Enter a full URL starting with https://
            </p>
          ) : null}

          <p className="mt-3 text-xs text-gray-500">
            Supports YouTube, TikTok, Instagram, and direct video URLs
          </p>
        </div>
      )}
    </div>
  );
}

export default function VideoUpload({
  video1,
  video2,
  onVideo1,
  onVideo2,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl bg-brand/10 p-4 text-sm text-gray-300">
        <Video className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <p>
          Add one or two long videos by <strong className="text-white">uploading a file</strong> or{" "}
          <strong className="text-white">pasting a link</strong> (YouTube, TikTok, etc.).
          ShortForge slices them into vertical 9:16 Shorts with optional captions.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <VideoSlot
          label="Primary Video"
          hint="Main content — podcast, gameplay, vlog, etc."
          input={video1}
          onChange={onVideo1}
          required
        />
        <VideoSlot
          label="Second Video (optional)"
          hint="Reaction cam, B-roll, or comparison clip"
          input={video2}
          onChange={onVideo2}
        />
      </div>
    </div>
  );
}
