import { AlertTriangle, Captions, Hash, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppSettings, CaptionStyle, EditorState, SegmentLength } from "../types";

interface Props {
  settings: AppSettings;
  editor: EditorState;
  onChange: (s: AppSettings) => void;
}

const SEGMENTS: { value: SegmentLength; label: string }[] = [
  { value: 30, label: "30 sec" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
  { value: 180, label: "3 min" },
  { value: 240, label: "4 min" },
  { value: 300, label: "5 min" },
];

const CAPTION_STYLES: { value: CaptionStyle; label: string; preview: string; className: string }[] = [
  { value: "tiktok", label: "TikTok", preview: "BOLD WHITE", className: "font-black uppercase tracking-wide text-white [text-shadow:0_2px_0_#000,0_0_8px_#000]" },
  { value: "karaoke", label: "Karaoke", preview: "Sing along", className: "font-bold text-[#FFE34D] [text-shadow:0_2px_0_#000]" },
  { value: "bold_center", label: "Bold center", preview: "Clean & centered", className: "font-bold text-white [text-shadow:0_2px_6px_#000]" },
  { value: "minimal", label: "Minimal", preview: "Subtle subtitles", className: "rounded bg-black/60 px-1.5 text-[11px] font-medium text-white/90" },
];

/** Mirrors the worker's `_clip_ranges` so the UI can show how many files a render produces. */
export function estimateShorts(settings: AppSettings, editor: EditorState): number {
  let count: number;
  if (editor.cutMode === "custom") {
    count = editor.clips.filter((c) => c.end - c.start >= 1).length;
  } else {
    const range = Math.max(0, editor.trimEnd - editor.trimStart);
    count = settings.segmentLength > 0 ? Math.floor(range / settings.segmentLength) : 0;
  }
  return settings.maxShorts ? Math.min(count, settings.maxShorts) : count;
}

export default function SettingsPanel({ settings, editor, onChange }: Props) {
  const update = (partial: Partial<AppSettings>) => onChange({ ...settings, ...partial });
  const customCount = editor.clips.length;
  const presetValues = new Set(SEGMENTS.map((s) => s.value));
  const isCustomLength = !presetValues.has(settings.segmentLength);
  // Keep the typed text locally so clearing or retyping the field does not snap it back.
  const [minutesText, setMinutesText] = useState(isCustomLength ? String(Math.round(settings.segmentLength / 60)) : "");
  useEffect(() => {
    if (presetValues.has(settings.segmentLength)) setMinutesText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.segmentLength]);

  const range = Math.max(0, editor.trimEnd - editor.trimStart);
  const tooShort = editor.cutMode === "auto" && range < settings.segmentLength;

  return (
    <div className="space-y-10">
      {editor.cutMode === "custom" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand/[0.07] px-4 py-3 text-sm text-ink/85">
          <Timer className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p>
            Using <span className="font-semibold text-white">{customCount}</span> custom part{customCount === 1 ? "" : "s"} from the editor. Clip length comes from those ranges. Files are labeled Part 1, Part 2, …
          </p>
        </div>
      ) : (
        <div>
          <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
            <Timer className="h-4 w-4 text-brand" /> Clip length
          </h3>
          <p className="mb-4 text-sm text-muted">Split the trimmed range into equal parts (up to 15 min each).</p>
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map((seg) => {
              const selected = settings.segmentLength === seg.value;
              const fits = Math.floor(range / seg.value);
              return (
                <button
                  key={seg.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => update({ segmentLength: seg.value })}
                  className={`group relative rounded-2xl px-4 py-2.5 text-left transition duration-300 ${
                    selected
                      ? "bg-brand-gradient text-white shadow-glow"
                      : "border border-white/[0.09] bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/25"
                  }`}
                >
                  <span className="block text-sm font-semibold">{seg.label}</span>
                  <span className={`block text-[11px] ${selected ? "text-white/80" : "text-faint"}`}>
                    {fits} part{fits === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="custom-minutes" className="text-sm text-muted">
              Or custom minutes
            </label>
            <input
              id="custom-minutes"
              type="number"
              min={1}
              max={15}
              step={1}
              placeholder="e.g. 7"
              value={minutesText}
              onChange={(e) => {
                setMinutesText(e.target.value);
                const mins = parseInt(e.target.value, 10);
                if (!Number.isFinite(mins) || mins < 1) return;
                const seconds = Math.min(15, mins) * 60;
                update({ segmentLength: seconds });
              }}
              className={`field w-28 ${isCustomLength ? "border-brand/60" : ""}`}
            />
            <span className="text-xs text-faint">
              Current: {Math.floor(settings.segmentLength / 60)}m {settings.segmentLength % 60}s
            </span>
          </div>
        </div>
      )}
      {tooShort && (
        <p className="flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Trimmed range is {Math.floor(range)}s, shorter than {settings.segmentLength}s clips. Use custom parts in the editor or pick a shorter clip length.
        </p>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Captions className="h-4 w-4 text-brand" /> Auto captions
            </h3>
            <p className="text-sm text-muted">Speech-to-text burned into each short.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.captionsEnabled}
            aria-label="Auto captions"
            onClick={() => update({ captionsEnabled: !settings.captionsEnabled })}
            className={`switch ${settings.captionsEnabled ? "bg-brand-gradient" : "bg-white/[0.12]"}`}
          >
            <span className={`switch-thumb ${settings.captionsEnabled ? "translate-x-5" : ""}`} />
          </button>
        </div>

        {settings.captionsEnabled && (
          <div className="grid gap-3 animate-fade-up sm:grid-cols-2 xl:grid-cols-4">
            {CAPTION_STYLES.map((style) => (
              <button
                key={style.value}
                type="button"
                aria-pressed={settings.captionStyle === style.value}
                onClick={() => update({ captionStyle: style.value })}
                className={`option-card ${settings.captionStyle === style.value ? "option-card-selected" : ""}`}
              >
                <div className="flex h-20 items-end justify-center rounded-xl bg-[linear-gradient(160deg,#2b2140,#0c0d14)] pb-3">
                  <span className={`text-sm ${style.className}`}>{style.preview}</span>
                </div>
                <p className="mt-3 text-sm font-semibold">{style.label}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
          <Hash className="h-4 w-4 text-brand" /> Max shorts <span className="text-sm font-normal text-faint">(optional)</span>
        </h3>
        <p className="mb-3 text-sm text-muted">Render only the first few to test settings. Leave empty for all.</p>
        <input
          type="number"
          min={1}
          max={100}
          placeholder="Unlimited"
          value={settings.maxShorts ?? ""}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            update({ maxShorts: Number.isFinite(v) && v > 0 ? Math.min(100, v) : null });
          }}
          className="field max-w-xs"
          aria-label="Max shorts"
        />
      </div>
    </div>
  );
}
