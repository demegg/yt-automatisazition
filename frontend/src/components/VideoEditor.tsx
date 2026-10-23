import {
  Film,
  Music,
  Pause,
  Play,
  Plus,
  Scissors,
  Split,
  Trash2,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchEditInfo,
  formatTime,
  removeMusic,
  sourceMusicUrl,
  sourceVideoUrl,
  uploadMusic,
} from "../api";
import type { EditorState, SegmentLength } from "../types";
import { newClipId } from "../types";

interface Props {
  jobId: string;
  hasSecondVideo: boolean;
  editor: EditorState;
  onChange: (next: EditorState | ((prev: EditorState) => EditorState)) => void;
  onError: (message: string | null) => void;
}

const SLICE_PRESETS: { value: SegmentLength; label: string }[] = [
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 120, label: "2m" },
  { value: 180, label: "3m" },
  { value: 240, label: "4m" },
  { value: 300, label: "5m" },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function roundTime(n: number) {
  return Math.round(n * 10) / 10;
}

export default function VideoEditor({
  jobId,
  hasSecondVideo,
  editor,
  onChange,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewSlot, setPreviewSlot] = useState<1 | 2>(1);
  const [musicBusy, setMusicBusy] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const duration = editor.duration;
  const update = (partial: Partial<EditorState>) =>
    onChange({ ...editor, ...partial });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEditInfo(jobId)
      .then((info) => {
        if (cancelled) return;
        const dur = info.duration1;
        onChange((prev) => ({
          ...prev,
          duration: dur,
          trimStart: prev.trimStart > 0 ? Math.min(prev.trimStart, dur) : 0,
          trimEnd: prev.trimEnd > 0 ? Math.min(prev.trimEnd, dur) : dur,
          musicName: info.music_name,
          musicEnabled: Boolean(info.music_name) || prev.musicEnabled,
        }));
        onError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          onError(e instanceof Error ? e.message : "Could not load video");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Load once per job — editor identity is owned by the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => setCurrentTime(video.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [loading, previewSlot]);

  const seek = (time: number) => {
    const t = clamp(time, 0, duration || 0);
    setCurrentTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const pct = (time: number) => (duration > 0 ? (time / duration) * 100 : 0);

  const timeFromPointer = (clientX: number) => {
    const el = timelineRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    return roundTime(
      clamp(((clientX - rect.left) / rect.width) * duration, 0, duration)
    );
  };

  const usable =
    editor.cutMode === "custom"
      ? editor.clips.reduce((sum, c) => sum + Math.max(0, c.end - c.start), 0)
      : Math.max(0, editor.trimEnd - editor.trimStart);

  const ensureCustomClips = (): EditorState => {
    if (editor.cutMode === "custom" && editor.clips.length > 0) return editor;
    const start = editor.trimStart || 0;
    const end = editor.trimEnd || duration;
    return {
      ...editor,
      cutMode: "custom",
      clips: [{ id: newClipId(), start, end: Math.max(start + 1, end) }],
    };
  };

  const splitAtPlayhead = () => {
    const t = roundTime(currentTime);
    const base = ensureCustomClips();
    const clip = base.clips.find((c) => t > c.start + 0.4 && t < c.end - 0.4);
    if (!clip) {
      onError("Move the playhead inside a clip (at least 0.4s from either edge).");
      return;
    }
    const nextClips = base.clips.flatMap((c) =>
      c.id === clip.id
        ? [
            { ...c, end: t },
            { id: newClipId(), start: t, end: c.end },
          ]
        : [c]
    );
    onChange({ ...base, clips: nextClips });
    onError(null);
  };

  const addClip = () => {
    const base = ensureCustomClips();
    const last = base.clips[base.clips.length - 1];
    const start = last ? Math.min(last.end, duration - 1) : currentTime;
    const end = Math.min(duration, start + Math.min(30, duration - start));
    if (end - start < 1) {
      onError("Not enough room left to add another clip.");
      return;
    }
    const clip = { id: newClipId(), start: roundTime(start), end: roundTime(end) };
    onChange({ ...base, clips: [...base.clips, clip] });
    setSelectedClipId(clip.id);
    onError(null);
  };

  const sliceEvenly = (len: SegmentLength) => {
    const start = editor.cutMode === "custom" ? 0 : editor.trimStart || 0;
    const end =
      editor.cutMode === "custom" ? duration : editor.trimEnd || duration;
    const windowStart = editor.trimStart || start;
    const windowEnd = editor.trimEnd || end;
    const clips = [];
    for (let t = windowStart; t + len <= windowEnd + 0.05; t += len) {
      clips.push({
        id: newClipId(),
        start: roundTime(t),
        end: roundTime(Math.min(t + len, windowEnd)),
      });
    }
    if (clips.length === 0) {
      onError(`Need at least ${len}s in the trimmed range to slice.`);
      return;
    }
    onChange({ ...editor, cutMode: "custom", clips });
    setSelectedClipId(clips[0]?.id ?? null);
    onError(null);
  };

  const updateClip = (id: string, start: number, end: number) => {
    const s = roundTime(clamp(start, 0, duration));
    const e = roundTime(clamp(end, s + 1, duration));
    update({
      clips: editor.clips.map((c) => (c.id === id ? { ...c, start: s, end: e } : c)),
    });
  };

  const selectedClip = useMemo(
    () => editor.clips.find((c) => c.id === selectedClipId) ?? null,
    [editor.clips, selectedClipId]
  );

  const handleMusic = async (file: File | null) => {
    if (!file) return;
    setMusicBusy(true);
    onError(null);
    try {
      const result = await uploadMusic(jobId, file);
      update({
        musicEnabled: true,
        musicName: result.filename,
        muteOriginal: editor.muteOriginal,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Soundtrack upload failed");
    } finally {
      setMusicBusy(false);
    }
  };

  const handleRemoveMusic = async () => {
    setMusicBusy(true);
    try {
      await removeMusic(jobId);
      update({ musicEnabled: false, musicName: null });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not remove soundtrack");
    } finally {
      setMusicBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-400">Loading editor…</div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-bold">Edit your video</h2>
        <p className="mt-1 text-sm text-gray-400">
          Preview, trim, cut custom parts, and add a song before generating shorts.
          {hasSecondVideo
            ? " Edits follow the primary timeline; the second video stays time-aligned."
            : ""}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div className="space-y-3">
          {hasSecondVideo && (
            <div className="flex rounded-xl bg-surface-border/60 p-1">
              {([1, 2] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    setPreviewSlot(slot);
                    setPlaying(false);
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
                    previewSlot === slot
                      ? "bg-surface-raised text-white shadow"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Video {slot}
                </button>
              ))}
            </div>
          )}
          <div className="mx-auto aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-2xl border border-surface-border bg-black">
            <video
              ref={videoRef}
              key={`${jobId}-${previewSlot}`}
              src={sourceVideoUrl(jobId, previewSlot)}
              className="h-full w-full object-cover"
              playsInline
              onClick={togglePlay}
            />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={togglePlay} className="btn-secondary px-4 py-2">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? "Pause" : "Play"}
            </button>
            <span className="text-sm tabular-nums text-gray-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span>Timeline</span>
              <span>{formatTime(usable)} selected</span>
            </div>
            <div
              ref={timelineRef}
              className="relative h-14 cursor-pointer rounded-xl border border-surface-border bg-surface"
              onClick={(e) => seek(timeFromPointer(e.clientX))}
            >
              {editor.cutMode === "auto" ? (
                <div
                  className="absolute top-2 bottom-2 rounded-md bg-brand/40"
                  style={{
                    left: `${pct(editor.trimStart)}%`,
                    width: `${pct(editor.trimEnd - editor.trimStart)}%`,
                  }}
                />
              ) : (
                editor.clips.map((clip, i) => (
                  <button
                    key={clip.id}
                    type="button"
                    title={`Part ${i + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedClipId(clip.id);
                      seek(clip.start);
                    }}
                    className={`absolute top-2 bottom-2 rounded-md ${
                      clip.id === selectedClipId
                        ? "bg-accent/70 ring-1 ring-white/40"
                        : i % 2 === 0
                          ? "bg-brand/50"
                          : "bg-accent/40"
                    }`}
                    style={{
                      left: `${pct(clip.start)}%`,
                      width: `${Math.max(pct(clip.end - clip.start), 0.8)}%`,
                    }}
                  />
                ))
              )}
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white"
                style={{ left: `${pct(currentTime)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-gray-600">
              <span>0:00</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div>
            <h3 className="font-display mb-1 text-lg font-semibold">How to cut</h3>
            <p className="mb-3 text-sm text-gray-400">
              Auto slices equal shorts from a trimmed range. Custom lets you pick exact parts.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => update({ cutMode: "auto" })}
                className={`option-card flex-1 text-left ${
                  editor.cutMode === "auto" ? "option-card-selected" : ""
                }`}
              >
                <Wand2 className="mb-2 h-4 w-4 text-brand" />
                <p className="font-medium">Auto parts</p>
                <p className="text-xs text-gray-400">
                  Trim, then slice into equal parts (30s–5m+) — files become Part 1, Part 2, …
                </p>
              </button>
              <button
                type="button"
                onClick={() => onChange(ensureCustomClips())}
                className={`option-card flex-1 text-left ${
                  editor.cutMode === "custom" ? "option-card-selected" : ""
                }`}
              >
                <Scissors className="mb-2 h-4 w-4 text-accent" />
                <p className="font-medium">Custom parts</p>
                <p className="text-xs text-gray-400">
                  Split at the playhead or add ranges yourself
                </p>
              </button>
            </div>
          </div>

          {editor.cutMode === "auto" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <TimeField
                label="Keep from"
                value={editor.trimStart}
                max={editor.trimEnd - 1}
                onChange={(v) => update({ trimStart: v })}
                onUsePlayhead={() =>
                  update({
                    trimStart: clamp(roundTime(currentTime), 0, editor.trimEnd - 1),
                  })
                }
              />
              <TimeField
                label="Keep until"
                value={editor.trimEnd}
                min={editor.trimStart + 1}
                max={duration}
                onChange={(v) => update({ trimEnd: v })}
                onUsePlayhead={() =>
                  update({
                    trimEnd: clamp(
                      roundTime(currentTime),
                      editor.trimStart + 1,
                      duration
                    ),
                  })
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={splitAtPlayhead} className="btn-secondary px-3 py-2 text-sm">
                  <Split className="h-4 w-4" />
                  Split at playhead
                </button>
                <button type="button" onClick={addClip} className="btn-secondary px-3 py-2 text-sm">
                  <Plus className="h-4 w-4" />
                  Add part
                </button>
                {SLICE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => sliceEvenly(p.value)}
                    className="btn-secondary px-3 py-2 text-sm"
                  >
                    Slice {p.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {editor.clips.map((clip, i) => (
                  <div
                    key={clip.id}
                    className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
                      clip.id === selectedClipId
                        ? "border-brand bg-brand/10"
                        : "border-surface-border bg-surface"
                    }`}
                  >
                    <Film className="h-4 w-4 text-gray-500" />
                    <span className="w-14 text-sm text-gray-400">Part {i + 1}</span>
                    <input
                      type="number"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={roundTime(clip.start)}
                      onChange={(e) =>
                        updateClip(clip.id, parseFloat(e.target.value) || 0, clip.end)
                      }
                      className="w-20 rounded-lg border border-surface-border bg-surface-raised px-2 py-1 text-sm"
                    />
                    <span className="text-gray-500">–</span>
                    <input
                      type="number"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={roundTime(clip.end)}
                      onChange={(e) =>
                        updateClip(clip.id, clip.start, parseFloat(e.target.value) || 0)
                      }
                      className="w-20 rounded-lg border border-surface-border bg-surface-raised px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-gray-500">
                      {formatTime(clip.end - clip.start)}
                    </span>
                    <button
                      type="button"
                      className="ml-auto text-gray-500 hover:text-red-400"
                      onClick={() => {
                        const next = editor.clips.filter((c) => c.id !== clip.id);
                        update({ clips: next });
                        if (selectedClipId === clip.id) setSelectedClipId(null);
                      }}
                      disabled={editor.clips.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {selectedClip && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary px-3 py-2 text-sm"
                    onClick={() =>
                      updateClip(selectedClip.id, currentTime, selectedClip.end)
                    }
                  >
                    Start at playhead
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-2 text-sm"
                    onClick={() =>
                      updateClip(selectedClip.id, selectedClip.start, currentTime)
                    }
                  >
                    End at playhead
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-surface-border pt-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold">Soundtrack</h3>
            <p className="text-sm text-gray-400">
              Mix a song under each short. Music loops if a clip is longer than the track.
            </p>
          </div>
          <Music className="h-5 w-5 text-accent" />
        </div>

        {editor.musicName ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-surface-border bg-surface px-4 py-3">
            <p className="min-w-0 flex-1 truncate text-sm">{editor.musicName}</p>
            <audio controls src={sourceMusicUrl(jobId)} className="h-8 max-w-full" />
            <button
              type="button"
              disabled={musicBusy}
              onClick={handleRemoveMusic}
              className="btn-secondary px-3 py-2 text-sm"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          </div>
        ) : (
          <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-surface-border bg-surface px-4 py-8 text-center transition hover:border-brand/50">
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.flac"
              className="hidden"
              disabled={musicBusy}
              onChange={(e) => handleMusic(e.target.files?.[0] ?? null)}
            />
            <Music className="mb-2 h-6 w-6 text-gray-500" />
            <p className="text-sm font-medium">
              {musicBusy ? "Uploading…" : "Drop or choose an MP3 / WAV / M4A"}
            </p>
            <p className="mt-1 text-xs text-gray-500">Optional — skip if you want original audio only</p>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-surface-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                {editor.muteOriginal ? (
                  <VolumeX className="h-4 w-4 text-accent" />
                ) : (
                  <Volume2 className="h-4 w-4 text-brand" />
                )}
                Original audio
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!editor.muteOriginal}
                onClick={() => update({ muteOriginal: !editor.muteOriginal })}
                className={`relative h-7 w-12 rounded-full transition ${
                  editor.muteOriginal ? "bg-surface-border" : "bg-brand"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition ${
                    editor.muteOriginal ? "left-0.5" : "left-5"
                  }`}
                />
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(editor.originalVolume * 100)}
              disabled={editor.muteOriginal}
              onChange={(e) =>
                update({ originalVolume: Number(e.target.value) / 100 })
              }
              className="w-full accent-brand disabled:opacity-40"
            />
            <p className="mt-1 text-xs text-gray-500">
              {editor.muteOriginal
                ? "Muted — shorts will use the song only"
                : `${Math.round(editor.originalVolume * 100)}%`}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-surface p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Music className="h-4 w-4 text-accent" />
              Song volume
            </p>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(editor.musicVolume * 100)}
              disabled={!editor.musicName}
              onChange={(e) =>
                update({
                  musicVolume: Number(e.target.value) / 100,
                  musicEnabled: true,
                })
              }
              className="w-full accent-accent disabled:opacity-40"
            />
            <p className="mt-1 text-xs text-gray-500">
              {editor.musicName
                ? `${Math.round(editor.musicVolume * 100)}%`
                : "Add a track to mix it in"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  min = 0,
  max,
  onChange,
  onUsePlayhead,
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  onUsePlayhead: () => void;
}) {
  return (
    <label className="block rounded-xl border border-surface-border bg-surface p-3">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={0.1}
          value={roundTime(value)}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0, min, max))}
          className="w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={onUsePlayhead}
          className="shrink-0 text-xs text-brand hover:text-brand-hover"
        >
          Playhead
        </button>
      </div>
    </label>
  );
}
