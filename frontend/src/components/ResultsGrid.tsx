import { Download, Package, Play } from "lucide-react";
import { useState } from "react";
import {
  downloadAllFiles,
  downloadShortFile,
  downloadUrl,
  formatTime,
} from "../api";
import type { ShortInfo } from "../types";
import PublishPanel from "./PublishPanel";

interface Props {
  jobId: string;
  shorts: ShortInfo[];
  batchName?: string | null;
  batchSlug?: string | null;
}

export default function ResultsGrid({ jobId, shorts, batchName, batchSlug }: Props) {
  const sorted = [...shorts].sort((a, b) => a.index - b.index || a.filename.localeCompare(b.filename));
  const title = batchName?.trim() || "Shorts Ready";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const handleDownloadOne = async (filename: string) => {
    setError(null);
    setSavedTo(null);
    setBusy(filename);
    try {
      const path = await downloadShortFile(jobId, filename);
      if (path) setSavedTo(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadAll = async () => {
    setError(null);
    setSavedTo(null);
    setBusy("all");
    try {
      const path = await downloadAllFiles(jobId, `${batchSlug || "shorts"}_shorts.zip`);
      if (path) setSavedTo(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">
            {title}
          </h2>
          <p className="text-gray-400">
            {sorted.length} part{sorted.length === 1 ? "" : "s"}
            {batchSlug ? ` · folder output/${batchSlug}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={busy === "all" || sorted.length === 0}
          className="btn-primary"
        >
          <Package className="h-5 w-5" />
          {busy === "all" ? "Preparing zip…" : "Download All (.zip)"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {savedTo && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-gray-200">
          Saved to <span className="break-all text-white">{savedTo}</span>
        </div>
      )}

      <PublishPanel jobId={jobId} shortCount={shorts.length} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((short) => {
          const label = short.title || `Part ${short.index}`;
          return (
            <div key={short.filename} className="glass-card overflow-hidden">
              <div className="relative aspect-[9/16] bg-black">
                <video
                  src={downloadUrl(jobId, short.filename)}
                  className="h-full w-full object-contain"
                  controls
                  preload="metadata"
                  crossOrigin="use-credentials"
                />
                <div className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-xs font-medium">
                  {label}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium" title={short.filename}>
                    {label}
                  </p>
                  <p className="text-gray-400">
                    {formatTime(short.start_time)} –{" "}
                    {formatTime(short.end_time)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadOne(short.filename)}
                  disabled={busy === short.filename}
                  className="rounded-lg p-2 text-gray-400 hover:bg-surface-border hover:text-white disabled:opacity-50"
                  title="Download"
                >
                  <Download className="h-5 w-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {shorts.length === 0 && (
        <div className="py-16 text-center text-gray-400">
          <Play className="mx-auto mb-4 h-12 w-12 opacity-30" />
          <p>No shorts generated yet.</p>
        </div>
      )}
    </div>
  );
}
