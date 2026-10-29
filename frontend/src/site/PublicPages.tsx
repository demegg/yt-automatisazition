import {
  ArrowRight,
  Captions,
  Check,
  Download,
  Eye,
  EyeOff,
  Layers,
  LayoutTemplate,
  Loader2,
  Minus,
  Pencil,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import Logo from "../components/Logo";
import FilmFrame from "./hero/FilmFrame";
import { usePageMeta } from "./meta";
import { useReveal } from "./ui";

function PageHero({ kicker, title, body }: { kicker: string; title: React.ReactNode; body?: string }) {
  return (
    <header className="relative overflow-hidden">
      <div className="ambient opacity-60" />
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-content px-4 pb-12 pt-16">
        <p className="section-kicker animate-fade-up">{kicker}</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-tight text-white animate-fade-up sm:text-6xl" style={{ animationDelay: "80ms" }}>
          {title}
        </h1>
        {body && (
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-muted animate-fade-up" style={{ animationDelay: "160ms" }}>
            {body}
          </p>
        )}
      </div>
    </header>
  );
}

const FEATURE_DETAILS: [string, string, typeof Upload][] = [
  ["Import", "File upload for a primary video and an optional second video. http and https links are queued to yt-dlp. Unsupported extensions and files over the upload limit are rejected before processing.", Upload],
  ["Edit", "In-browser preview with a draggable timeline. Trim a range or define custom parts, then split at the playhead. Optional soundtrack mix. Shortcuts: Space, arrows, I, O, S, N, Delete.", Pencil],
  ["Layouts", "Single, top and bottom, main plus reaction, picture in picture, and side by side. Dual layouts require the second video. Output is always vertical.", LayoutTemplate],
  ["Captions", "Off by default. When enabled, faster-whisper writes subtitles and FFmpeg burns them in. Styles: TikTok, karaoke, bold center, minimal.", Captions],
  ["Batch", "Equal-length parts from 30 seconds to 15 minutes, or the custom ranges you marked. Optional cap of 1–100 shorts, with a live count before you render.", Layers],
  ["Delivery", "Preview finished parts, download one MP4, or download a zip. Rename and delete projects. Cancel a queued job immediately, or a running job after the current clip.", Download],
];

export function FeaturesPage() {
  const ref = useReveal<HTMLElement>();
  usePageMeta({
    title: "Features — ShortForge",
    description:
      "Import long videos, trim clips, export 1080×1920 H.264 shorts, and optionally burn in faster-whisper captions.",
    path: "/features",
  });
  return (
    <article ref={ref}>
      <PageHero
        kicker="Product"
        title={<>Features that <span className="text-gradient">ship in this build.</span></>}
        body="Each item below is implemented in the processing pipeline. Planned work is listed separately so it is not presented as finished."
      />
      <div id="capabilities" className="mx-auto max-w-content scroll-mt-24 px-4 pb-16">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_DETAILS.map(([title, body, Icon], index) => (
            <section
              key={title}
              className="reveal card card-hover group p-6"
              style={{ ["--reveal-delay" as string]: `${index * 70}ms` }}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow transition duration-500 group-hover:rotate-[-8deg] group-hover:scale-110">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 font-display text-xl font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </section>
          ))}
        </div>
        <section className="reveal mt-10 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
          <h2 className="font-display text-lg font-semibold">Not in this version</h2>
          <ul className="mt-4 grid gap-3 text-sm text-muted sm:grid-cols-2">
            {[
              "Card payments or a hosted subscription.",
              "Password reset by email.",
              "A multi-track editor, undo history, or cloud object storage.",
              "A guarantee that every social video URL can be downloaded.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <Minus className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

export function WorkflowPage() {
  const ref = useReveal<HTMLElement>();
  usePageMeta({
    title: "How it works — ShortForge",
    description:
      "Import a long video, trim the moments worth sharing, and export vertical shorts with FFmpeg on the server.",
    path: "/how-it-works",
  });
  const steps: [string, string, "drive" | "city" | "arrival"][] = [
    ["Import your video", "Name the batch. Add the primary video as a file or as an http(s) link. A second video is optional and unlocks split layouts. The server checks the extension and size, then stores the file on disk.", "drive"],
    ["Find and edit the moments worth sharing", "Preview the source, drag trim handles, or mark custom parts. Choose the layout, caption style, and how many shorts to render. The preview player is the source file, not a fake render.", "city"],
    ["Export ready-to-publish shorts", "A background worker runs FFmpeg. Progress comes from the number of finished parts. Download the MP4s or a zip when the job completes. Failures keep the error message on the project.", "arrival"],
  ];
  return (
    <article ref={ref}>
      <PageHero kicker="Workflow" title={<>Import, edit, <span className="text-gradient">export.</span></>} />
      <ol className="mx-auto max-w-content space-y-6 px-4 pb-16">
        {steps.map(([title, body, crop], index) => (
          <li key={title} className="reveal card grid items-center gap-6 overflow-hidden p-6 md:grid-cols-[minmax(0,1fr)_160px] md:p-8">
            <div>
              <p className="font-display text-5xl font-semibold text-white/10">0{index + 1}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">{title}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{body}</p>
            </div>
            <div className="hidden md:block" aria-hidden="true">
              <FilmFrame time={`0${index}:00`} caption={["Source", "The cut", "Part 1"][index]} detail="1080×1920" crop={crop} className="rotate-[3deg] shadow-lift" />
            </div>
          </li>
        ))}
        <li className="reveal pt-4">
          <Link to="/register" className="btn-primary px-6 py-3">
            Start creating
            <ArrowRight className="h-4 w-4" />
          </Link>
        </li>
      </ol>
    </article>
  );
}

export function PricingPage() {
  usePageMeta({
    title: "Pricing — ShortForge",
    description:
      "ShortForge has no in-app billing. Early access is free to run on a server you operate.",
    path: "/pricing",
  });
  return (
    <article>
      <PageHero
        kicker="Pricing"
        title={<>Early access, <span className="text-gradient">no checkout.</span></>}
        body="Prices are not finalized because payments are not built. Nothing on this page charges a card."
      />
      <div className="mx-auto max-w-content px-4 pb-20">
        <div className="gradient-border relative max-w-lg overflow-hidden rounded-[28px] bg-[#0c0d14] p-8 animate-fade-up">
          <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Self-hosted</h2>
              <span className="rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold text-brand">Early access</span>
            </div>
            <p className="mt-4 font-display text-6xl font-semibold tracking-tight">
              $0 <span className="text-base font-normal text-muted">in the app</span>
            </p>
            <ul className="mt-6 space-y-3 text-sm text-ink/85">
              {[
                "Import, trim, vertical export, optional captions",
                "Accounts on your server",
                "YouTube and TikTok posting after you add those API credentials",
                "Server disk, CPU, and storage are your cost to host",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok">
                    <Check className="h-3 w-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link to="/register" className="btn-primary mt-8 w-full py-3">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PrivacyPage() {
  usePageMeta({
    title: "Privacy policy (draft) — ShortForge",
    description: "Draft privacy notice for a ShortForge deployment. Have counsel review it before a public launch.",
    path: "/privacy",
  });
  return (
    <Legal
      title="Privacy policy"
      updated="October 23, 2026"
      sections={[
        ["Draft", "This page is a draft for operators of ShortForge. It is not a substitute for legal review."],
        ["Who processes data", "The person or company that deploys this server is the operator. ShortForge as shipped does not run a separate hosted account service."],
        ["Account data", "If you register, the server stores your email and a password hash. Sessions use an httpOnly cookie and a bearer token kept in the browser."],
        ["Videos", "Uploads and rendered shorts are files on the server disk. Project names, status, and clip metadata are stored in SQLite. Deleting a project removes its files and database row."],
        ["Captions", "When you enable captions, faster-whisper runs on the server. This build does not send media to a ShortForge cloud model."],
        ["Connected platforms", "If you connect YouTube or TikTok, those services receive the videos you choose to publish, under their own policies. OAuth tokens are stored in the local database."],
        ["What this draft does not promise", "It does not promise a specific retention period beyond “until you delete the project or the operator removes the files,” and it does not describe a data-processing agreement."],
      ]}
    />
  );
}

export function TermsPage() {
  usePageMeta({
    title: "Terms of use (draft) — ShortForge",
    description: "Draft terms for a ShortForge deployment. Have counsel review them before a public launch.",
    path: "/terms",
  });
  return (
    <Legal
      title="Terms of use"
      updated="October 23, 2026"
      sections={[
        ["Draft", "These terms are a starting point for the operator of this deployment. Have them reviewed before you rely on them."],
        ["The service", "ShortForge turns videos you supply into vertical clips using FFmpeg on the operator’s server. Output quality depends on the source."],
        ["Your content", "You are responsible for having the rights to upload, edit, and publish the media. The software does not grant rights to third-party videos."],
        ["Accounts", "Keep your password private. There is no email password reset in this build."],
        ["No payment terms", "The application does not sell subscriptions. Hosting costs, if any, are between you and the operator of the server you use."],
        ["Availability", "Jobs can fail, links can be blocked by video hosts, and a server restart marks in-progress jobs as failed."],
      ]}
    />
  );
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function Legal({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: string[][];
}) {
  return (
    <article className="mx-auto grid max-w-content gap-10 px-4 py-16 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-28 space-y-1 text-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-faint">On this page</p>
          {sections.map(([heading]) => (
            <a key={heading} href={`#${slug(heading)}`} className="block rounded-lg px-2 py-1 text-muted transition hover:bg-white/5 hover:text-ink">
              {heading}
            </a>
          ))}
        </div>
      </nav>
      <div className="max-w-3xl animate-fade-up">
        <p className="inline-flex rounded-full border border-warn/40 bg-warn/10 px-3 py-1 text-xs font-medium text-warn">
          Draft — requires legal review before a public launch
        </p>
        <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-10 space-y-8">
          {sections.map(([heading, body]) => (
            <section key={heading} id={slug(heading)} className="scroll-mt-28 border-t border-white/[0.07] pt-6">
              <h2 className="font-display text-lg font-semibold">{heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

export function NotFoundPage() {
  usePageMeta({
    title: "Page not found — ShortForge",
    description: "That ShortForge page does not exist.",
    path: "/404",
    index: false,
  });
  return (
    <div className="relative mx-auto max-w-content overflow-hidden px-4 py-28 text-center">
      <p className="font-display text-[clamp(6rem,20vw,12rem)] font-semibold leading-none text-gradient animate-fade-up">404</p>
      <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight animate-fade-up" style={{ animationDelay: "80ms" }}>
        This cut didn’t make the edit.
      </h1>
      <p className="mt-3 text-sm text-muted animate-fade-up" style={{ animationDelay: "160ms" }}>
        The address may be mistyped, or the page was never published.
      </p>
      <Link to="/" className="btn-primary mt-8 animate-fade-up" style={{ animationDelay: "240ms" }}>
        Back to the homepage
      </Link>
    </div>
  );
}

function passwordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  usePageMeta({
    title: mode === "login" ? "Sign in — ShortForge" : "Create account — ShortForge",
    description:
      mode === "login"
        ? "Sign in to your ShortForge workspace."
        : "Create a ShortForge account on this server.",
    path: mode === "login" ? "/sign-in" : "/register",
    index: false,
  });

  if (user && user.email !== "guest@local" && !user.guest) {
    return <Navigate to={from} replace />;
  }

  const strength = passwordStrength(password);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div className="ambient opacity-70" />
      <div className="relative mx-auto grid max-w-content items-center gap-12 px-4 py-16 lg:grid-cols-2">
        <div className="hidden lg:block">
          <p className="section-kicker">ShortForge</p>
          <h2 className="mt-4 font-display text-5xl font-semibold leading-tight tracking-tight">
            One long video.
            <span className="block text-gradient">Infinite moments.</span>
          </h2>
          <ul className="mt-8 space-y-3 text-sm text-muted">
            {["Trim with a draggable timeline", "Burn in captions with faster-whisper", "Export 1080×1920 MP4s or a zip"].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-brand">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="mx-auto w-full max-w-md">
          <div className="gradient-border rounded-[28px] bg-[#0c0d14]/90 p-7 shadow-lift backdrop-blur-xl animate-scale-in sm:p-8">
            <Logo size={36} />
            <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {mode === "login" ? "Sign in to your workspace." : "Accounts are stored on this ShortForge server."}
            </p>
            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field py-3"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field py-3 pr-11"
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-faint transition hover:text-ink"
                    aria-label={show ? "Hide password" : "Show password"}
                    onClick={() => setShow((value) => !value)}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === "register" && password && (
                  <div className="mt-2 animate-fade-in">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                            i < strength ? (strength <= 1 ? "bg-danger" : strength === 2 ? "bg-warn" : "bg-ok") : "bg-white/10"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-faint">
                      {password.length < 8 ? "At least 8 characters" : ["Weak", "Weak", "Okay", "Strong", "Very strong"][strength]}
                    </p>
                  </div>
                )}
              </div>
              {error && (
                <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger animate-fade-in">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy} className="btn-primary w-full py-3">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-muted">
              {mode === "login" ? (
                <>
                  New here? <Link className="font-medium text-brand hover:text-brand-hover" to="/register">Create an account</Link>
                </>
              ) : (
                <>
                  Already registered? <Link className="font-medium text-brand hover:text-brand-hover" to="/sign-in">Sign in</Link>
                </>
              )}
            </p>
            <p className="mt-3 text-center text-[11px] text-faint">Password reset by email is not available on this server.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
