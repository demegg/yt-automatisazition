import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import Logo from "../components/Logo";
import { MarketingLayout, HomePage } from "./Marketing";
import {
  AuthPage,
  FeaturesPage,
  NotFoundPage,
  PricingPage,
  PrivacyPage,
  TermsPage,
  WorkflowPage,
} from "./PublicPages";
import {
  AccountPage,
  AppShell,
  ExportsPage,
  OverviewPage,
  ProjectsPage,
  QueuePage,
  SettingsPage,
  UsagePage,
} from "./Workspace";

const Studio = lazy(() => import("../App"));

/** Scrolls to the top on page changes and to `#hash` targets once they render. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el || ++tries > 20) {
        window.clearInterval(timer);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [pathname, hash]);
  return null;
}

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas text-sm text-muted">
      <div className="relative">
        <span className="absolute inset-0 rounded-xl bg-brand/40 animate-pulse-ring" />
        <Logo size={40} />
      </div>
      <p className="animate-fade-in">{label}</p>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <FullScreenLoader label="Loading workspace…" />;
  }
  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function StudioRoute() {
  const { jobId } = useParams();
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1400px] space-y-4">
          <div className="skeleton h-10 w-64" />
          <div className="skeleton h-12 w-full max-w-xl" />
          <div className="skeleton h-[420px] w-full rounded-3xl" />
        </div>
      }
    >
      <Studio key={jobId || "new"} />
    </Suspense>
  );
}

export default function RouterApp() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Routes>
        <Route element={<MarketingLayout />}>
          <Route index element={<HomePage />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="how-it-works" element={<WorkflowPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="terms" element={<TermsPage />} />
          <Route path="sign-in" element={<AuthPage mode="login" />} />
          <Route path="register" element={<AuthPage mode="register" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route
          path="app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="new" element={<StudioRoute />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:jobId" element={<StudioRoute />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="exports" element={<ExportsPage />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
