import { Download, Loader2, Package, Pencil, Play, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { downloadAllFiles, downloadShortFile, downloadUrl, formatTime } from "../api";
import { useToast } from "../site/ui";
import type { ShortInfo } from "../types";
import PublishPanel from "./PublishPanel";

interface Props {
  jobId: string;
  shorts: ShortInfo[];
  batchName?: string | null;
  batchSlug?: string | null;
  onReedit?: () => void;
}

function ShortCard({
  jobId,
  short,
  index,
  busy,
  onDownload,
}: {
  jobId: string;
  short: ShortInfo;
  index: number;
  busy: boolean;
  onDownload: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [engaged, setEngaged] = useState(false);
  const label = short.title || `Part ${short.index}`;
  const length = Math.max(0, short.end_time - short.start_time) || short.duration;

  return (
    <div
      className="card card-hover group overflow-hidden animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 12) * 50}ms` }}
      onMouseEnter={() => {
        if (!engaged && video.current) {
          video.current.muted = true;
          void video.current.play().catch(() => undefined);
        }
      }}
      onMouseLeave={() => {
        if (!engaged && video.current) {
          video.current.pause();
          video.current.currentTime = 0;
        }
      }}
    >
      <div className="relative aspect-[9/16] bg-black">
        <video
          ref={video}
          src={downloadUrl(jobId, short.filename)}
          className="h-full w-full object-contain"
          controls={engaged}
          loop={!engaged}
          playsInline
          preload="metadata"
          crossOrigin="use-credentials"
        />
        {!engaged && (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent"
            aria-label={`Play ${label} with sound`}
            onClick={() => {
              setEngaged(true);
              if (video.current) {
                video.current.muted = false;
                video.current.currentTime = 0;
                void video.current.play().catch(() => undefined);
              }
            }}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition duration-300 group-hover:scale-110 group-hover:bg-white/25">
              <Play className="ml-1 h-6 w-6 fill-current" />
            </span>
          </button>
        )}
        <div className="pointer-events-none absolute left-2.5 top-2.5 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-semibold backdrop-blur">
          {label}
        </div>
        <div className="pointer-events-none absolute right-2.5 top-2.5 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-semibold tabular-nums backdrop-blur">
          {formatTime(length)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 p-3.5">
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold" title={short.filename}>
            {label}
          </p>
          <p className="text-xs tabular-nums text-muted">
            {formatTime(short.start_time)} – {formatTime(short.end_time)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="icon-btn border border-white/10 hover:border-brand/50 hover:text-brand"
          title="Download MP4"
          aria-label={`Download ${label}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ResultsGrid({ jobId, shorts, batchName, batchSlug, onReedit }: Props) {
  const toast = useToast();
  const sorted = [...shorts].sort((a, b) => a.index - b.index || a.filename.localeCompare(b.filename));
  const title = batchName?.trim() || "Shorts ready";
  const [busy, setBusy] = useState<string | null>(null);
  const totalSeconds = sorted.reduce((sum, s) => sum + Math.max(0, s.end_time - s.start_time), 0);

  const handleDownloadOne = async (filename: string) => {
    setBusy(filename);
    try {
      const path = await downloadShortFile(jobId, filename);
      toast(path ? "Saved" : "Download started", { body: path || filename });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Download failed", { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadAll = async () => {
    setBusy("all");
    try {
      const path = await downloadAllFiles(jobId, `${batchSlug || "shorts"}_shorts.zip`);
      toast(path ? "Saved zip" : "Zip download started", { body: path || undefined });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Download failed", { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-kicker">
            <Sparkles className="h-3.5 w-3.5" /> Ready to post
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted">
            {sorted.length} part{sorted.length === 1 ? "" : "s"} · {formatTime(totalSeconds)} total
            {batchSlug ? ` · output/${batchSlug}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onReedit && (
            <button type="button" className="btn-secondary" onClick={onReedit}>
              <Pencil className="h-4 w-4" />
              Edit and re-render
            </button>
          )}
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={busy === "all" || sorted.length === 0}
            className="btn-primary"
          >
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            {busy === "all" ? "Preparing zip…" : "Download all (.zip)"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((short, index) => (
          <ShortCard
            key={short.filename}
            jobId={jobId}
            short={short}
            index={index}
            busy={busy === short.filename}
            onDownload={() => void handleDownloadOne(short.filename)}
          />
        ))}
      </div>

      {shorts.length === 0 && (
        <div className="py-16 text-center text-muted">
          <Play className="mx-auto mb-4 h-12 w-12 opacity-30" />
          <p>No shorts generated yet.</p>
        </div>
      )}

      <PublishPanel jobId={jobId} shortCount={shorts.length} />
    </div>
  );
}
