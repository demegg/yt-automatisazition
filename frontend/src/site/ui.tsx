import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/* ---------- Hooks ---------- */

/** Closes a popover when the user clicks or taps outside of `ref`. */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled = true
) {
  const handler = useRef(onOutside);
  handler.current = onOutside;
  useEffect(() => {
    if (!enabled) return;
    const onDown = (event: PointerEvent) => {
      const el = ref.current;
      if (el && !el.contains(event.target as Node)) handler.current();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref, enabled]);
}

/** Adds `is-visible` to `.reveal` elements under the returned ref once they scroll into view. */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = root.matches(".reveal")
      ? [root]
      : Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return ref;
}

/** Animates a number from 0 to `value` once it is set. */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(initial + (value - initial) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{shown}</>;
}

/* ---------- Toasts ---------- */

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; title: string; body?: string };

type ToastApi = {
  toast: (title: string, opts?: { tone?: ToastTone; body?: string }) => void;
};

const ToastContext = createContext<ToastApi>({ toast: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback<ToastApi["toast"]>(
    (title, opts) => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-3), { id, title, tone: opts?.tone ?? "success", body: opts?.body }]);
      window.setTimeout(() => dismiss(id), opts?.tone === "error" ? 7000 : 4200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {items.map((item) => {
          const Icon = item.tone === "error" ? AlertTriangle : item.tone === "info" ? Info : CheckCircle2;
          const tone =
            item.tone === "error" ? "text-danger" : item.tone === "info" ? "text-accent" : "text-ok";
          return (
            <div
              key={item.id}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/10 bg-[#0f1118]/95 p-3.5 shadow-lift backdrop-blur-xl animate-slide-in-right"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{item.title}</p>
                {item.body && <p className="mt-0.5 break-words text-xs text-muted">{item.body}</p>}
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-faint transition hover:bg-white/10 hover:text-ink"
                aria-label="Dismiss"
                onClick={() => dismiss(item.id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext).toast;
}

/* ---------- Components ---------- */

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    const focusable = panel.current?.querySelector<HTMLElement>("input, button:not([data-close]), [href]");
    focusable?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        data-close
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`relative w-full ${wide ? "max-w-xl" : "max-w-md"} rounded-3xl border border-white/10 bg-[#0f1118] p-6 shadow-lift animate-scale-in`}
      >
        <button
          type="button"
          data-close
          className="icon-btn absolute right-3 top-3 h-8 w-8"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        <h2 id="dialog-title" className="pr-8 font-display text-lg font-semibold tracking-tight text-ink">
          {title}
        </h2>
        <div className="mt-3 text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.015] px-6 py-16 text-center animate-fade-up">
      <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-brand/10 blur-3xl" />
      {icon && (
        <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-brand">
          {icon}
        </div>
      )}
      <h2 className="relative font-display text-2xl font-semibold text-white">{title}</h2>
      <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {action ? <div className="relative mt-6">{action}</div> : null}
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = {
  completed: "text-ok bg-ok/10 ring-ok/25",
  failed: "text-danger bg-danger/10 ring-danger/25",
  cancelled: "text-warn bg-warn/10 ring-warn/25",
  processing: "text-brand bg-brand/10 ring-brand/30",
  queued: "text-accent bg-accent/10 ring-accent/25",
  importing: "text-accent bg-accent/10 ring-accent/25",
  uploaded: "text-ink bg-white/[0.06] ring-white/15",
};

const STATUS_LABEL: Record<string, string> = {
  uploaded: "ready to edit",
  pending: "draft",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_CLASS[status] || "text-muted bg-white/[0.04] ring-white/10";
  const live = status === "processing" || status === "queued" || status === "importing";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${tone}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {STATUS_LABEL[status] || status || "saved"}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

/** "3 min ago", "2 days ago", falling back to a date. */
export function timeAgo(value?: string | null): string {
  if (!value) return "—";
  const normalized = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}
