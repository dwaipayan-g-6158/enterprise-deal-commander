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
      // autoUpdate, not "prompt", specifically so a BROKEN worker can be
      // evicted without the user's cooperation. Under "prompt" a newly
      // deployed sw.js installs and parks in `waiting` while the OLD worker
      // keeps controlling every open tab and installed PWA until someone
      // accepts a toast — unreachable for exactly the person who needs it,
      // someone stuck on a sign-in form the old worker is hijacking (see
      // navigateFallbackDenylist below), and useless for sign-out, which the
      // same bug breaks from pages that are not /login. autoUpdate makes
      // vite-plugin-pwa set workbox.skipWaiting + clientsClaim, and
      // skipWaiting() reassigns the active worker for clients ALREADY under
      // this registration, so the fixed worker takes over on the next visit.
      //
      // The update PROMPT is not lost, only re-pointed: PwaUpdatePrompt passes
      // `onNeedReload`, which suppresses this mode's automatic
      // window.location.reload() and shows the same toast instead. The worker
      // swaps silently; the page reloads when the user says so.
      registerType: "autoUpdate",
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
        // Long-press the installed icon. Relative, like start_url, so they
        // resolve against the manifest rather than assuming the app is
        // served from the domain root. `filter` is read by the mobile Deals
        // screen; adding a shortcut to a filter the screen cannot restore
        // would land the user on an unfiltered list.
        shortcuts: [
          {
            name: "Red alerts",
            short_name: "Red alerts",
            description: "Deals that need attention right now",
            url: "deals?filter=critical",
            icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "All deals",
            short_name: "Deals",
            description: "The live pipeline",
            url: "deals",
            icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }],
          },
        ],
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
        // Workbox's NavigationRoute tests each of these against
        // `url.pathname + url.search`, only for requests whose mode is
        // "navigate", and defaults to `allowlist: [/./]` — i.e. "serve the
        // precached index.html for EVERY navigation unless denied here".
        // That default is what broke Catalyst Native Auth: the sign-in iframe
        // rendered by `catalyst.auth.signIn()` points at the SAME-ORIGIN path
        // /accounts/p/{zaid}/signin?…, which is a navigation, so this worker
        // answered it out of the precache with EDC's own index.html. The
        // SDK's onload handler then set `.placeholder` on a #login_id that
        // doesn't exist in our markup, threw, and left a blank inputless box.
        // Sign-out broke identically: CatalystAuthBounce turns the SDK's
        // pushState marker into a real navigation to
        // /accounts/p/{zaid}/logout?…, the worker swallowed that too, the
        // real logout endpoint never ran, and the session outlived a
        // "successful" sign-out. A plain fetch() of those URLs always
        // returned Zoho's real IAM HTML — only NAVIGATIONS were hijacked,
        // which is why SDK bootstrap (<script src="/__catalyst/sdk/init.js">,
        // not a navigation) kept working and hid the cause. The sibling
        // Periscope app has the identical Express catch-all and identical
        // console auth config, and works purely because it ships no service
        // worker at all.
        //
        // These are namespaces the Catalyst AppSail gateway owns and
        // intercepts ahead of our container; the app has no route under any
        // of them. api-server/src/app.ts excludes the same prefixes from its
        // SPA catch-all — real defense-in-depth for a gateway miss, but it can
        // never run while the worker answers first, so both layers are needed.
        //
        // Anchored at ^ deliberately: the tested string includes the QUERY
        // STRING, so an unanchored /\/accounts\// would also deny an ordinary
        // app navigation like /deals?ref=/accounts/p/1/signin. `(?:[/?]|$)`
        // covers the three ways a reserved prefix can legitimately end
        // (/accounts/p/…, /accounts?x=1, bare /accounts) while letting
        // lookalikes such as /accountsettings fall through to the fallback.
        navigateFallbackDenylist: [
          /^\/api(?:[/?]|$)/,
          /^\/accounts(?:[/?]|$)/, // Catalyst IAM: signin, logout, password recovery
          /^\/__catalyst(?:[/?]|$)/, // SDK init + signin-redirect marker
          /^\/baas(?:[/?]|$)/, // Catalyst platform API (reserved; XHR today, insurance)
        ],
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
