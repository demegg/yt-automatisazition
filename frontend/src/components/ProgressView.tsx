import { AlertTriangle, Ban, Scissors } from "lucide-react";
import type { JobStatus } from "../types";

interface Props {
  status: JobStatus;
}

export default function ProgressView({ status }: Props) {
  const isFailed = status.status === "failed";
  const isCancelled = status.status === "cancelled";
  const stopped = isFailed || isCancelled;
  const progress = Math.min(Math.max(status.progress || 0, 0), 100);
  const total = status.total_shorts || 0;

  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      <div className="relative mx-auto mb-8 flex h-28 w-28 items-center justify-center">
        {!stopped && (
          <>
            <span className="absolute inset-0 rounded-full bg-brand/20 animate-pulse-ring" />
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                <linearGradient id="progress-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#FF8A57" />
                  <stop offset="0.6" stopColor="#FF4D7E" />
                  <stop offset="1" stopColor="#8B6CFF" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="url(#progress-ring)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 44}
                strokeDashoffset={2 * Math.PI * 44 * (1 - Math.max(progress, 3) / 100)}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            </svg>
          </>
        )}
        <div
          className={`relative flex h-20 w-20 items-center justify-center rounded-full ${
            isFailed ? "bg-danger/15 text-danger" : isCancelled ? "bg-warn/15 text-warn" : "bg-[#141019]"
          }`}
        >
          {isFailed ? (
            <AlertTriangle className="h-8 w-8" />
          ) : isCancelled ? (
            <Ban className="h-8 w-8" />
          ) : (
            <span className="font-display text-xl font-semibold tabular-nums">{Math.round(progress)}%</span>
          )}
        </div>
      </div>

      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {isFailed
          ? "Processing failed"
          : isCancelled
            ? "Processing stopped"
            : status.batch_name
              ? <>Creating <span className="text-gradient">{status.batch_name}</span></>
              : "Creating shorts"}
      </h2>
      <p className="mt-2 text-sm text-muted" role="status">
        {isFailed ? status.error || status.message : status.message}
      </p>

      {!stopped && (
        <>
          <div className="mt-8">
            <div
              className="progress-track h-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
              aria-label="Render progress"
            >
              <div className="progress-fill" style={{ width: `${Math.max(progress, 2)}%` }} />
            </div>
          </div>
          {total > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-1.5" aria-hidden="true">
              {Array.from({ length: Math.min(total, 40) }, (_, i) => {
                const done = i < status.completed_shorts;
                const current = i === status.completed_shorts;
                return (
                  <span
                    key={i}
                    className={`flex h-9 w-6 items-center justify-center rounded-md text-[9px] font-bold transition-all duration-500 ${
                      done
                        ? "bg-brand-gradient text-white shadow-glow"
                        : current
                          ? "animate-pulse bg-white/15 text-ink ring-1 ring-brand/60"
                          : "bg-white/[0.05] text-faint"
                    }`}
                  >
                    {i + 1}
                  </span>
                );
              })}
            </div>
          )}
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
            <Scissors className="h-4 w-4 text-brand" />
            <span className="tabular-nums">
              {status.completed_shorts} / {total || "—"}
            </span>{" "}
            shorts rendered
          </p>
        </>
      )}
    </div>
  );
}
