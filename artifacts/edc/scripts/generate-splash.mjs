/**
 * Generates the iOS launch images, and prints the <link> tags that reference
 * them.
 *
 * ## Why these are solid colour, with no logo on them
 *
 * iOS shows a launch image while the bundle boots. The frame that replaces it
 * is BootSplash's first frame, where the mark sits at the start of its draw-in
 * (so: invisible) and the wordmark is at opacity 0. A launch image carrying a
 * full-size logo would therefore CUT to a logo that then draws itself in from
 * nothing — a worse seam than the one this exists to remove. Apple's own
 * guidance lands in the same place from the other direction: a launch screen
 * approximates the first screen, it is not a brand splash.
 *
 * So the image is the flat canvas, BootSplash starts on that same flat canvas,
 * and the sky and the mark arrive afterwards as motion rather than as a jump.
 *
 * ## Why there is no image library here
 *
 * A solid rectangle needs an encoder, not a renderer. Node ships zlib, PNG's
 * filter 2 (Up) turns every row after the first into zeroes, and deflate
 * crushes that to about a kilobyte even at 2048x2732. Pulling sharp into the
 * tree to fill rectangles would cost a dependency, a postinstall native build,
 * and roughly 40x the bytes in a public repo.
 *
 * ## The colour is read, not typed
 *
 * Both canvases come from tokens.css, so the images cannot drift from the app
 * they hand over to. splash.test.ts re-reads the token, decodes the PNG, and
 * compares actual pixels — change the token without re-running this and the
 * suite says so.
 *
 * Usage: pnpm --filter @workspace/edc run generate-splash
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EDC = join(HERE, "..");
const OUT_DIR = join(EDC, "public", "splash");

/** Public URL prefix. Root-absolute for the same reason apple-touch-icon is:
 *  a relative href resolves against whatever path the app was installed from. */
const URL_PREFIX = "/splash";

// --- Colour ----------------------------------------------------------------

/** `"220 24% 97%"` -> `[246, 247, 249]`. Mirrors hslToRgb in css-token-audit.ts. */
function hslToRgb(triplet) {
  const [h, s, l] = triplet.split(/\s+/).map((part) => Number.parseFloat(part));
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r, g, b].map((channel) => Math.round((channel + m) * 255));
}

/**
 * Pulls `--background` out of one `.m-shell` rule.
 *
 * Deliberately reads the BASE rule and not the time-band overrides. A launch
 * image is picked by screen size and colour scheme; it cannot know the hour, so
 * it shows the neutral canvas and lets the band express itself through the sky
 * that blooms in afterwards.
 */
function canvasToken(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`tokens.css has no ${selector} rule`);
  const body = css.slice(start, css.indexOf("}", start));
  const match = body.match(/--background:\s*([^;]+);/);
  if (!match) throw new Error(`${selector} declares no --background`);
  return match[1].trim();
}

// --- PNG -------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/**
 * A one-colour PNG, as a 1-bit PALETTE image rather than truecolour.
 *
 * The colour lives in PLTE and every pixel is index 0, which means the entire
 * pixel stream — filter bytes included — is zeroes, and deflate returns a few
 * hundred bytes whatever the dimensions.
 *
 * Truecolour was the obvious first attempt and it is 26x larger: LZ77 caps a
 * single match at 258 bytes, so a 2048-wide flat row still costs about
 * twenty-four tokens, times a couple of thousand rows, times 76 files. Measured
 * across the whole set: 931.7 KB the truecolour way against 35.5 KB this way,
 * for identical output pixels. Largest single file 779 bytes.
 */
function solidPng(width, height, [r, g, b]) {
  // One byte per 8 pixels, plus the per-row filter byte. Already all zero from
  // Buffer.alloc, and it must stay that way — index 0, filter 0 (None), every
  // row. Writing anything into this buffer would cost an order of magnitude.
  const raw = Buffer.alloc(height * (1 + Math.ceil(width / 8)));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 1; // bit depth: 1
  ihdr[9] = 3; // colour type: palette
  // 10..12 are compression, filter and interlace methods; 0 is the only legal
  // value for each and Buffer.alloc has already zeroed them.

  // Two entries because bit depth 1 declares a two-colour palette. Both hold the
  // same colour, so an image is flat even if a stray bit is ever set.
  const plte = Buffer.from([r, g, b, r, g, b]);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Emit ------------------------------------------------------------------

/**
 * The media query iOS matches on.
 *
 * Dark carries `(prefers-color-scheme: dark)`; light carries NO scheme clause
 * and acts as the catch-all. That asymmetry is deliberate: if an engine does
 * not understand the feature, an unknown query evaluates false, so a symmetric
 * pair would leave that device with no launch image at all — a blank screen,
 * which is the exact defect this ships to remove. With a catch-all, the worst
 * case is a light image on a dark device rather than nothing.
 */
function mediaQuery({ w, h, dpr }, orientation, scheme) {
  return [
    scheme === "dark" ? "(prefers-color-scheme: dark)" : null,
    `(device-width: ${w}px)`,
    `(device-height: ${h}px)`,
    `(-webkit-device-pixel-ratio: ${dpr})`,
    `(orientation: ${orientation})`,
  ]
    .filter(Boolean)
    .join(" and ");
}

function fileName(device, orientation, scheme) {
  return `${device.name}-${orientation}-${scheme}.png`;
}

function pixelSize({ w, h, dpr }, orientation) {
  return orientation === "portrait" ? [w * dpr, h * dpr] : [h * dpr, w * dpr];
}

const tokens = readFileSync(join(EDC, "src", "mobile", "styles", "tokens.css"), "utf8");
const CANVAS = {
  light: hslToRgb(canvasToken(tokens, ".m-shell {")),
  dark: hslToRgb(canvasToken(tokens, ".dark .m-shell {")),
};

const { devices } = JSON.parse(readFileSync(join(HERE, "splash-devices.json"), "utf8"));

// Cleared rather than overwritten, so a device removed from the table does not
// leave an orphan PNG behind that nothing references and nobody notices.
//
// The files go, not the directory: removing the directory itself is EPERM on
// Windows often enough to break the script outright, and there is nothing in
// here this does not own.
mkdirSync(OUT_DIR, { recursive: true });
for (const stale of readdirSync(OUT_DIR)) {
  if (stale.endsWith(".png")) rmSync(join(OUT_DIR, stale), { force: true });
}

const links = [];
let bytes = 0;

// Dark first: it is the one carrying a scheme clause, and it has to be reachable
// before the light catch-all can swallow the match.
for (const scheme of ["dark", "light"]) {
  for (const device of devices) {
    for (const orientation of ["portrait", "landscape"]) {
      const [width, height] = pixelSize(device, orientation);
      const name = fileName(device, orientation, scheme);
      const png = solidPng(width, height, CANVAS[scheme]);
      writeFileSync(join(OUT_DIR, name), png);
      bytes += png.length;
      links.push(
        `    <link rel="apple-touch-startup-image" media="${mediaQuery(device, orientation, scheme)}" href="${URL_PREFIX}/${name}" />`,
      );
    }
  }
}

// Rewritten in place rather than printed for a human to paste. Seventy-six
// links are exactly the kind of block that gets half-updated once and then
// disagrees with the files on disk forever.
const START = "<!-- splash:start -->";
const END = "<!-- splash:end -->";
const indexPath = join(EDC, "index.html");
const html = readFileSync(indexPath, "utf8");
const from = html.indexOf(START);
const to = html.indexOf(END);
if (from === -1 || to === -1) {
  throw new Error(`index.html is missing the ${START} / ${END} markers`);
}
writeFileSync(
  indexPath,
  `${html.slice(0, from + START.length)}\n${links.join("\n")}\n    ${html.slice(to)}`,
);

const written = readdirSync(OUT_DIR).length;
console.log(
  `${written} launch images, ${(bytes / 1024).toFixed(1)} KB total, in public/splash/.\n` +
    `${links.length} links written into index.html.`,
);
