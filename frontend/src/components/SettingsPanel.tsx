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

const CAPTION_STYLES: { value: CaptionStyle; label: string; preview: string }[] =
  [
    { value: "tiktok", label: "TikTok", preview: "BOLD WHITE TEXT" },
    { value: "karaoke", label: "Karaoke", preview: "Yellow highlight" },
    { value: "bold_center", label: "Bold Center", preview: "Clean & centered" },
    { value: "minimal", label: "Minimal", preview: "Subtle subtitles" },
  ];

export default function SettingsPanel({ settings, editor, onChange }: Props) {
  const update = (partial: Partial<AppSettings>) =>
    onChange({ ...settings, ...partial });
  const customCount = editor.clips.length;
  const presetValues = new Set(SEGMENTS.map((s) => s.value));
  const customMinutes =
    !presetValues.has(settings.segmentLength) && settings.segmentLength >= 60
      ? Math.round(settings.segmentLength / 60)
      : "";

  return (
    <div className="space-y-8">
      {editor.cutMode === "custom" ? (
        <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-gray-300">
          Using <span className="font-semibold text-white">{customCount}</span>{" "}
          custom part{customCount === 1 ? "" : "s"} from the editor. Clip length
          is taken from those ranges. Files are labeled Part 1, Part 2, …
        </div>
      ) : (
      <div>
        <h3 className="font-display mb-1 text-lg font-semibold">
          Clip Length
        </h3>
        <p className="mb-4 text-sm text-gray-400">
          Auto-split into equal parts (up to 15 min). Each file is labeled Part 1, Part 2, …
        </p>
        <div className="flex flex-wrap gap-3">
          {SEGMENTS.map((seg) => (
            <button
              key={seg.value}
              type="button"
              onClick={() => update({ segmentLength: seg.value })}
              className={`rounded-xl px-5 py-3 font-medium transition ${
                settings.segmentLength === seg.value
                  ? "bg-accent text-white"
                  : "border border-surface-border bg-surface hover:border-brand/50"
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-400">Custom minutes</label>
          <input
            type="number"
            min={1}
            max={15}
            step={1}
            placeholder="e.g. 7"
            value={customMinutes}
            onChange={(e) => {
              const mins = parseInt(e.target.value, 10);
              if (!Number.isFinite(mins) || mins < 1) return;
              update({ segmentLength: Math.min(15, mins) * 60 });
            }}
            className="w-28 rounded-xl border border-surface-border bg-surface px-3 py-2 outline-none focus:border-brand"
          />
          <span className="text-xs text-gray-500">
            Current: {Math.round(settings.segmentLength / 60)}m {settings.segmentLength % 60}s
          </span>
        </div>
      </div>
      )}
      {editor.cutMode === "auto" &&
        editor.trimEnd - editor.trimStart < settings.segmentLength && (
          <p className="text-sm text-amber-300">
            Trimmed range is {Math.max(0, Math.floor(editor.trimEnd - editor.trimStart))}s,
            shorter than {settings.segmentLength}s clips. Use custom parts in the editor
            or pick a shorter clip length.
          </p>
        )}

      {(editor.musicName || editor.muteOriginal) && (
        <p className="text-sm text-gray-400">
          Soundtrack: {editor.musicName || "none"}
          {editor.muteOriginal ? " · original audio muted" : ""}
        </p>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold">
              Auto Captions
            </h3>
            <p className="text-sm text-gray-400">
              AI speech-to-text burned into each short
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.captionsEnabled}
            onClick={() =>
              update({ captionsEnabled: !settings.captionsEnabled })
            }
            className={`relative h-7 w-12 rounded-full transition ${
              settings.captionsEnabled ? "bg-brand" : "bg-surface-border"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${
                settings.captionsEnabled ? "left-5" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {settings.captionsEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            {CAPTION_STYLES.map((style) => (
              <button
                key={style.value}
                type="button"
                onClick={() => update({ captionStyle: style.value })}
                className={`option-card text-left ${
                  settings.captionStyle === style.value
                    ? "option-card-selected"
                    : ""
                }`}
              >
                <p className="font-medium">{style.label}</p>
                <p className="text-xs text-gray-400">{style.preview}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-display mb-1 text-lg font-semibold">
          Max Shorts (optional)
        </h3>
        <p className="mb-3 text-sm text-gray-400">
          Limit how many clips to generate. Leave empty for all segments.
        </p>
        <input
          type="number"
          min={1}
          max={100}
          placeholder="Unlimited"
          value={settings.maxShorts ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            update({ maxShorts: v ? parseInt(v, 10) : null });
          }}
          className="w-full max-w-xs rounded-xl border border-surface-border bg-surface px-4 py-3 outline-none focus:border-brand"
        />
      </div>
    </div>
  );
}
