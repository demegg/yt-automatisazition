import { Check, LayoutTemplate, Lock } from "lucide-react";
import type { LayoutMode, LayoutOption } from "../types";

interface Props {
  layouts: LayoutOption[];
  selected: LayoutMode;
  hasSecondVideo: boolean;
  onSelect: (layout: LayoutMode) => void;
}

const A = "bg-gradient-to-br from-ember-400/70 to-[#ff4d7e]/60";
const B = "bg-gradient-to-br from-violet-500/70 to-violet-400/40";

function LayoutPreview({ id }: { id: LayoutMode }) {
  const base = "mx-auto aspect-[9/16] w-14 overflow-hidden rounded-lg ring-1 ring-white/15 bg-black/40 transition duration-500 group-hover:scale-105";

  switch (id) {
    case "stack_vertical":
      return (
        <div className={`${base} flex flex-col gap-px`}>
          <div className={`flex-1 ${A}`} />
          <div className={`flex-1 ${B}`} />
        </div>
      );
    case "stack_horizontal":
      return (
        <div className={`${base} flex items-center gap-px`}>
          <div className={`h-1/2 flex-1 ${A}`} />
          <div className={`h-1/2 flex-1 ${B}`} />
        </div>
      );
    case "picture_in_picture":
      return (
        <div className={`${base} relative ${A}`}>
          <div className={`absolute bottom-1.5 right-1.5 h-5 w-4 rounded-sm ring-1 ring-white/40 ${B}`} />
        </div>
      );
    case "main_with_reaction":
      return (
        <div className={`${base} flex flex-col gap-px`}>
          <div className={`h-[70%] ${A}`} />
          <div className={`flex-1 ${B}`} />
        </div>
      );
    default:
      return <div className={`${base} ${A}`} />;
  }
}

export default function LayoutPicker({ layouts, selected, hasSecondVideo, onSelect }: Props) {
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <LayoutTemplate className="h-4 w-4 text-brand" /> Layout
      </h3>
      <p className="mb-4 text-sm text-muted">How your videos sit in the 9:16 frame.</p>
      {layouts.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
          {layouts.map((layout) => {
            const isSelected = selected === layout.id;
            const locked = layout.requires_two && !hasSecondVideo;
            return (
              <button
                key={layout.id}
                type="button"
                disabled={locked}
                aria-pressed={isSelected}
                onClick={() => onSelect(layout.id)}
                title={locked ? "Needs a second video" : layout.description}
                className={`option-card group text-center disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${isSelected ? "option-card-selected" : ""}`}
              >
                {isSelected && (
                  <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white animate-scale-in">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                {locked && <Lock className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-faint" />}
                <LayoutPreview id={layout.id} />
                <p className="mt-3 text-sm font-semibold">{layout.name}</p>
                <p className="mt-1 text-[11px] leading-snug text-muted">{layout.description}</p>
              </button>
            );
          })}
        </div>
      )}
      {!hasSecondVideo && (
        <p className="mt-3 text-xs text-faint">Split layouts unlock when the project has a second video.</p>
      )}
    </div>
  );
}
