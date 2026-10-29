import {
  ArrowRight,
  Clapperboard,
  CornerDownLeft,
  Download,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { StatusBadge } from "../ui";
import { useJobs } from "./data";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Plus;
  to: string;
  status?: string;
};

const PAGES: Command[] = [
  { id: "new", label: "Create new project", hint: "Upload a video", icon: Plus, to: "/app/new" },
  { id: "overview", label: "Overview", icon: LayoutDashboard, to: "/app" },
  { id: "projects", label: "Projects", icon: FolderOpen, to: "/app/projects" },
  { id: "queue", label: "Processing queue", icon: Clapperboard, to: "/app/queue" },
  { id: "exports", label: "Exports", icon: Download, to: "/app/exports" },
  { id: "usage", label: "Usage and plan", icon: Gauge, to: "/app/usage" },
  { id: "settings", label: "Settings", icon: Settings, to: "/app/settings" },
  { id: "account", label: "Account", icon: User, to: "/app/account" },
];

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { jobs } = useJobs();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    window.setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = PAGES.filter((cmd) => !q || cmd.label.toLowerCase().includes(q));
    const projects: Command[] = (jobs ?? [])
      .filter((job) => !q || (job.batch_name || "untitled").toLowerCase().includes(q))
      .slice(0, q ? 8 : 4)
      .map((job) => ({
        id: job.job_id,
        label: job.batch_name || "Untitled",
        icon: FolderOpen,
        to: `/app/projects/${job.job_id}`,
        status: job.status,
      }));
    return [
      ...(projects.length ? [{ group: q ? "Projects" : "Recent projects", items: projects }] : []),
      ...(pages.length ? [{ group: "Go to", items: pages }] : []),
    ];
  }, [jobs, query]);

  const flat = results.flatMap((group) => group.items);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const run = (cmd?: Command) => {
    if (!cmd) return;
    onClose();
    navigate(cmd.to);
  };

  let running = -1;

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center p-4 pt-[12vh]">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#0e1017]/95 shadow-lift backdrop-blur-xl animate-scale-in"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          else if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((value) => Math.min(flat.length - 1, value + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((value) => Math.max(0, value - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            run(flat[index]);
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search className="h-4 w-4 text-faint" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects or jump to a page…"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint focus-visible:outline-none"
            aria-label="Search commands"
          />
          <span className="kbd">Esc</span>
        </div>
        <ul ref={list} className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{query}”.</li>}
          {results.map((group) => (
            <li key={group.group}>
              <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{group.group}</p>
              <ul>
                {group.items.map((cmd) => {
                  running += 1;
                  const i = running;
                  const Icon = cmd.icon;
                  const active = i === index;
                  return (
                    <li key={cmd.id}>
                      <button
                        type="button"
                        data-index={i}
                        onMouseMove={() => setIndex(i)}
                        onClick={() => run(cmd)}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition ${
                          active ? "bg-white/[0.08] text-ink" : "text-ink/80"
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                            active ? "border-brand/40 bg-brand/15 text-brand" : "border-white/10 bg-white/[0.03] text-muted"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                        {cmd.status && <StatusBadge status={cmd.status} />}
                        {cmd.hint && <span className="text-xs text-faint">{cmd.hint}</span>}
                        {active ? <CornerDownLeft className="h-3.5 w-3.5 text-faint" /> : <ArrowRight className="h-3.5 w-3.5 text-transparent" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2.5 text-[11px] text-faint">
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="flex items-center gap-1.5"><span className="kbd">Enter</span> open</span>
        </div>
      </div>
    </div>
  );
}
