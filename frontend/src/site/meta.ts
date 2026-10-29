import { useEffect } from "react";

function siteOrigin(): string {
  const configured = import.meta.env.VITE_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector);
  if (!(el instanceof HTMLMetaElement)) {
    const created = document.createElement("meta");
    created.setAttribute(attr, key);
    document.head.appendChild(created);
    el = created;
  }
  el.setAttribute("content", content);
}

export function usePageMeta(opts: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}) {
  useEffect(() => {
    document.title = opts.title;
    upsertMeta("name", "description", opts.description);
    upsertMeta("property", "og:title", opts.title);
    upsertMeta("property", "og:description", opts.description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("name", "twitter:card", "summary");
    upsertMeta(
      "name",
      "robots",
      opts.index === false ? "noindex, nofollow" : "index, follow"
    );
    const href = `${siteOrigin()}${opts.path}`;
    upsertMeta("property", "og:url", href);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!(link instanceof HTMLLinkElement)) {
      const created = document.createElement("link");
      created.rel = "canonical";
      document.head.appendChild(created);
      link = created;
    }
    link.setAttribute("href", href);
  }, [opts.title, opts.description, opts.path, opts.index]);
}

export function contactEmail(): string | undefined {
  const value = import.meta.env.VITE_CONTACT_EMAIL?.trim();
  return value || undefined;
}
