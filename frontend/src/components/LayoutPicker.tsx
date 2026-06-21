import type { LayoutMode, LayoutOption } from "../types";

interface Props {
  layouts: LayoutOption[];
  selected: LayoutMode;
  hasSecondVideo: boolean;
  onSelect: (layout: LayoutMode) => void;
}

function LayoutPreview({ id }: { id: LayoutMode }) {
  const base =
    "mx-auto aspect-[9/16] w-16 overflow-hidden rounded-md border border-surface-border bg-surface";

  switch (id) {
    case "stack_vertical":
      return (
        <div className={`${base} flex flex-col`}>
          <div className="flex-1 bg-brand/40" />
          <div className="flex-1 bg-accent/40" />
        </div>
      );
    case "stack_horizontal":
      return (
        <div className={`${base} flex`}>
          <div className="flex-1 bg-brand/40" />
          <div className="flex-1 bg-accent/40" />
        </div>
      );
    case "picture_in_picture":
      return (
        <div className={`${base} relative bg-brand/30`}>
          <div className="absolute bottom-1 right-1 h-4 w-6 rounded-sm bg-accent/70" />
        </div>
      );
    case "main_with_reaction":
      return (
        <div className={`${base} flex flex-col`}>
          <div className="h-[72%] bg-brand/40" />
          <div className="flex-1 bg-accent/40" />
        </div>
      );
    default:
      return <div className={`${base} bg-brand/30`} />;
  }
}

export default function LayoutPicker({
  layouts,
  selected,
  hasSecondVideo,
  onSelect,
}: Props) {
  const available = layouts.filter(
    (l) => !l.requires_two || hasSecondVideo
  );

  return (
    <div>
      <h3 className="font-display mb-1 text-lg font-semibold">Layout</h3>
      <p className="mb-4 text-sm text-gray-400">
        How should your videos appear in the 9:16 frame?
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {available.map((layout) => {
          const isSelected = selected === layout.id;
          return (
            <button
              key={layout.id}
              type="button"
              onClick={() => onSelect(layout.id)}
              className={`option-card text-left ${isSelected ? "option-card-selected" : ""}`}
            >
              <LayoutPreview id={layout.id} />
              <p className="mt-3 font-medium">{layout.name}</p>
              <p className="mt-1 text-xs text-gray-400">{layout.description}</p>
            </button>
          );
        })}
      </div>
      {!hasSecondVideo && (
        <p className="mt-3 text-xs text-gray-500">
          Upload a second video to unlock split-screen layouts.
        </p>
      )}
    </div>
  );
}
