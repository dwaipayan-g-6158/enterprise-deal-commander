import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The self-hosted webfonts, and the four places that have to agree about them.
 *
 * scripts/sync-fonts.mjs copies the woff2 files out of two npm packages into
 * public/fonts and prints the @font-face block; index.css declares the faces;
 * index.html preloads two of them; vite.config.ts's globPatterns decides which
 * reach the precache. The generator writes them consistently in one pass, and any
 * one of them can drift by hand or by a `pnpm update` afterwards — the same
 * arrangement, and the same hazard, as splash-devices.json / public/splash /
 * index.html, which splash.test.ts guards.
 *
 * The failure modes are all quiet. A stale copy serves last version's outlines
 * forever. A face declared for a file that is not there falls back to the system
 * font for that script only, so it shows up in one language and not the reviewer's.
 * A preload whose href does not exist is a wasted round trip and a console warning
 * nobody reads. A missing glob means the app is fine online and loses its typeface
 * on a plane, which is precisely the case self-hosting was supposed to fix.
 */

const SRC = import.meta.dirname;
const EDC = join(SRC, "..");
const FONT_DIR = join(EDC, "public", "fonts");

const HTML = readFileSync(join(EDC, "index.html"), "utf8");
/** Comments here name the very hosts and files being counted. */
const HTML_CODE = HTML.replace(/<!--[\s\S]*?-->/g, "");
const CSS = readFileSync(join(SRC, "index.css"), "utf8");
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const VITE = readFileSync(join(EDC, "vite.config.ts"), "utf8");

const require = createRequire(import.meta.url);
const PACKAGES = ["@fontsource-variable/geist", "@fontsource-variable/geist-mono"];

/** Every `url('/fonts/...woff2')` the stylesheet actually references. */
const declaredFiles = [...CSS_CODE.matchAll(/url\('\/fonts\/([^']+\.woff2)'\)/g)].map(
  (m) => m[1],
);
const shippedFiles = readdirSync(FONT_DIR).filter((name) => name.endsWith(".woff2"));

describe("the shipped font files", () => {
  it("are byte-identical to the packages they came from", () => {
    /**
     * The drift guard, and the reason a copy is acceptable at all. Without this,
     * bumping either package updates node_modules and leaves public/fonts serving
     * the previous outlines — with every test still green, because nothing else
     * looks at the bytes.
     */
    for (const pkg of PACKAGES) {
      const root = dirname(require.resolve(`${pkg}/package.json`));
      const upstream = readdirSync(join(root, "files")).filter((name) =>
        name.endsWith("-wght-normal.woff2"),
      );
      expect(upstream.length, `${pkg} should ship roman subsets`).toBeGreaterThan(0);

      for (const name of upstream) {
        expect(shippedFiles, `${name} missing from public/fonts — re-run sync-fonts`).toContain(
          name,
        );
        expect(
          readFileSync(join(FONT_DIR, name)).equals(readFileSync(join(root, "files", name))),
          `${name} differs from ${pkg} — re-run sync-fonts`,
        ).toBe(true);
      }
    }
  });

  it("ship no italics, because none were ever loaded before", () => {
    // The Google request this replaced was `Geist:wght@100..900` — roman only — so
    // italics have always been synthesised. Copying real italic files would be a
    // visual change smuggled in under a performance fix.
    expect(shippedFiles.filter((name) => name.includes("italic"))).toEqual([]);
  });

  it("carry their licences, because this repository is public", () => {
    const licences = readdirSync(FONT_DIR).filter((name) => name.startsWith("LICENSE-"));
    expect(licences).toHaveLength(PACKAGES.length);
  });

  it("are all declared, and every declaration has a file", () => {
    // Two different bugs with one symptom each: an orphan file is dead weight in
    // the precache, and an orphan declaration silently drops one script's glyphs.
    expect([...declaredFiles].sort()).toEqual([...shippedFiles].sort());
  });
});

describe("the @font-face declarations", () => {
  it("cover both families under the names the app asks for", () => {
    // --app-font-sans/--app-font-mono have said 'Geist'/'Geist Mono' since the
    // Google Fonts days; the packages' own name is 'Geist Variable'. Using theirs
    // would render the whole app in the fallback face with nothing erroring.
    expect(CSS_CODE).toContain("--app-font-sans: 'Geist', sans-serif");
    expect(CSS_CODE).toContain("--app-font-mono: 'Geist Mono', monospace");
    expect(CSS_CODE).toMatch(/@font-face\s*\{[^}]*font-family:\s*'Geist';/);
    expect(CSS_CODE).toMatch(/@font-face\s*\{[^}]*font-family:\s*'Geist Mono';/);
  });

  it("give every face a unicode-range, which is what makes shipping every subset free", () => {
    // Without it each face claims all codepoints and the browser downloads the
    // first one that matches — turning eleven optional files into one wrong one.
    const faces = [...CSS_CODE.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(faces).toHaveLength(shippedFiles.length);
    for (const face of faces) {
      expect(face).toContain("unicode-range:");
      expect(face).toContain("font-weight: 100 900");
      expect(face).toContain("format('woff2-variations')");
    }
  });

  it("keeps swap rather than optional", () => {
    // The files are preloaded and precached, so after a first visit there is
    // nothing to swap from. `optional` would mean a genuinely cold slow load
    // rendered the entire session in the fallback face — worse than one repaint.
    for (const face of CSS_CODE.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      expect(face[1]).toContain("font-display: swap");
    }
  });
});

describe("index.html", () => {
  it("no longer puts Google on the critical path", () => {
    /**
     * The whole point of the change. A render-blocking cross-origin stylesheet
     * whose only content was more cross-origin URLs meant first paint waited on
     * two third parties in sequence.
     *
     * public/login-iframe.css still imports from googleapis for the Catalyst
     * sign-in iframe, which is a separate document with its own stylesheet and is
     * deliberately out of scope here — this assertion is about the app shell only.
     */
    expect(HTML_CODE).not.toContain("fonts.googleapis.com");
    expect(HTML_CODE).not.toContain("fonts.gstatic.com");
  });

  it("preloads the latin subsets, and only those", () => {
    // Preload is a promise the file WILL be used this navigation. Latin is needed
    // by every screen; preloading the other nine would fetch ~90KB nobody renders
    // and earn a console warning for each.
    const preloads = [...HTML_CODE.matchAll(/rel="preload"[^>]*href="\/fonts\/([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(preloads.sort()).toEqual([
      "geist-latin-wght-normal.woff2",
      "geist-mono-latin-wght-normal.woff2",
    ]);
  });

  it("preloads files that exist and are declared", () => {
    for (const match of HTML_CODE.matchAll(/rel="preload"[^>]*href="\/fonts\/([^"]+)"/g)) {
      expect(shippedFiles, `${match[1]} is preloaded but not shipped`).toContain(match[1]);
      expect(declaredFiles, `${match[1]} is preloaded but not declared`).toContain(match[1]);
    }
  });

  it("marks every font preload crossorigin and as=font", () => {
    /**
     * `crossorigin` is required even though these are same-origin: fonts are
     * fetched in CORS mode, and a preload without it does not match the later
     * request — so the file is downloaded twice and the preload is wasted. This is
     * the single easiest thing to get wrong here and it costs exactly what the
     * change was meant to save.
     */
    for (const tag of HTML_CODE.matchAll(/<link rel="preload"[^>]*>/g)) {
      expect(tag[0]).toContain('as="font"');
      expect(tag[0]).toContain('type="font/woff2"');
      expect(tag[0]).toContain("crossorigin");
    }
  });
});

describe("the service worker", () => {
  it("precaches woff2 without dropping the defaults", () => {
    /**
     * woff2 is not in vite-plugin-pwa's default globPatterns
     * (js,css,html,ico,png,svg), so it has to be named — and naming it ALONE
     * replaces the defaults, which would silently stop precaching the app itself
     * while every test here still passed.
     */
    const patterns = VITE.match(/globPatterns:\s*\[([^\]]*)\]/)![1];
    for (const extension of ["js", "css", "html", "woff2"]) {
      expect(patterns, `globPatterns should include ${extension}`).toContain(extension);
    }
  });

  it("has no runtime cache left for a font host it no longer calls", () => {
    // Replaced by the precache, which is strictly better at the job those buckets
    // existed for: a runtime cache is empty until the first successful online
    // fetch, so a freshly installed app opened offline had nothing to serve.
    const code = VITE.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain("fonts.googleapis.com");
    expect(code).not.toContain("fonts.gstatic.com");
  });
});
