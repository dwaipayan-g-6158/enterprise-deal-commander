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
        theme_color: "#f8f9fb",
        background_color: "#f8f9fb",
        display: "standalone",
        start_url: ".",
        scope: ".",
        categories: ["business", "productivity"],
        // "any" is the ABSENCE of a lock, stated rather than left implicit. The
        // same manifest serves desktop installs, so "portrait" would be wrong
        // here — a laptop window is not portrait. Saying so out loud stops the
        // next reader adding a lock because the field looked unfinished.
        orientation: "any",
        // Shown in Android's richer install dialog instead of a bare icon.
        // `form_factor: "narrow"` is what makes them eligible there; without it
        // Chrome assumes wide and ignores them on a phone.
        //
        // Captured from the deployed app at 390x844 @2x. Deals and Intelligence
        // deliberately, not Command: Command opens with a greeting that carries
        // the signed-in user's name, and this repository is public. Settings →
        // Users must never appear here for the same reason.
        screenshots: [
          {
            src: "screenshot-deals.png",
            sizes: "780x1688",
            type: "image/png",
            form_factor: "narrow",
            label: "The live pipeline, with health, score and gate progress per deal",
          },
          {
            src: "screenshot-intelligence.png",
            sizes: "780x1688",
            type: "image/png",
            form_factor: "narrow",
            label: "Probabilistic forecast and win rate across the open pipeline",
          },
        ],
        // Long-press the installed icon. Relative, like start_url, so they
        // resolve against the manifest rather than assuming the app is served
        // from the domain root.
        //
        // THE QUERY KEYS ARE THE ROSTER URL CODEC'S, NOT INVENTED HERE. This
        // read `?filter=critical` until the Deals screen moved onto
        // `roster-url.ts` as its source of truth — at which point the key
        // silently stopped being recognised and the shortcut began opening an
        // unfiltered pipeline. A decoder drops keys it does not know without
        // complaining, so nothing failed; the shortcut just quietly stopped
        // filtering. `manifest.test.ts` now decodes every one of these through
        // the same codec the screen parses them with.
        shortcuts: [
          {
            name: "Red alerts",
            short_name: "Red alerts",
            description: "Deals the engine has flagged red",
            url: "deals?h=RED",
            icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Closing soon",
            short_name: "Closing",
            description: "Deals due inside thirty days, soonest first",
            url: "deals?close=30d&so=expectedCloseDate",
            icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "All deals",
            short_name: "Deals",
            description: "The live pipeline",
            url: "deals",
            icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }],
          },
          {
            name: "Deal memory",
            short_name: "Memory",
            description: "Search the archive of closed deals",
            url: "memory",
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
        // vite-plugin-pwa's default globPatterns sweep every png in the output,
        // which would drag the install-dialog screenshots and the Open Graph
        // card into the precache — about 950KB the app itself never renders.
        // They are fetched by Chrome's install UI and by link unfurlers, both
        // of which are online by definition, so precaching them buys nothing
        // and costs every installing user the download.
        //
        // The launch images are excluded for a different reason: iOS reads them
        // from the OS while the app is starting, before a service worker is
        // running at all. Precaching them would add 76 entries to the manifest
        // that nothing can ever request through fetch.
        globIgnores: ["**/screenshot-*.png", "**/opengraph.png", "**/splash/*.png"],
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
          //
          // This one KEEPS StaleWhileRevalidate while the reads bucket below no
          // longer can, and the difference is which of them a write can
          // contradict. Nothing this app does writes a lookup — no screen
          // authors a stage or a gate definition — so there is no
          // write-then-read-your-own-write to get wrong here, and the instant
          // paint is worth having on data every screen needs. The worst case is
          // a stage added elsewhere showing up a load late.
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
            // NetworkFirst, and this is a correctness fix rather than a tuning
            // preference. It was StaleWhileRevalidate, which reverted the result
            // of EVERY WRITE IN THE APP.
            //
            // The sequence, measured on the deployed build against a real gate
            // toggle: the mutation succeeds, the client invalidates and refetches
            // the read it just changed, and SWR answers that refetch from cache —
            // with the body from BEFORE the write. React Query commits the stale
            // value, the optimistic patch is undone on screen, and the background
            // revalidation lands about 1.5s later with nothing left to trigger a
            // re-render. Asking the same URL twice at that instant, once plainly
            // and once with a cache-buster, returned `false` and `true`.
            //
            // It read as a backend problem and is not one: the server is
            // immediately consistent — the PUT's own response carries the new
            // value and the first uncached GET agrees, 203ms later.
            //
            // NetworkFirst keeps the offline story whole, which is the only thing
            // the cache was ever for here: a rejected fetch falls straight
            // through to the cached copy, and a network that hangs falls through
            // after the timeout below. What it gives up is the instant paint from
            // cache while ONLINE — which costs little, because React Query's own
            // in-memory cache already covers repeat views within a session, and
            // this bucket's real job is the cold launch and the tunnel.
            handler: "NetworkFirst" as const,
            options: {
              cacheName: "edc-api-reads",
              // Long enough not to trip on a slow mobile round-trip, short
              // enough that a dead connection does not hold a screen hostage.
              networkTimeoutSeconds: 3,
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
