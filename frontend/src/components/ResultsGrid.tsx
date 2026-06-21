import { Download, Package, Play } from "lucide-react";
import { downloadAllUrl, downloadUrl, formatTime } from "../api";
import type { ShortInfo } from "../types";
import PublishPanel from "./PublishPanel";

interface Props {
  jobId: string;
  shorts: ShortInfo[];
}

export default function ResultsGrid({ jobId, shorts }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">
            {shorts.length} Shorts Ready
          </h2>
          <p className="text-gray-400">
            Download below, or scroll down to schedule to YouTube & TikTok
          </p>
        </div>
        <a href={downloadAllUrl(jobId)} className="btn-primary">
          <Package className="h-5 w-5" />
          Download All (.zip)
        </a>
      </div>

      <PublishPanel jobId={jobId} shortCount={shorts.length} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shorts.map((short) => (
          <div key={short.filename} className="glass-card overflow-hidden">
            <div className="relative aspect-[9/16] bg-black">
              <video
                src={downloadUrl(jobId, short.filename)}
                className="h-full w-full object-contain"
                controls
                preload="metadata"
              />
              <div className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-1 text-xs font-medium">
                #{short.index}
              </div>
            </div>
            <div className="flex items-center justify-between p-3">
              <div className="text-sm">
                <p className="font-medium">Short {short.index}</p>
                <p className="text-gray-400">
                  {formatTime(short.start_time)} –{" "}
                  {formatTime(short.end_time)}
                </p>
              </div>
              <a
                href={downloadUrl(jobId, short.filename)}
                download
                className="rounded-lg p-2 text-gray-400 hover:bg-surface-border hover:text-white"
                title="Download"
              >
                <Download className="h-5 w-5" />
              </a>
            </div>
          </div>
        ))}
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
