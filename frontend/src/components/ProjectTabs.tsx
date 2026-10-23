import { FolderPlus, X } from "lucide-react";
import type { Step } from "../types";

export interface ProjectTab {
  localId: string;
  label: string;
  step: Step;
  status?: string | null;
  busy?: boolean;
}

type Props = {
  projects: ProjectTab[];
  activeId: string;
  onSelect: (localId: string) => void;
  onNew: () => void;
  onClose: (localId: string) => void;
};

function statusHint(step: Step, status?: string | null, busy?: boolean): string {
  if (busy || status === "importing") return "Importing";
  if (step === "processing" || status === "processing" || status === "queued") {
    return "Processing";
  }
  if (step === "results" || status === "completed") return "Ready";
  if (status === "failed") return "Failed";
  if (step === "edit") return "Editing";
  if (step === "configure") return "Configure";
  return "Upload";
}

export default function ProjectTabs({
  projects,
  activeId,
  onSelect,
  onNew,
  onClose,
}: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {projects.map((p) => {
        const active = p.localId === activeId;
        const hint = statusHint(p.step, p.status, p.busy);
        const canClose = projects.length > 1;
        return (
          <div
            key={p.localId}
            className={`group flex shrink-0 items-center gap-1 rounded-xl border px-2 py-1.5 text-sm transition ${
              active
                ? "border-brand/50 bg-brand/15 text-white"
                : "border-surface-border bg-surface-raised/60 text-gray-400 hover:border-brand/30 hover:text-gray-200"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(p.localId)}
              className="flex max-w-[160px] flex-col items-start px-1 text-left"
              title={p.label}
            >
              <span className="w-full truncate font-medium">{p.label}</span>
              <span
                className={`text-[10px] uppercase tracking-wide ${
                  hint === "Processing" || hint === "Importing"
                    ? "text-accent"
                    : hint === "Ready"
                      ? "text-emerald-400"
                      : hint === "Failed"
                        ? "text-red-400"
                        : "text-gray-500"
                }`}
              >
                {hint}
              </span>
            </button>
            {canClose && (
              <button
                type="button"
                onClick={() => onClose(p.localId)}
                className="rounded-lg p-1 text-gray-500 opacity-70 transition hover:bg-white/5 hover:text-gray-200 group-hover:opacity-100"
                title="Close project tab"
                aria-label="Close project"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onNew}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-surface-border px-3 py-2 text-sm text-gray-400 transition hover:border-brand/40 hover:text-brand"
      >
        <FolderPlus className="h-4 w-4" />
        New project
      </button>
    </div>
  );
}
