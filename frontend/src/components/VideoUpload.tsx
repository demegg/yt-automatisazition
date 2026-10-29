import { useEffect, useRef, useState } from "react";
import { Check, Film, Link2, Plus, Upload, X } from "lucide-react";
import { fetchCapabilities } from "../api";
import type { InputMode, VideoInput } from "../types";
import { hasVideoSource, isValidVideoUrl } from "../types";

interface Props {
  video1: VideoInput;
  video2: VideoInput;
  onVideo1: (v: VideoInput) => void;
  onVideo2: (v: VideoInput) => void;
  batchName: string;
  onBatchName: (name: string) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A local object-URL preview so the user can confirm they picked the right file. */
function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    setDuration(null);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
      {url && (
        <video
          src={`${url}#t=1`}
          muted
          preload="metadata"
          className="h-full w-full object-cover"
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        />
      )}
      {duration !== null && Number.isFinite(duration) && (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] font-semibold tabular-nums">
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}

function VideoSlot({
  label,
  hint,
  input,
  onChange,
  required,
  maxBytes,
  extensions,
  disabled,
}: {
  label: string;
  hint: string;
  input: VideoInput;
  onChange: (v: VideoInput) => void;
  required?: boolean;
  maxBytes: number;
  extensions: string[];
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const filled = hasVideoSource(input);

  const takeFile = (file: File) => {
    const dot = file.name.lastIndexOf(".");
    const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    if (extensions.length > 0 && !extensions.includes(ext)) {
      setLocalError(`Use ${extensions.join(", ")}.`);
      return;
    }
    if (maxBytes > 0 && file.size > maxBytes) {
      setLocalError(`That file is over ${Math.round(maxBytes / (1024 * 1024))} MB.`);
      return;
    }
    setLocalError(null);
    onChange({ mode: "file", file, url: "" });
  };

  const setMode = (mode: InputMode) => {
    setLocalError(null);
    onChange({ ...input, mode, file: null, url: "" });
  };

  return (
    <div className={`flex flex-col gap-3 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-base font-semibold">
          {label}
          {required ? <span className="text-brand"> *</span> : <span className="ml-1.5 text-xs font-normal text-faint">optional</span>}
        </p>
        <div className="flex rounded-full border border-white/[0.08] bg-white/[0.03] p-0.5" role="group" aria-label={`${label} source`}>
          {([["file", Upload, "File"], ["url", Link2, "Link"]] as const).map(([mode, Icon, text]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={input.mode === mode}
              onClick={() => setMode(mode)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                input.mode === mode ? "bg-white/[0.12] text-white" : "text-muted hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {text}
            </button>
          ))}
        </div>
      </div>

      {input.mode === "file" ? (
        <div
          className={`relative flex min-h-[200px] flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed p-6 transition-all duration-300 ${
            dragging
              ? "scale-[1.01] border-brand bg-brand/[0.08] shadow-glow"
              : filled
                ? "border-ok/40 bg-ok/[0.04]"
                : "border-white/[0.12] bg-white/[0.015] hover:border-brand/50 hover:bg-brand/[0.03]"
          }`}
          onDragEnter={(e) => {
            e.preventDefault();
            depth.current += 1;
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            depth.current = 0;
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) takeFile(f);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept={["video/*", ...extensions].join(",")}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) takeFile(f);
              e.target.value = "";
            }}
          />

          {input.file ? (
            <div className="flex w-full items-center gap-4 animate-scale-in">
              <FilePreview file={input.file} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{input.file.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                  <Check className="h-3.5 w-3.5 text-ok" />
                  {formatSize(input.file.size)}
                </p>
                <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 text-xs font-medium text-brand hover:text-brand-hover">
                  Replace file
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChange({ mode: "file", file: null, url: "" })}
                className="icon-btn"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition duration-500 ${dragging ? "scale-110 bg-brand-gradient text-white" : "bg-white/[0.05] text-muted"}`}>
                {required ? <Upload className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
              </div>
              <p className="text-sm font-semibold">{dragging ? "Drop to add" : "Drag a video here"}</p>
              <p className="mt-1 max-w-xs text-center text-xs text-muted">{hint}</p>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary mt-4 px-4 py-2 text-xs">
                <Film className="h-3.5 w-3.5" />
                Browse files
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.015] p-5">
          <p className="mb-3 text-xs text-muted">{hint}</p>
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              type="url"
              value={input.url}
              onChange={(e) => onChange({ mode: "url", file: null, url: e.target.value })}
              placeholder="https://… direct .mp4 or a page yt-dlp supports"
              className={`field py-3 pl-10 ${isValidVideoUrl(input.url) ? "border-ok/50" : ""}`}
              aria-label={`${label} link`}
            />
          </div>

          {isValidVideoUrl(input.url) ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ok animate-fade-in">
              <Check className="h-3.5 w-3.5" />
              Link ready — Continue to import it
            </p>
          ) : input.url.trim() ? (
            <p className="mt-2 text-xs text-warn">Enter a full URL starting with https://</p>
          ) : null}

          <p className="mt-3 text-xs text-faint">
            Links are attempted with yt-dlp. Many YouTube, TikTok, and Instagram URLs are blocked. A file upload is reliable.
          </p>
        </div>
      )}
      {localError && (
        <p role="alert" className="text-xs text-danger animate-fade-in">
          {localError}
        </p>
      )}
    </div>
  );
}

export default function VideoUpload({
  video1,
  video2,
  onVideo1,
  onVideo2,
  batchName,
  onBatchName,
  disabled,
}: Props) {
  const [maxBytes, setMaxBytes] = useState(2048 * 1024 * 1024);
  const [extensions, setExtensions] = useState<string[]>([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);
  useEffect(() => {
    fetchCapabilities()
      .then((caps) => {
        setMaxBytes(caps.max_upload_mb * 1024 * 1024);
        if (caps.video_extensions.length) setExtensions(caps.video_extensions);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <p className="section-kicker">Import</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">Start with a long video</h2>
        <p className="mt-1 text-sm text-muted">
          {extensions.join(", ")} · up to {Math.round(maxBytes / (1024 * 1024))} MB each. A second video unlocks split layouts.
        </p>
      </div>

      <div className="max-w-md">
        <label htmlFor="batch-name" className="mb-1.5 block text-sm font-semibold">
          Batch name <span className="text-brand">*</span>
        </label>
        <input
          id="batch-name"
          type="text"
          maxLength={80}
          value={batchName}
          disabled={disabled}
          onChange={(e) => onBatchName(e.target.value)}
          placeholder="e.g. Podcast Monday, Gym clips, Travel vlog"
          className="field py-3"
        />
        <p className="mt-1.5 text-xs text-faint">Clips are saved in a folder with this name, numbered in order.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <VideoSlot
          label="Primary video"
          hint="Main content — podcast, gameplay, vlog, stream."
          input={video1}
          onChange={onVideo1}
          required
          maxBytes={maxBytes}
          extensions={extensions}
          disabled={disabled}
        />
        <VideoSlot
          label="Second video"
          hint="Reaction cam, B-roll, or a comparison clip."
          input={video2}
          onChange={onVideo2}
          maxBytes={maxBytes}
          extensions={extensions}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
