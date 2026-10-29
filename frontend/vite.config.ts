import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const PUBLIC_ROUTES = ["/", "/features", "/how-it-works", "/pricing", "/privacy", "/terms"];

function seoFiles(): Plugin {
  const write = (directory: string) => {
    const site = (process.env.VITE_SITE_URL || "http://localhost:5174").replace(/\/$/, "");
    const urls = PUBLIC_ROUTES.map(
      (route) => `  <url><loc>${site}${route === "/" ? "/" : route}</loc></url>`
    ).join("\n");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
    );
    fs.writeFileSync(
      path.join(directory, "robots.txt"),
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /app",
        "Disallow: /sign-in",
        "Disallow: /register",
        `Sitemap: ${site}/sitemap.xml`,
        "",
      ].join("\n")
    );
  };

  return {
    name: "shortforge-seo",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (url !== "/robots.txt" && url !== "/sitemap.xml") {
          next();
          return;
        }
        const dir = path.resolve("node_modules/.shortforge-seo");
        write(dir);
        res.setHeader("Content-Type", url.endsWith(".txt") ? "text/plain" : "application/xml");
        res.end(fs.readFileSync(path.join(dir, url.slice(1))));
      });
    },
    closeBundle() {
      write(path.resolve("dist"));
    },
  };
}

export default defineConfig({
  plugins: [react(), seoFiles()],
  server: {
    port: Number(process.env.VITE_PORT) || 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY || "http://127.0.0.1:8891",
        changeOrigin: true,
      },
    },
  },
});
