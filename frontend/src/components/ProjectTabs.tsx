import { Loader2, Plus, X } from "lucide-react";
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
  if (status === "processing" || status === "queued") return "Rendering";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Stopped";
  if (step === "results" || status === "completed") return "Ready";
  if (step === "edit") return "Editing";
  if (step === "configure") return "Configure";
  return "Draft";
}

const TONE: Record<string, string> = {
  Importing: "text-accent",
  Rendering: "text-brand",
  Ready: "text-ok",
  Failed: "text-danger",
  Stopped: "text-warn",
};

export default function ProjectTabs({ projects, activeId, onSelect, onNew, onClose }: Props) {
  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
      {projects.map((p) => {
        const active = p.localId === activeId;
        const hint = statusHint(p.step, p.status, p.busy);
        const working = hint === "Importing" || hint === "Rendering";
        const canClose = projects.length > 1;
        return (
          <div
            key={p.localId}
            className={`group flex shrink-0 items-center gap-1 rounded-2xl border py-1.5 pl-3 pr-1.5 text-sm transition duration-300 animate-scale-in ${
              active
                ? "border-brand/40 bg-brand/[0.1] text-white shadow-glow"
                : "border-white/[0.08] bg-white/[0.02] text-muted hover:border-white/20 hover:text-ink"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(p.localId)}
              className="flex max-w-[170px] flex-col items-start text-left"
              title={p.label}
              aria-current={active ? "page" : undefined}
            >
              <span className="w-full truncate font-semibold">{p.label}</span>
              <span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${TONE[hint] || "text-faint"}`}>
                {working && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                {hint}
              </span>
            </button>
            {canClose && (
              <button
                type="button"
                onClick={() => onClose(p.localId)}
                className="rounded-lg p-1 text-faint opacity-60 transition hover:bg-white/10 hover:text-ink group-hover:opacity-100"
                title="Close tab"
                aria-label={`Close ${p.label}`}
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
        className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-dashed border-white/[0.14] px-3.5 py-2.5 text-sm text-muted transition hover:border-brand/50 hover:text-brand"
      >
        <Plus className="h-4 w-4" />
        Another draft
      </button>
    </div>
  );
}
