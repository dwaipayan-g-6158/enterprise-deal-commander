import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.svg",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-512-maskable.png",
      ],
      manifest: {
        // Stable app identity, so a later start_url change doesn't register as
        // a different app and orphan existing installs.
        id: "/",
        name: "Enterprise Deal Commander",
        short_name: "Deal Commander",
        description:
          "Enterprise Deal Commander — a cockpit for managing enterprise software deals, risk, and governance.",
        // Matches the app's default light theme. These were #15171a, which
        // flashed a near-black splash and window chrome into a light app.
        // (No orientation lock: the same manifest serves desktop installs.)
        theme_color: "#f8f9fb",
        background_color: "#f8f9fb",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          // Lookup tables (stages, catalogs, competitors, gate definitions)
          // barely change and are read by nearly every screen. Their own
          // bucket with a week-long life keeps them from competing for space
          // with per-deal reads. NOTE: useSignOut() purges every cache whose
          // key starts "edc-api-", so a new bucket named that way is cleared
          // on sign-out without further wiring.
          {
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === "GET" && /\/api\/v1\/lookups\//.test(url.pathname),
            handler: "StaleWhileRevalidate" as const,
            options: {
              cacheName: "edc-api-lookups",
              expiration: { maxEntries: 40, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === "GET" &&
              /\/api\/v[12]\//.test(url.pathname) &&
              // Auth must always hit the network — the offline session
              // fallback in role-context.tsx depends on it never being served
              // from cache.
              !/\/api\/v1\/auth\//.test(url.pathname) &&
              !/\/api\/v1\/lookups\//.test(url.pathname),
            handler: "StaleWhileRevalidate" as const,
            options: {
              cacheName: "edc-api-reads",
              // Raised from 60: one mobile deal-detail visit alone touches
              // half a dozen endpoints, so browsing a portfolio used to evict
              // the earlier deals before the user got back to them.
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Webfonts, so an offline cold launch renders in Geist instead of
          // falling back to a system face mid-session.
          {
            urlPattern: ({ url }: { url: URL }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate" as const,
            options: {
              cacheName: "google-fonts-stylesheets",
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }: { url: URL }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst" as const,
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // In local dev the API server runs as a separate process; proxy /api to it.
    // (In the deployed environment a router fronts both, so relative paths work.)
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    // Mirror the dev proxy so the production preview can reach the local API.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
