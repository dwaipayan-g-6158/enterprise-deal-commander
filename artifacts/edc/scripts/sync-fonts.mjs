/**
 * Copies the Geist and Geist Mono webfonts out of their npm packages into
 * public/fonts, and prints the @font-face block that references them.
 *
 * ## Why the fonts are served from here at all
 *
 * They used to come from fonts.googleapis.com as a render-blocking cross-origin
 * <link rel="stylesheet"> in index.html. Two costs, both paid on every load that
 * was not already warm:
 *
 *   1. First paint waited on a third-party round trip — DNS, TLS and a request
 *      for a stylesheet whose only job was to name four woff2 URLs on a SECOND
 *      third-party host, which then had to be resolved and fetched in turn.
 *   2. `display=swap` meant the page laid out in the system fallback and then
 *      relaid out in Geist. Geist's metrics are not the fallback's, so every
 *      line of text on screen moved.
 *
 * Both disappear when the files are same-origin: they are discoverable in the
 * initial HTML, preloadable, precachable by the service worker, and subject to
 * no other origin's availability. The service worker's two `google-fonts-*`
 * runtime caches came out with the <link> — the precache covers what they were
 * for, and covers it on the first load rather than the second.
 *
 * ## Why a script, and not committed-by-hand binaries
 *
 * Provenance. The packages pin a version, carry the upstream licence, and can be
 * updated by the package manager; a hand-dropped woff2 has no version and no way
 * to be audited. The cost of that is drift — `pnpm update` bumps the package and
 * public/fonts silently keeps serving the old outlines — so fonts.test.ts
 * compares the two byte-for-byte and fails if they disagree. Same arrangement as
 * generate-splash.mjs / splash.test.ts.
 *
 * ## Which files, and which are left out
 *
 * Every roman subset of both families. `unicode-range` on each @font-face means
 * a reader only downloads the subsets their text actually needs — latin alone
 * for most, and the whole set costs 137KB of precache to guarantee that an
 * account name in Cyrillic or Vietnamese renders in the right face offline
 * rather than falling back mid-portfolio.
 *
 * Italic files are deliberately NOT copied. The Google request this replaces was
 * `family=Geist:wght@100..900` — roman only — so italics have always been
 * synthesised by the browser, and shipping real italics here would be a visual
 * change smuggled in under a performance fix.
 *
 * The licences travel with the files, because this repository is public.
 *
 * Usage: pnpm --filter @workspace/edc run sync-fonts
 */

import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDC = join(HERE, "..");
const OUT_DIR = join(EDC, "public", "fonts");

/** Root-absolute, for the same reason apple-touch-icon is: a relative url()
 *  resolves against the stylesheet, and index.html's preload against the page. */
const URL_PREFIX = "/fonts";

const require = createRequire(import.meta.url);

/**
 * The two families, with the CSS family name the app already asks for.
 *
 * `cssFamily` is 'Geist', not the packages' own 'Geist Variable': index.css's
 * --app-font-sans has said 'Geist' since the Google Fonts days, and renaming the
 * family would mean touching every consumer to fix a filename.
 */
const FAMILIES = [
  { pkg: "@fontsource-variable/geist", cssFamily: "Geist", token: "--app-font-sans" },
  { pkg: "@fontsource-variable/geist-mono", cssFamily: "Geist Mono", token: "--app-font-mono" },
];

/** Resolves a package's root from a file we know it exports. */
function packageRoot(pkg) {
  return dirname(require.resolve(`${pkg}/package.json`));
}

/**
 * Reads the package's own `wght.css` and returns one entry per roman subset.
 *
 * Parsed rather than hand-listed so the unicode-ranges are upstream's. Getting a
 * range wrong does not error — it silently routes a script to the wrong file, or
 * to no file at all, and the only symptom is a fallback glyph in someone else's
 * language.
 */
function readRomanFaces(pkgRoot) {
  const css = readFileSync(join(pkgRoot, "wght.css"), "utf8");
  const faces = [];

  for (const block of css.split("@font-face").slice(1)) {
    const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    const weight = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim();
    if (!file || !range || !weight) {
      throw new Error(`Could not parse an @font-face in ${pkgRoot}/wght.css`);
    }
    faces.push({ file, range, weight });
  }

  if (faces.length === 0) throw new Error(`No @font-face found in ${pkgRoot}/wght.css`);
  return faces;
}

// --- Copy ------------------------------------------------------------------

// Rebuilt rather than merged, so a subset dropped upstream does not linger here
// as a file the CSS no longer names.
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const declarations = [];
let bytes = 0;

for (const family of FAMILIES) {
  const root = packageRoot(family.pkg);
  const faces = readRomanFaces(root);

  for (const face of faces) {
    copyFileSync(join(root, "files", face.file), join(OUT_DIR, face.file));
    declarations.push(
      [
        "@font-face {",
        `  font-family: '${family.cssFamily}';`,
        "  font-style: normal;",
        "  font-display: swap;",
        `  font-weight: ${face.weight};`,
        `  src: url('${URL_PREFIX}/${face.file}') format('woff2-variations');`,
        `  unicode-range: ${face.range};`,
        "}",
      ].join("\n"),
    );
  }

  // Public repo: the outlines cannot ship without the terms they ship under.
  const licence = `LICENSE-${family.pkg.split("/")[1]}.txt`;
  copyFileSync(join(root, "LICENSE"), join(OUT_DIR, licence));

  console.log(`${family.pkg}: ${faces.length} roman subsets + ${licence}`);
}

for (const name of readdirSync(OUT_DIR)) {
  if (name.endsWith(".woff2")) {
    bytes += readFileSync(join(OUT_DIR, name)).byteLength;
  }
}

console.log(`\n${OUT_DIR}\n${(bytes / 1024).toFixed(1)}KB of woff2\n`);
console.log("/* Paste into index.css if the declarations there need regenerating: */\n");
console.log(declarations.join("\n\n"));
