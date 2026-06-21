import type { AppSettings, CaptionStyle, SegmentLength } from "../types";

interface Props {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
}

const SEGMENTS: { value: SegmentLength; label: string }[] = [
  { value: 30, label: "30 sec" },
  { value: 60, label: "1 min" },
  { value: 120, label: "2 min" },
];

const CAPTION_STYLES: { value: CaptionStyle; label: string; preview: string }[] =
  [
    { value: "tiktok", label: "TikTok", preview: "BOLD WHITE TEXT" },
    { value: "karaoke", label: "Karaoke", preview: "Yellow highlight" },
    { value: "bold_center", label: "Bold Center", preview: "Clean & centered" },
    { value: "minimal", label: "Minimal", preview: "Subtle subtitles" },
  ];

export default function SettingsPanel({ settings, onChange }: Props) {
  const update = (partial: Partial<AppSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display mb-1 text-lg font-semibold">
          Clip Length
        </h3>
        <p className="mb-4 text-sm text-gray-400">
          Each short will be exactly this duration
        </p>
        <div className="flex flex-wrap gap-3">
          {SEGMENTS.map((seg) => (
            <button
              key={seg.value}
              type="button"
              onClick={() => update({ segmentLength: seg.value })}
              className={`rounded-xl px-6 py-3 font-medium transition ${
                settings.segmentLength === seg.value
                  ? "bg-accent text-white"
                  : "border border-surface-border bg-surface hover:border-brand/50"
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>
      </div>

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
