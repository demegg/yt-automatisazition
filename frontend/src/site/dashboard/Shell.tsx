import {
  Bell,
  BellOff,
  Clapperboard,
  Command,
  Download,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import Logo from "../../components/Logo";
import { timeAgo, useClickOutside } from "../ui";
import CommandPalette from "./CommandPalette";
import { JobsProvider, greetingName, isActive, useJobs } from "./data";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/projects", label: "Projects", icon: FolderOpen, end: false },
  { to: "/app/queue", label: "Processing queue", icon: Clapperboard, end: false },
  { to: "/app/exports", label: "Exports", icon: Download, end: false },
];

const ACCOUNT = [
  { to: "/app/usage", label: "Usage and plan", icon: Gauge },
  { to: "/app/settings", label: "Settings", icon: Settings },
  { to: "/app/account", label: "Account", icon: User },
];

function titleFor(path: string) {
  if (path === "/app") return "Overview";
  if (path.startsWith("/app/new")) return "New project";
  if (path.startsWith("/app/projects/")) return "Project";
  if (path.startsWith("/app/projects")) return "Projects";
  if (path.startsWith("/app/queue")) return "Processing queue";
  if (path.startsWith("/app/exports")) return "Exports";
  if (path.startsWith("/app/usage")) return "Usage and plan";
  if (path.startsWith("/app/settings")) return "Settings";
  if (path.startsWith("/app/account")) return "Account";
  return "Workspace";
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function NavItem({
  to,
  label,
  icon: Icon,
  end,
  collapsed,
  badge,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: typeof Plus;
  end?: boolean;
  collapsed: boolean;
  badge?: number;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-gradient-to-r from-brand/[0.16] to-transparent text-ink"
            : "text-muted hover:bg-white/[0.05] hover:text-ink"
        } ${collapsed ? "md:justify-center" : ""}`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-gradient transition-all duration-300 ${
              isActive ? "opacity-100" : "scale-y-0 opacity-0"
            }`}
          />
          <Icon
            className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? "text-brand" : "group-hover:text-ink"}`}
            aria-hidden="true"
          />
          <span className={`flex-1 truncate ${collapsed ? "md:sr-only" : ""}`}>{label}</span>
          {badge ? (
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/20 px-1.5 text-[10px] font-bold text-brand ${
                collapsed ? "md:absolute md:right-1 md:top-1 md:h-4 md:min-w-4 md:px-1" : ""
              }`}
            >
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function ShellFrame() {
  const { user, logout } = useAuth();
  const { jobs, notices, markRead } = useJobs();
  const navigate = useNavigate();
  const location = useLocation();
  const notesRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sf-sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const guest = !user || user.guest || user.email === "guest@local";
  const name = greetingName(user?.email, guest);
  const unread = notices.filter((notice) => !notice.read);
  const running = (jobs ?? []).filter(isActive).length;

  useClickOutside(notesRef, () => setNotesOpen(false), notesOpen);
  useClickOutside(accountRef, () => setAccountOpen(false), accountOpen);

  useEffect(() => {
    try {
      localStorage.setItem("sf-sidebar", collapsed ? "collapsed" : "open");
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  useEffect(() => {
    setOpen(false);
    setNotesOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") {
        setNotesOpen(false);
        setAccountOpen(false);
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signOut = async () => {
    await logout().catch(() => undefined);
    navigate("/");
  };

  const sidebarWidth = collapsed ? "md:w-[72px]" : "md:w-64";

  return (
    <div className="app-ambient min-h-screen text-ink">
      <a className="skip-link" href="#main">Skip to content</a>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <div className="flex min-h-screen">
        <aside
          id="app-nav"
          className={`${open ? "flex animate-slide-in-left" : "hidden"} fixed inset-y-0 left-0 z-50 w-72 flex-col border-r border-white/[0.06] bg-sidebar/95 backdrop-blur-xl md:sticky md:top-0 md:z-auto md:flex md:h-screen md:bg-sidebar/60 md:transition-[width] md:duration-300 ${sidebarWidth}`}
        >
          <div className={`flex items-center justify-between gap-2 px-4 py-4 ${collapsed ? "md:justify-center md:px-2" : ""}`}>
            <Link to="/app" className="group flex min-w-0 items-center gap-2.5 text-ink">
              <Logo size={30} className="transition-transform duration-500 group-hover:rotate-[-8deg]" />
              <span className={`truncate font-display text-[15px] font-semibold ${collapsed ? "md:hidden" : ""}`}>ShortForge</span>
            </Link>
            <button type="button" className="icon-btn md:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className={`px-3 pb-3 ${collapsed ? "md:px-2" : ""}`}>
            <Link
              to="/app/new"
              title={collapsed ? "Create new project" : undefined}
              className={`btn-primary w-full ${collapsed ? "md:h-11 md:w-11 md:rounded-2xl md:p-0" : ""}`}
            >
              <Plus className="h-4 w-4" />
              <span className={collapsed ? "md:sr-only" : ""}>New project</span>
            </Link>
          </div>

          <nav className={`flex-1 space-y-6 overflow-y-auto px-3 py-2 ${collapsed ? "md:px-2" : ""}`} aria-label="Workspace">
            <div className="space-y-0.5">
              <p className={`px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint ${collapsed ? "md:sr-only" : ""}`}>Workspace</p>
              {NAV.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  collapsed={collapsed}
                  badge={item.to === "/app/queue" ? running : undefined}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
            <div className="space-y-0.5">
              <p className={`px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint ${collapsed ? "md:sr-only" : ""}`}>Account</p>
              {ACCOUNT.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} onNavigate={() => setOpen(false)} />
              ))}
              <Link
                to="/how-it-works"
                title={collapsed ? "Help and support" : undefined}
                className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-muted transition hover:bg-white/[0.05] hover:text-ink ${collapsed ? "md:justify-center" : ""}`}
              >
                <LifeBuoy className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className={collapsed ? "md:sr-only" : ""}>Help and support</span>
              </Link>
            </div>
          </nav>

          <div className="border-t border-white/[0.06] p-3">
            <div className={`flex items-center gap-3 rounded-2xl bg-white/[0.03] p-2.5 ${collapsed ? "md:hidden" : ""}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">
                {guest ? "G" : (name || user?.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{guest ? "Guest workspace" : name || user?.email}</p>
                <p className="text-xs text-muted">
                  {jobs ? `${jobs.length} project${jobs.length === 1 ? "" : "s"}` : "Loading…"} · no usage cap
                </p>
              </div>
            </div>
            <button
              type="button"
              className={`mt-2 hidden w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs text-muted transition hover:bg-white/[0.05] hover:text-ink md:flex ${collapsed ? "justify-center" : ""}`}
              onClick={() => setCollapsed((value) => !value)}
              aria-pressed={collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              {!collapsed && <span>Collapse sidebar</span>}
            </button>
          </div>
        </aside>
        {open && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in md:hidden"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-white/[0.06] bg-canvas/70 px-3 backdrop-blur-xl md:px-6">
            <button
              type="button"
              className="icon-btn border border-white/10 md:hidden"
              aria-expanded={open}
              aria-controls="app-nav"
              onClick={() => setOpen(true)}
            >
              <Menu className="h-4 w-4" />
              <span className="sr-only">Menu</span>
            </button>
            <p key={location.pathname} className="hidden font-display text-[15px] font-semibold animate-fade-in md:block">
              {titleFor(location.pathname)}
            </p>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-3.5 py-2 text-left text-sm text-faint transition hover:border-white/20 hover:bg-white/[0.05] md:ml-6 md:max-w-sm"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">Search or jump to…</span>
              <span className="hidden items-center gap-1 sm:flex">
                <span className="kbd">{isMac ? <Command className="h-3 w-3" /> : "Ctrl"}</span>
                <span className="kbd">K</span>
              </span>
            </button>
            <div className="ml-auto flex items-center gap-1">
              <div className="relative" ref={notesRef}>
                <button
                  type="button"
                  className="icon-btn relative"
                  aria-expanded={notesOpen}
                  aria-label={unread.length ? `${unread.length} unread notifications` : "Notifications"}
                  onClick={() => {
                    setNotesOpen((value) => !value);
                    setAccountOpen(false);
                  }}
                >
                  <Bell className={`h-[18px] w-[18px] ${unread.length ? "animate-[wiggle_1s_ease-in-out]" : ""}`} />
                  {unread.length > 0 && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white ring-2 ring-canvas">
                      {unread.length > 9 ? "9+" : unread.length}
                    </span>
                  )}
                </button>
                {notesOpen && (
                  <div className="menu-panel absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))]">
                    <div className="flex items-center justify-between px-2.5 pb-2 pt-1.5">
                      <p className="text-sm font-semibold">Notifications</p>
                      {unread.length > 0 && (
                        <button type="button" className="text-xs font-medium text-brand hover:text-brand-hover" onClick={() => void markRead(unread.map((item) => item.key))}>
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notices.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                        <BellOff className="h-6 w-6 text-faint" />
                        <p className="text-sm text-muted">Finished, failed, and cancelled jobs show up here.</p>
                      </div>
                    ) : (
                      <ul className="max-h-96 overflow-auto">
                        {notices.map((notice) => (
                          <li key={notice.key}>
                            <Link
                              to={`/app/projects/${notice.job_id}`}
                              className="flex gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-white/[0.06]"
                              onClick={() => {
                                setNotesOpen(false);
                                if (!notice.read) void markRead([notice.key]);
                              }}
                            >
                              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notice.read ? "bg-transparent" : "bg-brand"}`} />
                              <span className="min-w-0">
                                <span className={`block text-sm ${notice.read ? "text-muted" : "font-medium text-ink"}`}>{notice.title}</span>
                                <span className="block text-xs text-muted">{notice.body}</span>
                                <span className="mt-1 block text-[11px] text-faint">{timeAgo(notice.created_at)}</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              {location.pathname !== "/app/new" && (
                <Link to="/app/new" className="btn-primary ml-1 hidden px-4 py-2 sm:inline-flex">
                  <Plus className="h-4 w-4" />
                  Create
                </Link>
              )}
              <div className="relative ml-1" ref={accountRef}>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white ring-2 ring-white/10 transition hover:ring-white/30"
                  aria-expanded={accountOpen}
                  aria-label="Account menu"
                  onClick={() => {
                    setAccountOpen((value) => !value);
                    setNotesOpen(false);
                  }}
                >
                  {guest ? "G" : (name || user?.email || "?").slice(0, 1).toUpperCase()}
                </button>
                {accountOpen && (
                  <div className="menu-panel absolute right-0 mt-2 w-60">
                    <div className="px-2.5 py-2">
                      <p className="truncate text-sm font-medium">{guest ? "Guest workspace" : name || "Signed in"}</p>
                      <p className="truncate text-xs text-muted">{user?.email}</p>
                    </div>
                    <div className="my-1 h-px bg-white/[0.07]" />
                    <Link to="/app/account" className="menu-item">
                      <User className="h-4 w-4 text-muted" /> Account
                    </Link>
                    <Link to="/app/settings" className="menu-item">
                      <Settings className="h-4 w-4 text-muted" /> Settings
                    </Link>
                    <button type="button" className="menu-item" onClick={() => { setAccountOpen(false); setPaletteOpen(true); }}>
                      <Search className="h-4 w-4 text-muted" /> Command palette
                      <span className="kbd ml-auto">{isMac ? "⌘" : "Ctrl"} K</span>
                    </button>
                    {guest ? (
                      <Link to="/register" className="menu-item text-brand">
                        <User className="h-4 w-4" /> Create an account
                      </Link>
                    ) : (
                      <>
                        <div className="my-1 h-px bg-white/[0.07]" />
                        <button type="button" className="menu-item text-danger hover:text-danger" onClick={() => void signOut()}>
                          <LogOut className="h-4 w-4" /> Log out
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>
          {guest && (
            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-white/[0.06] bg-brand-gradient-soft px-4 py-2 text-center text-xs text-ink/80">
              <span>You’re in a local guest workspace.</span>
              <Link className="font-semibold text-ink underline decoration-brand/60 underline-offset-4 hover:decoration-brand" to="/register">
                Create an account
              </Link>
              <span>before a public deployment.</span>
            </div>
          )}
          <main id="main" key={location.pathname} className="min-w-0 flex-1 px-4 py-8 animate-fade-up md:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <JobsProvider>
      <ShellFrame />
    </JobsProvider>
  );
}
