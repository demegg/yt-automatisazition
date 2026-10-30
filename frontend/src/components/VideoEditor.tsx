import {
  Film,
  Keyboard,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Rewind,
  FastForward,
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
import { Modal } from "../site/ui";
import type { EditInfo, EditorState, SegmentLength } from "../types";
import { newClipId } from "../types";

interface Props {
  jobId: string;
  hasSecondVideo: boolean;
  editor: EditorState;
  onChange: (next: EditorState | ((prev: EditorState) => EditorState)) => void;
  onInfo?: (info: EditInfo) => void;
  onError: (message: string | null) => void;
}

const SLICE_PRESETS: { value: SegmentLength; label: string }[] = [
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 120, label: "2m" },
  { value: 180, label: "3m" },
  { value: 300, label: "5m" },
];

const SHORTCUTS: [string, string][] = [
  ["Space", "Play or pause"],
  ["← / →", "Seek 1 second (Shift: 5 seconds)"],
  ["I", "Set start (trim or selected part) at playhead"],
  ["O", "Set end (trim or selected part) at playhead"],
  ["S", "Split the part under the playhead"],
  ["N", "Add a new part"],
  ["Delete", "Remove the selected part"],
  ["?", "Show this list"],
];

type Drag =
  | { kind: "scrub" }
  | { kind: "trim-start" }
  | { kind: "trim-end" }
  | { kind: "clip-start" | "clip-end"; id: string };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function roundTime(n: number) {
  return Math.round(n * 10) / 10;
}

function rulerStep(duration: number) {
  const steps = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800];
  return steps.find((s) => duration / s <= 10) ?? 3600;
}

export default function VideoEditor({
  jobId,
  hasSecondVideo,
  editor,
  onChange,
  onInfo,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewSlot, setPreviewSlot] = useState<1 | 2>(1);
  const [musicBusy, setMusicBusy] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [dragging, setDragging] = useState(false);

  const duration = editor.duration;
  const update = (partial: Partial<EditorState>) => onChange((prev) => ({ ...prev, ...partial }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEditInfo(jobId)
      .then((info) => {
        if (cancelled) return;
        const dur = info.duration1;
        onInfo?.(info);
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
    setVideoReady(false);
    setVideoFailed(false);
  }, [previewSlot]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      if (dragRef.current?.kind !== "scrub") setCurrentTime(video.currentTime);
    };
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
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  const pct = (time: number) => (duration > 0 ? (time / duration) * 100 : 0);

  const timeFromPointer = (clientX: number) => {
    const el = timelineRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    return roundTime(clamp(((clientX - rect.left) / rect.width) * duration, 0, duration));
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
      onError("Move the playhead inside a part (at least 0.4s from either edge) to split it.");
      return;
    }
    const second = { id: newClipId(), start: t, end: clip.end };
    const nextClips = base.clips.flatMap((c) => (c.id === clip.id ? [{ ...c, end: t }, second] : [c]));
    onChange({ ...base, clips: nextClips });
    setSelectedClipId(second.id);
    onError(null);
  };

  const addClip = () => {
    const base = ensureCustomClips();
    const last = base.clips[base.clips.length - 1];
    const start = last ? Math.min(last.end, duration - 1) : currentTime;
    const end = Math.min(duration, start + Math.min(30, duration - start));
    if (end - start < 1) {
      onError("Not enough room left to add another part.");
      return;
    }
    const clip = { id: newClipId(), start: roundTime(start), end: roundTime(end) };
    onChange({ ...base, clips: [...base.clips, clip] });
    setSelectedClipId(clip.id);
    onError(null);
  };

  const removeClip = (id: string) => {
    if (editor.clips.length <= 1) return;
    update({ clips: editor.clips.filter((c) => c.id !== id) });
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const sliceEvenly = (len: SegmentLength) => {
    const windowStart = editor.trimStart || 0;
    const windowEnd = editor.trimEnd || duration;
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
    const s = roundTime(clamp(start, 0, Math.max(0, duration - 1)));
    const e = roundTime(clamp(end, s + 1, duration));
    onChange((prev) => ({
      ...prev,
      clips: prev.clips.map((c) => (c.id === id ? { ...c, start: s, end: e } : c)),
    }));
  };

  const selectedClip = useMemo(
    () => editor.clips.find((c) => c.id === selectedClipId) ?? null,
    [editor.clips, selectedClipId]
  );

  const setIn = () => {
    const t = roundTime(currentTime);
    if (editor.cutMode === "custom" && selectedClip) updateClip(selectedClip.id, t, Math.max(selectedClip.end, t + 1));
    else update({ trimStart: clamp(t, 0, editor.trimEnd - 1) });
  };

  const setOut = () => {
    const t = roundTime(currentTime);
    if (editor.cutMode === "custom" && selectedClip) updateClip(selectedClip.id, Math.min(selectedClip.start, t - 1), t);
    else update({ trimEnd: clamp(t, editor.trimStart + 1, duration) });
  };

  // Keyboard shortcuts. Re-bound each render so handlers see current state.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[role="dialog"]') && event.key !== "?") return;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        seek(currentTime + (event.shiftKey ? 5 : 1));
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        seek(currentTime - (event.shiftKey ? 5 : 1));
      } else if (key === "i") {
        setIn();
      } else if (key === "o") {
        setOut();
      } else if (key === "s") {
        splitAtPlayhead();
      } else if (key === "n") {
        addClip();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedClip) {
        event.preventDefault();
        removeClip(selectedClip.id);
      } else if (event.key === "?") {
        setShowKeys((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- Timeline dragging ---------- */

  const startDrag = (drag: Drag) => (event: React.PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    dragRef.current = drag;
    setDragging(true);
    timelineRef.current?.setPointerCapture(event.pointerId);
    if (drag.kind === "scrub") seek(timeFromPointer(event.clientX));
  };

  const onTimelineMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const t = timeFromPointer(event.clientX);
    if (drag.kind === "scrub") {
      seek(t);
    } else if (drag.kind === "trim-start") {
      onChange((prev) => ({ ...prev, trimStart: clamp(t, 0, prev.trimEnd - 1) }));
      seek(t);
    } else if (drag.kind === "trim-end") {
      onChange((prev) => ({ ...prev, trimEnd: clamp(t, prev.trimStart + 1, duration) }));
      seek(t);
    } else {
      const { id, kind } = drag;
      onChange((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => {
          if (c.id !== id) return c;
          return kind === "clip-start"
            ? { ...c, start: clamp(t, 0, c.end - 1) }
            : { ...c, end: clamp(t, c.start + 1, duration) };
        }),
      }));
      seek(t);
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    timelineRef.current?.releasePointerCapture?.(event.pointerId);
  };

  /* ---------- Soundtrack ---------- */

  const handleMusic = async (file: File | null) => {
    if (!file) return;
    setMusicBusy(true);
    onError(null);
    try {
      const result = await uploadMusic(jobId, file);
      update({ musicEnabled: true, musicName: result.filename });
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
      <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)_320px]">
        <div className="skeleton h-72" />
        <div className="skeleton mx-auto aspect-[9/16] w-full max-w-[380px]" />
        <div className="skeleton h-72" />
      </div>
    );
  }

  const step = rulerStep(duration);
  const ticks = duration > 0 ? Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => i * step) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Edit</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-ink">Source and cut</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Preview, trim, cut custom parts, and add a song before generating shorts.
            {hasSecondVideo ? " Edits follow the primary timeline; the second video stays time-aligned." : ""}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setShowKeys(true)}>
          <Keyboard className="h-4 w-4" />
          Shortcuts
          <span className="kbd">?</span>
        </button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[200px_minmax(0,1fr)_340px]">
        <aside className="card space-y-4 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Media</p>
          <div>
            <p className="font-display text-2xl font-semibold tabular-nums text-ink">{formatTime(duration)}</p>
            <p className="text-xs text-muted">source length</p>
          </div>
          <div>
            <p className="font-display text-lg font-semibold tabular-nums text-brand">{formatTime(usable)}</p>
            <p className="text-xs text-muted">selected</p>
          </div>
          {editor.cutMode === "custom" ? (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {editor.clips.map((clip, i) => (
                <li key={clip.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClipId(clip.id);
                      seek(clip.start);
                    }}
                    className={`w-full rounded-xl px-2.5 py-2 text-left text-xs transition ${
                      clip.id === selectedClipId ? "bg-brand/15 text-ink ring-1 ring-brand/40" : "text-muted hover:bg-white/[0.05] hover:text-ink"
                    }`}
                  >
                    <span className="font-semibold">Part {i + 1}</span>
                    <span className="mt-0.5 block tabular-nums text-[10px] text-faint">
                      {formatTime(clip.start)}–{formatTime(clip.end)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs leading-relaxed text-muted">
              Equal parts from {formatTime(editor.trimStart)} to {formatTime(editor.trimEnd)}.
            </p>
          )}
        </aside>

        <div className="space-y-3">
          {hasSecondVideo && (
            <div className="mx-auto flex max-w-[380px] rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
              {([1, 2] as const).map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    setPreviewSlot(slot);
                    setPlaying(false);
                  }}
                  className={`flex-1 rounded-full py-1.5 text-sm font-medium transition ${
                    previewSlot === slot ? "bg-white/[0.12] text-white" : "text-muted hover:text-white"
                  }`}
                >
                  {slot === 1 ? "Primary" : "Second video"}
                </button>
              ))}
            </div>
          )}
          <div className="group relative mx-auto aspect-[9/16] w-full max-w-[380px] overflow-hidden rounded-3xl border border-white/[0.12] bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_60px_-20px_rgba(255,107,61,0.25)]">
            <video
              ref={videoRef}
              key={`${jobId}-${previewSlot}`}
              src={sourceVideoUrl(jobId, previewSlot)}
              className="h-full w-full object-cover"
              playsInline
              preload="metadata"
              onClick={togglePlay}
              onLoadedData={() => setVideoReady(true)}
              onError={() => setVideoFailed(true)}
            />
            {!videoReady && !videoFailed && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
              </div>
            )}
            {videoFailed && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-muted">
                The browser can’t preview this file’s codec. You can still trim by time and render.
              </div>
            )}
            {videoReady && !playing && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play"
                className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition duration-300 hover:scale-110 hover:bg-white/25 animate-scale-in"
              >
                <Play className="ml-1 h-7 w-7 fill-current" />
              </button>
            )}
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold tabular-nums backdrop-blur">
              {formatTime(currentTime)}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button type="button" className="icon-btn" onClick={() => seek(currentTime - 5)} aria-label="Back 5 seconds">
              <Rewind className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 active:scale-95"
              aria-label={playing ? "Pause" : "Play"}
              aria-keyshortcuts="Space"
            >
              {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
            <button type="button" className="icon-btn" onClick={() => seek(currentTime + 5)} aria-label="Forward 5 seconds">
              <FastForward className="h-4 w-4" />
            </button>
            <span className="ml-2 text-sm tabular-nums text-muted">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>

        <div className="card space-y-5 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Properties</p>
          <div>
            <h3 className="mb-3 font-display text-base font-semibold">How to cut</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={editor.cutMode === "auto"}
                onClick={() => update({ cutMode: "auto" })}
                className={`option-card p-3 ${editor.cutMode === "auto" ? "option-card-selected" : ""}`}
              >
                <Wand2 className="mb-2 h-4 w-4 text-brand" />
                <p className="text-sm font-semibold">Auto parts</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">Trim, then slice into equal parts</p>
              </button>
              <button
                type="button"
                aria-pressed={editor.cutMode === "custom"}
                onClick={() => onChange(ensureCustomClips())}
                className={`option-card p-3 ${editor.cutMode === "custom" ? "option-card-selected" : ""}`}
              >
                <Scissors className="mb-2 h-4 w-4 text-accent" />
                <p className="text-sm font-semibold">Custom parts</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">Split or add exact ranges</p>
              </button>
            </div>
          </div>

          {editor.cutMode === "auto" ? (
            <div className="grid gap-3">
              <TimeField
                label="Keep from"
                shortcut="I"
                value={editor.trimStart}
                max={editor.trimEnd - 1}
                onChange={(v) => update({ trimStart: v })}
                onUsePlayhead={setIn}
              />
              <TimeField
                label="Keep until"
                shortcut="O"
                value={editor.trimEnd}
                min={editor.trimStart + 1}
                max={duration}
                onChange={(v) => update({ trimEnd: v })}
                onUsePlayhead={setOut}
              />
              <p className="text-xs text-faint">Tip: drag the handles on the timeline below.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={splitAtPlayhead} className="btn-secondary px-3 py-2 text-xs">
                  <Split className="h-3.5 w-3.5" />
                  Split <span className="kbd">S</span>
                </button>
                <button type="button" onClick={addClip} className="btn-secondary px-3 py-2 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add <span className="kbd">N</span>
                </button>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] text-faint">Slice trimmed range evenly</p>
                <div className="flex flex-wrap gap-1.5">
                  {SLICE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => sliceEvenly(p.value)}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-muted transition hover:border-brand/50 hover:text-ink"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {editor.clips.map((clip, i) => (
                  <div
                    key={clip.id}
                    onClick={() => setSelectedClipId(clip.id)}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition ${
                      clip.id === selectedClipId ? "border-brand/50 bg-brand/[0.08]" : "border-white/[0.07] bg-white/[0.02]"
                    }`}
                  >
                    <Film className="h-3.5 w-3.5 shrink-0 text-faint" />
                    <span className="w-11 shrink-0 text-xs font-semibold text-muted">Part {i + 1}</span>
                    <input
                      type="number"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={roundTime(clip.start)}
                      onChange={(e) => updateClip(clip.id, parseFloat(e.target.value) || 0, clip.end)}
                      className="w-[4.5rem] rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-xs tabular-nums outline-none focus:border-brand/60"
                      aria-label={`Part ${i + 1} start`}
                    />
                    <span className="text-faint">–</span>
                    <input
                      type="number"
                      min={0}
                      max={duration}
                      step={0.1}
                      value={roundTime(clip.end)}
                      onChange={(e) => updateClip(clip.id, clip.start, parseFloat(e.target.value) || 0)}
                      className="w-[4.5rem] rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-xs tabular-nums outline-none focus:border-brand/60"
                      aria-label={`Part ${i + 1} end`}
                    />
                    <button
                      type="button"
                      className="ml-auto rounded-lg p-1 text-faint transition hover:bg-danger/15 hover:text-danger disabled:opacity-30"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeClip(clip.id);
                      }}
                      disabled={editor.clips.length <= 1}
                      aria-label={`Remove part ${i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {selectedClip && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={setIn}>
                    Start here <span className="kbd">I</span>
                  </button>
                  <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={setOut}>
                    End here <span className="kbd">O</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
          <span>Timeline</span>
          <span className="normal-case tracking-normal text-muted">
            {formatTime(usable)} selected · drag to scrub
          </span>
        </div>
        <div
          ref={timelineRef}
          className={`relative h-20 touch-none select-none overflow-hidden rounded-xl bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.025)_0_2px,transparent_2px_12px)] ring-1 ring-white/[0.06] ${dragging ? "cursor-grabbing" : "cursor-pointer"}`}
          onPointerDown={startDrag({ kind: "scrub" })}
          onPointerMove={onTimelineMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {ticks.map((t) => (
            <span key={t} className="pointer-events-none absolute top-0 h-full" style={{ left: `${pct(t)}%` }}>
              <span className="block h-2 w-px bg-white/25" />
              <span className="absolute left-1 top-0.5 text-[9px] tabular-nums text-faint">{formatTime(t)}</span>
            </span>
          ))}
          {editor.cutMode === "auto" ? (
            <>
              <div
                className="pointer-events-none absolute bottom-0 left-0 top-0 bg-black/55"
                style={{ width: `${pct(editor.trimStart)}%` }}
              />
              <div
                className="pointer-events-none absolute bottom-0 right-0 top-0 bg-black/55"
                style={{ width: `${100 - pct(editor.trimEnd)}%` }}
              />
              <div
                className="pointer-events-none absolute bottom-3 top-5 rounded-lg bg-gradient-to-r from-ember-400/50 via-[#ff4d7e]/45 to-violet-500/50 ring-1 ring-inset ring-white/25"
                style={{ left: `${pct(editor.trimStart)}%`, width: `${pct(editor.trimEnd - editor.trimStart)}%` }}
              />
              <Handle at={pct(editor.trimStart)} label="Trim start" onPointerDown={startDrag({ kind: "trim-start" })} />
              <Handle at={pct(editor.trimEnd)} label="Trim end" onPointerDown={startDrag({ kind: "trim-end" })} />
            </>
          ) : (
            editor.clips.map((clip, i) => {
              const selected = clip.id === selectedClipId;
              return (
                <div
                  key={clip.id}
                  className={`absolute bottom-3 top-5 rounded-lg ring-1 ring-inset transition-colors ${
                    selected
                      ? "z-10 bg-gradient-to-r from-ember-400/80 to-[#ff4d7e]/80 ring-white/60"
                      : i % 2 === 0
                        ? "bg-white/25 ring-white/15 hover:bg-white/35"
                        : "bg-violet-500/35 ring-white/15 hover:bg-violet-500/45"
                  }`}
                  style={{ left: `${pct(clip.start)}%`, width: `${Math.max(pct(clip.end - clip.start), 0.6)}%` }}
                  onPointerDown={(e) => {
                    setSelectedClipId(clip.id);
                    startDrag({ kind: "scrub" })(e);
                  }}
                  title={`Part ${i + 1}`}
                >
                  <span className="pointer-events-none absolute left-1.5 top-1 truncate text-[10px] font-semibold text-white/90">
                    {i + 1}
                  </span>
                  {selected && (
                    <>
                      <Handle at={0} label={`Part ${i + 1} start`} onPointerDown={startDrag({ kind: "clip-start", id: clip.id })} inner />
                      <Handle at={100} label={`Part ${i + 1} end`} onPointerDown={startDrag({ kind: "clip-end", id: clip.id })} inner />
                    </>
                  )}
                </div>
              );
            })
          )}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
            style={{ left: `${pct(currentTime)}%` }}
          >
            <span className="absolute -top-0.5 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-sm bg-white" />
          </div>
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-faint">
          <span>0:00</span>
          <span className="text-ink/80">{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Music className="h-4 w-4 text-brand" /> Soundtrack
            </h3>
            <p className="text-sm text-muted">Mix a song under each short. Music loops if a clip is longer than the track.</p>
          </div>
        </div>

        {editor.musicName ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand">
              <Music className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{editor.musicName}</p>
            <audio controls src={sourceMusicUrl(jobId)} className="h-8 max-w-full" />
            <button type="button" disabled={musicBusy} onClick={handleRemoveMusic} className="btn-ghost text-danger hover:text-danger">
              <Trash2 className="h-4 w-4" />
              Remove
            </button>
          </div>
        ) : (
          <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.015] px-4 py-8 text-center transition hover:border-brand/50 hover:bg-brand/[0.03]">
            <input
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/flac,.mp3,.wav,.m4a,.aac,.ogg,.flac"
              className="sr-only"
              disabled={musicBusy}
              onChange={(e) => {
                void handleMusic(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            {musicBusy ? <Loader2 className="mb-2 h-6 w-6 animate-spin text-brand" /> : <Music className="mb-2 h-6 w-6 text-faint" />}
            <p className="text-sm font-medium">{musicBusy ? "Uploading…" : "Choose an MP3, WAV, or M4A"}</p>
            <p className="mt-1 text-xs text-faint">Optional — skip it to keep the original audio only</p>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                {editor.muteOriginal ? <VolumeX className="h-4 w-4 text-faint" /> : <Volume2 className="h-4 w-4 text-brand" />}
                Original audio
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!editor.muteOriginal}
                aria-label="Original audio"
                onClick={() => update({ muteOriginal: !editor.muteOriginal })}
                className={`switch ${editor.muteOriginal ? "bg-white/[0.12]" : "bg-brand-gradient"}`}
              >
                <span className={`switch-thumb ${editor.muteOriginal ? "" : "translate-x-5"}`} />
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(editor.originalVolume * 100)}
              disabled={editor.muteOriginal}
              onChange={(e) => update({ originalVolume: Number(e.target.value) / 100 })}
              className="w-full"
              aria-label="Original audio volume"
            />
            <p className="mt-1.5 text-xs text-faint">
              {editor.muteOriginal ? "Muted — shorts use the song only" : `${Math.round(editor.originalVolume * 100)}%`}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
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
              onChange={(e) => update({ musicVolume: Number(e.target.value) / 100, musicEnabled: true })}
              className="w-full"
              aria-label="Song volume"
            />
            <p className="mt-1.5 text-xs text-faint">
              {editor.musicName ? `${Math.round(editor.musicVolume * 100)}%` : "Add a track to mix it in"}
            </p>
          </div>
        </div>
      </div>

      {showKeys && (
        <Modal title="Keyboard shortcuts" onClose={() => setShowKeys(false)}>
          <ul className="divide-y divide-white/[0.06]">
            {SHORTCUTS.map(([key, label]) => (
              <li key={key} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-ink/90">{label}</span>
                <span className="kbd min-w-12 px-2 text-[11px]">{key}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

function Handle({
  at,
  label,
  onPointerDown,
  inner = false,
}: {
  at: number;
  label: string;
  onPointerDown: (event: React.PointerEvent) => void;
  inner?: boolean;
}) {
  return (
    <span
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(at)}
      onPointerDown={onPointerDown}
      className={`absolute z-30 flex w-4 -translate-x-1/2 cursor-ew-resize items-center justify-center ${inner ? "-bottom-1 -top-1" : "bottom-2 top-4"}`}
      style={{ left: `${at}%` }}
    >
      <span className="h-full w-2 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,107,61,0.55),0_2px_8px_rgba(0,0,0,0.6)] transition-transform hover:scale-x-150" />
    </span>
  );
}

function TimeField({
  label,
  shortcut,
  value,
  min = 0,
  max,
  onChange,
  onUsePlayhead,
}: {
  label: string;
  shortcut: string;
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  onUsePlayhead: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3">
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={0.1}
          value={roundTime(value)}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0, min, max))}
          className="field py-2 tabular-nums"
          aria-label={label}
        />
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-faint">{formatTime(value)}</span>
        <button type="button" onClick={onUsePlayhead} className="btn-ghost shrink-0 px-2 py-1.5 text-xs text-brand hover:text-brand-hover">
          Playhead <span className="kbd">{shortcut}</span>
        </button>
      </div>
    </div>
  );
}
