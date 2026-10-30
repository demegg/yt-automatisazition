import {
  ArrowRight,
  Captions,
  Clapperboard,
  Download,
  Film,
  Layers,
  LayoutTemplate,
  Menu,
  MonitorPlay,
  Plus,
  Scissors,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import Logo from "../components/Logo";
import { useAuth } from "../auth";
import FilmFrame from "./hero/FilmFrame";
import HeroStage from "./hero/HeroStage";
import { contactEmail, usePageMeta } from "./meta";
import { useReveal } from "./ui";

const NAV = [
  { to: "/#product", label: "Product" },
  { to: "/features#capabilities", label: "Features" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
];

function isRealUser(email?: string, guest?: boolean) {
  return Boolean(email) && email !== "guest@local" && !guest;
}

export function SiteHeader() {
  const { user } = useAuth();
  const location = useLocation();
  const signedIn = isRealUser(user?.email, user?.guest);
  const start = signedIn ? "/app/new" : "/register";
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const navActive = (to: string) => {
    const [path, hash] = to.split("#");
    if (path === "/") return location.pathname === "/" && location.hash === `#${hash}`;
    return location.pathname === path;
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
      <div
        className={`mx-auto flex max-w-content items-center justify-between gap-4 rounded-full border px-3 py-2 transition-all duration-500 ${
          scrolled
            ? "border-white/10 bg-[#0b0c12]/80 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <Link to="/" className="group flex items-center gap-2.5 pl-1 text-ink">
          <Logo size={26} className="transition-transform duration-500 group-hover:rotate-[-8deg] group-hover:scale-110" />
          <span className="font-display text-[17px] font-semibold leading-none tracking-tight">ShortForge</span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={() =>
                `rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                  navActive(item.to) ? "bg-white/[0.08] text-ink" : "text-muted hover:bg-white/[0.05] hover:text-ink"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <Link to="/app" className="btn-ghost">
              Open workspace
            </Link>
          ) : (
            <Link to="/sign-in" className="btn-ghost">
              Sign in
            </Link>
          )}
          <Link to={start} className="btn-primary px-4 py-2">
            Start creating
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <button
          type="button"
          className="icon-btn border border-white/10 md:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {menuOpen && (
        <div
          id="mobile-nav"
          className="mx-auto mt-2 max-w-content rounded-3xl border border-white/10 bg-[#0b0c12]/95 p-2 shadow-lift backdrop-blur-xl animate-scale-in md:hidden"
        >
          {NAV.map((item, index) => (
            <Link
              key={item.label}
              to={item.to}
              style={{ animationDelay: `${index * 40}ms` }}
              className="block rounded-2xl px-4 py-3 text-sm text-muted transition animate-fade-up hover:bg-white/5 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-1 grid grid-cols-2 gap-2 p-2">
            <Link to={signedIn ? "/app" : "/sign-in"} className="btn-secondary">
              {signedIn ? "Workspace" : "Sign in"}
            </Link>
            <Link to={start} className="btn-primary">
              Start creating
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  const email = contactEmail();
  const columns: [string, [string, string][]][] = [
    ["Product", [["Features", "/features"], ["How it works", "/how-it-works"], ["Pricing", "/pricing"]]],
    ["Account", [["Sign in", "/sign-in"], ["Create account", "/register"], ["Workspace", "/app"]]],
    ["Legal", [["Privacy", "/privacy"], ["Terms", "/terms"]]],
  ];
  return (
    <footer className="relative border-t border-white/[0.06]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="font-display text-base font-semibold">ShortForge</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Long videos. More moments. Less editing.
          </p>
          {email ? (
            <a className="mt-4 inline-block text-sm text-brand transition hover:text-brand-hover" href={`mailto:${email}`}>
              {email}
            </a>
          ) : null}
        </div>
        {columns.map(([heading, links]) => (
          <div key={heading}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-faint">{heading}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              {links.map(([label, to]) => (
                <li key={to}>
                  <Link className="text-muted transition hover:text-ink" to={to}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.05]">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-faint">
          <p>© {new Date().getFullYear()} ShortForge. Self-hosted video-to-shorts.</p>
          <p>1080×1920 · H.264 · AAC · 30 fps</p>
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout() {
  const location = useLocation();
  return (
    <div className="marketing-root min-h-screen overflow-x-clip text-ink">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" key={location.pathname} className="pt-20 animate-fade-in">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

function StudioPlate() {
  return (
    <div className="studio-plate reveal" aria-hidden="true">
      <div className="studio-span flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-2">Edit</span>
        </span>
        <span>1080 × 1920 · H.264</span>
      </div>
      <div className="studio-side border-r border-white/10 p-4 text-xs text-muted">
        <p className="text-[10px] uppercase tracking-[0.16em] text-faint">Source</p>
        <p className="mt-4 text-ink">Primary</p>
        <p className="mt-3">Part 1</p>
        <p className="mt-2 rounded-md bg-brand/15 px-1.5 py-0.5 text-brand">Part 2</p>
        <p className="mt-2">Part 3</p>
      </div>
      <div className="flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(255,107,61,0.12),transparent_60%)] py-6">
        <FilmFrame
          className="w-[46%] max-w-[190px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]"
          time="01:12"
          caption="City lights"
          detail="0:12–1:12"
          crop="city"
        />
      </div>
      <div className="studio-side border-l border-white/10 p-4 text-xs text-muted">
        <p className="text-[10px] uppercase tracking-[0.16em] text-faint">Cut</p>
        <p className="mt-3 text-ink">0:12 – 1:12</p>
        <p className="mt-4 text-[10px] uppercase tracking-[0.16em] text-faint">Output</p>
        <p className="mt-3 text-ink">9:16</p>
        <p className="mt-1">Captions on</p>
      </div>
      <div className="studio-span border-t border-white/10 px-4 py-4">
        <div className="relative h-11 overflow-hidden rounded-lg bg-white/[0.04]">
          <div className="absolute bottom-1.5 left-[8%] top-1.5 w-[20%] rounded-md bg-white/15" />
          <div className="absolute bottom-1.5 left-[30%] top-1.5 w-[16%] rounded-md bg-gradient-to-r from-ember-400 to-[#ff4d7e] shadow-glow" />
          <div className="absolute bottom-1.5 left-[48%] top-1.5 w-[18%] rounded-md bg-white/20" />
          <div className="studio-playhead absolute bottom-0 top-0 w-0.5 rounded-full bg-white shadow-[0_0_12px_white]" />
        </div>
      </div>
    </div>
  );
}

const FEATURES: { title: string; body: string; icon: typeof Film; span?: string }[] = [
  {
    title: "Long-video importing",
    body: "Upload a primary video and an optional second video for split, reaction, and picture-in-picture layouts.",
    icon: Upload,
    span: "lg:col-span-2",
  },
  {
    title: "Clip selection and trimming",
    body: "Trim a range or mark custom parts. Auto mode slices that range into equal shorts.",
    icon: Scissors,
  },
  {
    title: "Vertical 9:16 output",
    body: "Every export is 1080×1920 MP4, H.264 video, AAC audio, 30 fps.",
    icon: MonitorPlay,
  },
  {
    title: "Subtitle generation",
    body: "Optional. faster-whisper transcribes speech on the server and burns captions into each short.",
    icon: Captions,
  },
  {
    title: "Second-video layouts",
    body: "Top/bottom, main plus reaction, picture-in-picture, and side by side.",
    icon: LayoutTemplate,
  },
  {
    title: "Batch processing",
    body: "One job can produce many numbered parts. A max-shorts limit lets you test a few first.",
    icon: Layers,
  },
  {
    title: "Export management",
    body: "Preview, download one file, or download a zip. Optional YouTube and TikTok scheduling when configured.",
    icon: Download,
  },
];

const PLATFORMS = ["YouTube Shorts", "TikTok", "Instagram Reels", "Facebook Reels", "Snapchat Spotlight", "Pinterest Idea Pins"];

const FAQ = [
  ["Which files can I upload?", "MP4, MOV, MKV, WebM, AVI, and M4V, up to the server’s MAX_UPLOAD_MB setting (2048 MB unless the operator changes it)."],
  ["Will every YouTube or TikTok link work?", "No. Links are attempted with yt-dlp. Platforms often block downloads. Upload the file when a link fails."],
  ["Where do videos go?", "Onto the server’s disk, in the uploads and output folders. Deleting a project removes those files. They are not kept inside ordinary database rows."],
  ["Do you train models on my videos?", "This application does not send your videos to a ShortForge training service. Captions run with faster-whisper on the server you deploy."],
  ["Is there a paid plan?", "Not in the product. Billing is not implemented, so nothing in the interface charges a card."],
  ["Can I reset a forgotten password by email?", "No. Email delivery for password reset is not built. Signed-in users can change a password from Account."],
];

export function HomePage() {
  const { user } = useAuth();
  const signedIn = isRealUser(user?.email, user?.guest);
  const start = signedIn ? "/app/new" : "/register";
  const page = useReveal<HTMLDivElement>();
  usePageMeta({
    title: "ShortForge — Long videos. More moments. Less editing.",
    description:
      "ShortForge turns long videos into vertical 9:16 shorts. Import, trim, caption, and export with FFmpeg on your server.",
    path: "/",
  });

  return (
    <div ref={page}>
      <JsonLd />
      <section className="relative -mt-20 overflow-hidden pt-20">
        <div className="ambient" />
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-6 px-4 pb-10 pt-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)] lg:pt-16">
          <div className="relative z-10 max-w-xl pb-6">
            <span className="eyebrow animate-fade-up">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              Now with burned-in captions
            </span>
            <h1
              className="mt-6 font-display text-[clamp(2.7rem,5.6vw,4.8rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-white animate-fade-up"
              style={{ animationDelay: "80ms" }}
            >
              One long video.
              <span className="mt-1 block text-gradient">Infinite moments.</span>
            </h1>
            <p
              className="mt-6 max-w-md text-[17px] leading-relaxed text-muted animate-fade-up"
              style={{ animationDelay: "160ms" }}
            >
              ShortForge turns one recording into vertical shorts for YouTube, TikTok, and Reels. You pick the moments. The server renders them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "240ms" }}>
              <Link to={start} className="btn-primary px-6 py-3 text-[15px]">
                Start creating
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#workflow" className="btn-secondary px-6 py-3 text-[15px]">
                See how it works
              </a>
            </div>
            <ul
              className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-faint animate-fade-up"
              style={{ animationDelay: "320ms" }}
            >
              {["1080×1920 MP4", "No watermark", "Runs on your server"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-brand" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
            <HeroStage />
          </div>
        </div>
      </section>

      <section aria-label="Made for vertical platforms" className="relative border-y border-white/[0.06] bg-white/[0.015] py-5">
        <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="flex w-max animate-marquee gap-12 pr-12">
            {[...PLATFORMS, ...PLATFORMS].map((name, index) => (
              <span key={`${name}-${index}`} className="flex items-center gap-3 whitespace-nowrap font-display text-sm font-medium text-white/40">
                <Clapperboard className="h-4 w-4" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="scroll-mt-24">
        <div className="mx-auto max-w-[1200px] px-4 py-24">
          <p className="section-kicker reveal">How a long video becomes shorts</p>
          <h2 className="reveal mt-4 max-w-xl text-3xl font-semibold leading-tight text-white sm:text-5xl">
            A long take, <span className="text-gradient">pulled apart.</span>
          </h2>
          <p className="reveal mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
            The source stays intact. A trim or the parts you mark become separate 1080×1920 files.
          </p>
          <div className="transform-row mt-14">
            <div className="reveal">
              <p className="text-sm text-muted">Source</p>
              <div className="mt-3 h-16 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                <div className="flex h-full gap-0.5 p-1">
                  <div className="h-full w-[24%] rounded-md bg-gradient-to-r from-ember-400/70 to-ember-500/70" />
                  <div className="h-full w-[18%] rounded-md bg-white/10" />
                  <div className="h-full w-[22%] rounded-md bg-gradient-to-r from-[#ff4d7e]/70 to-violet-500/70" />
                  <div className="h-full flex-1 rounded-md bg-white/5" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">One timeline. Equal parts, or the ranges you set.</p>
            </div>
            {[
              ["Part 1", "0:00–1:00", "The drive", "drive"],
              ["Part 2", "1:00–2:00", "City lights", "city"],
              ["Part 3", "2:00–3:00", "Arrival", "arrival"],
            ].map(([label, time, caption, crop], index) => (
              <figure key={label} className="reveal group" style={{ ["--reveal-delay" as string]: `${120 * (index + 1)}ms` }}>
                <div className="transition duration-500 group-hover:-translate-y-2 group-hover:rotate-[-1.5deg]">
                  <FilmFrame
                    time={time.slice(0, 4)}
                    caption={caption}
                    detail={`${time} · 1080×1920`}
                    crop={crop as "drive" | "city" | "arrival"}
                  />
                </div>
                <figcaption className="mt-3">
                  <p className="text-sm font-medium text-ink">{label}</p>
                  <p className="text-xs text-muted">{time} · 1080×1920</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="relative border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1200px] px-4 py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="section-kicker reveal">What the server does</p>
              <h2 className="reveal mt-4 text-3xl font-semibold text-white sm:text-5xl">Everything that ships.</h2>
            </div>
            <Link to="/features" className="reveal group inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover">
              Full feature list
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ title, body, icon: Icon, span }, index) => (
              <article
                key={title}
                className={`reveal card card-hover group relative overflow-hidden p-6 ${span || ""}`}
                style={{ ["--reveal-delay" as string]: `${index * 60}ms` }}
              >
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand/10 opacity-0 blur-2xl transition duration-500 group-hover:opacity-100" />
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-brand-gradient-soft text-brand transition duration-500 group-hover:scale-110 group-hover:rotate-[-6deg]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06]">
        <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-4 py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <p className="section-kicker reveal">The editor</p>
            <h2 className="reveal mt-4 text-3xl font-semibold leading-tight text-white sm:text-5xl">
              Preview, trim, <span className="text-gradient">then render.</span>
            </h2>
            <p className="reveal mt-5 text-[15px] leading-relaxed text-muted">
              Source, a vertical preview, a draggable timeline, and the cut settings side by side. Split at the playhead with one key.
            </p>
            <ul className="reveal mt-6 space-y-2.5 text-sm text-muted">
              {[
                ["Space", "Play or pause"],
                ["S", "Split at the playhead"],
                ["I / O", "Set in and out points"],
              ].map(([key, label]) => (
                <li key={key} className="flex items-center gap-3">
                  <span className="kbd min-w-10">{key}</span>
                  {label}
                </li>
              ))}
            </ul>
            <Link to={start} className="reveal btn-secondary mt-8">
              Open a project
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <StudioPlate />
        </div>
      </section>

      <section id="workflow" className="scroll-mt-24 border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1200px] px-4 py-24">
          <p className="section-kicker reveal">The steps</p>
          <h2 className="reveal mt-4 text-3xl font-semibold text-white sm:text-5xl">Import. Cut. Export.</h2>
          <ol className="relative mt-14 grid gap-4 md:grid-cols-3">
            <li aria-hidden="true" className="pointer-events-none absolute left-[16%] right-[16%] top-[48px] hidden h-px bg-gradient-to-r from-ember-400/0 via-ember-400/50 to-violet-500/0 md:block" />
            {[
              ["01", "Import", "Name the batch. Add the primary file, and optionally a second video or a link the server can retrieve.", Upload],
              ["02", "Edit", "Preview, trim, or mark parts. Choose a layout and whether captions should be burned in.", Scissors],
              ["03", "Export", "FFmpeg writes the vertical files. Download them, or schedule posts when those accounts are connected.", Download],
            ].map(([n, title, body, Icon], index) => {
              const StepIcon = Icon as typeof Upload;
              return (
                <li
                  key={n as string}
                  className="reveal card card-hover relative p-6"
                  style={{ ["--reveal-delay" as string]: `${index * 120}ms` }}
                >
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
                    <StepIcon className="h-5 w-5" />
                  </div>
                  <p className="mt-6 text-xs font-semibold tabular-nums text-faint">STEP {n as string}</p>
                  <h3 className="mt-1 text-xl font-semibold text-ink">{title as string}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{body as string}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-[1200px] px-4 py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className="section-kicker reveal">Under the hood</p>
              <h2 className="reveal mt-4 text-3xl font-semibold text-white sm:text-4xl">Processing, plainly.</h2>
              <p className="reveal mt-4 text-[15px] leading-relaxed text-muted">
                Rendering happens on the machine running the ShortForge server. A browser does not execute FFmpeg. There is no claim here about a fixed render speed.
              </p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Video engine", "FFmpeg, libx264, AAC, 30 fps, CRF 23, preset veryfast"],
                ["Frame", "1080×1920, 9:16, MP4"],
                ["Captions", "faster-whisper, optional, burned into the picture"],
                ["Link import", "yt-dlp. Many platform URLs are blocked by the provider."],
                ["Files", "Stored on server disk. Metadata is in SQLite."],
                ["Accounts", "Email and password on this server."],
              ].map(([k, v], index) => (
                <div
                  key={k}
                  className="reveal card p-4"
                  style={{ ["--reveal-delay" as string]: `${index * 50}ms` }}
                >
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">{k}</dt>
                  <dd className="mt-1.5 text-sm text-ink/90">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="reveal gradient-border relative mx-auto max-w-[1100px] overflow-hidden rounded-[32px] bg-[#0c0d14] px-6 py-20 text-center">
          <div className="ambient opacity-80" />
          <div className="relative">
            <p className="section-kicker justify-center">Early access</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold text-white sm:text-5xl">
              Make the next cut <span className="text-gradient">tonight.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-muted">
              No checkout and no subscription screen. If you run the server, every tool is available.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link to={start} className="btn-primary px-6 py-3 text-[15px]">
                <Plus className="h-4 w-4" />
                Start a project
              </Link>
              <Link to="/how-it-works" className="btn-secondary px-6 py-3 text-[15px]">
                Read the workflow
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06]">
        <div className="mx-auto grid max-w-content gap-10 px-4 py-24 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div>
            <p className="section-kicker reveal">FAQ</p>
            <h2 className="reveal mt-4 text-3xl font-semibold text-white">Questions, answered.</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map(([q, a], index) => (
              <details
                key={q}
                className="faq-item reveal card group px-5 py-4 open:border-white/15 open:bg-white/[0.04]"
                style={{ ["--reveal-delay" as string]: `${index * 50}ms` }}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink">
                  {q}
                  <Plus className="faq-chevron h-4 w-4 shrink-0 text-muted transition-transform duration-300" />
                </summary>
                <p className="faq-body mt-3 max-w-3xl text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function JsonLd() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ShortForge",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    description:
      "Turns long videos into vertical 9:16 shorts with FFmpeg on the operator’s server.",
    url: origin || undefined,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "No in-app billing. Early access on a server you operate.",
    },
  };
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
  );
}
