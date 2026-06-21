import { Loader2, Sparkles } from "lucide-react";
import type { JobStatus } from "../types";

interface Props {
  status: JobStatus;
}

export default function ProgressView({ status }: Props) {
  const isFailed = status.status === "failed";

  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div
        className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl ${
          isFailed ? "bg-red-500/20" : "bg-brand/20"
        }`}
      >
        {isFailed ? (
          <span className="text-3xl">!</span>
        ) : (
          <Loader2 className="h-10 w-10 animate-spin text-brand" />
        )}
      </div>

      <h2 className="font-display text-2xl font-bold">
        {isFailed ? "Something went wrong" : "Creating your shorts..."}
      </h2>
      <p className="mt-2 text-gray-400">
        {isFailed ? status.error : status.message}
      </p>

      {!isFailed && (
        <>
          <div className="mt-8 h-3 overflow-hidden rounded-full bg-surface-border">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500"
              style={{ width: `${Math.min(status.progress, 100)}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-gray-500">
            {status.completed_shorts} / {status.total_shorts || "—"} shorts
          </p>

          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400">
            <Sparkles className="h-4 w-4 text-accent" />
            <span>Captions & vertical crop applied per clip</span>
          </div>
        </>
      )}
    </div>
  );
}
