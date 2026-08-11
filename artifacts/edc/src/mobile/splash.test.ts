import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hslToRgb, type Rgb, ruleBody, token } from "../lib/css-token-audit";
import { SRC } from "./module-graph";

/**
 * The iOS launch images, and the links that reach them.
 *
 * Three separate things have to agree and none of them can see the others:
 * scripts/splash-devices.json (the table), public/splash/*.png (the files), and
 * index.html (the links). The generator writes all three from the table in one
 * pass, so they are correct the moment it runs — and silently wrong the moment
 * someone edits one by hand, which is exactly what a generated block invites.
 *
 * The failure mode is invisible on this machine: a device whose link is missing,
 * misdeclared or points at a file that is not there gets a BLANK launch screen,
 * on hardware nobody here has. So the guard measures rather than trusts —
 * dimensions come out of each PNG's IHDR and the colour out of its PLTE, not
 * out of the filename.
 */

const EDC = join(SRC, "..");
const HTML_RAW = readFileSync(join(EDC, "index.html"), "utf8");
/** Comments hold prose that names the very things being counted below. */
const HTML = HTML_RAW.replace(/<!--[\s\S]*?-->/g, "");
const TOKENS = readFileSync(join(SRC, "mobile", "styles", "tokens.css"), "utf8");

interface Device {
  name: string;
  w: number;
  h: number;
  dpr: number;
}

const DEVICES: Device[] = JSON.parse(
  readFileSync(join(EDC, "scripts", "splash-devices.json"), "utf8"),
).devices;

const ORIENTATIONS = ["portrait", "landscape"] as const;
const SCHEMES = ["dark", "light"] as const;

/**
 * The audit's `hslToRgb` returns sRGB 0..1; a PLTE entry is three bytes. This is
 * the same rounding the generator does, deliberately re-derived here rather than
 * imported from it — a guard that shares the code under test proves nothing.
 */
function toBytes(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map((channel) => Math.round(channel * 255));
  return [r, g, b];
}

const CANVAS: Record<(typeof SCHEMES)[number], [number, number, number]> = {
  light: toBytes(hslToRgb(token(ruleBody(TOKENS, ".m-shell {"), "background"))),
  dark: toBytes(hslToRgb(token(ruleBody(TOKENS, ".dark .m-shell {"), "background"))),
};

interface Link {
  media: string;
  href: string;
}

const LINKS: Link[] = [
  ...HTML.matchAll(
    /<link\s+rel="apple-touch-startup-image"\s+media="([^"]+)"\s+href="([^"]+)"\s*\/>/g,
  ),
].map(([, media, href]) => ({ media, href }));

function expectedMedia(device: Device, orientation: string, scheme: string): string {
  return [
    scheme === "dark" ? "(prefers-color-scheme: dark)" : null,
    `(device-width: ${device.w}px)`,
    `(device-height: ${device.h}px)`,
    `(-webkit-device-pixel-ratio: ${device.dpr})`,
    `(orientation: ${orientation})`,
  ]
    .filter(Boolean)
    .join(" and ");
}

/** Portrait is w x h at the device's scale; landscape is the same image rotated. */
function expectedPixels(device: Device, orientation: string): [number, number] {
  return orientation === "portrait"
    ? [device.w * device.dpr, device.h * device.dpr]
    : [device.h * device.dpr, device.w * device.dpr];
}

/**
 * Walks the chunk list rather than searching for "PLTE" as a substring — a byte
 * sequence spelling a chunk name can legitimately occur inside compressed pixel
 * data, and a guard that reads the wrong four bytes would pass on a broken file.
 */
function readPng(file: string): {
  width: number;
  height: number;
  palette: [number, number, number];
} {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).toString("hex"), `${file} PNG signature`).toBe("89504e470d0a1a0a");

  let offset = 8;
  let palette: [number, number, number] | null = null;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "PLTE") palette = [data[0], data[1], data[2]];
    offset += 12 + length;
  }
  expect(offset, `${file} chunk lengths must consume the file exactly`).toBe(buf.length);
  expect(palette, `${file} has no PLTE chunk`).not.toBeNull();

  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    palette: palette as [number, number, number],
  };
}

describe("the device table", () => {
  it("covers enough hardware to be worth having", () => {
    expect(DEVICES.length).toBeGreaterThanOrEqual(15);
    const names = DEVICES.map((d) => d.name);
    expect(names).toContain("iphone-15-pro");
    expect(names).toContain("ipad-pro-12");
    expect(new Set(names).size, "device names must be unique — they are filenames").toBe(
      names.length,
    );
  });

  it("declares each screen once, so two links cannot both match a device", () => {
    const screens = DEVICES.map((d) => `${d.w}x${d.h}@${d.dpr}`);
    expect(new Set(screens).size, `duplicate screen geometry in ${screens.join(", ")}`).toBe(
      screens.length,
    );
  });
});

describe("index.html links", () => {
  it("keeps the markers the generator rewrites between", () => {
    expect(HTML_RAW).toContain("<!-- splash:start -->");
    expect(HTML_RAW).toContain("<!-- splash:end -->");
    expect(HTML_RAW.indexOf("<!-- splash:start -->")).toBeLessThan(
      HTML_RAW.indexOf("<!-- splash:end -->"),
    );
  });

  it("declares exactly one link per device, orientation and scheme", () => {
    const expected = DEVICES.flatMap((device) =>
      ORIENTATIONS.flatMap((orientation) =>
        SCHEMES.map((scheme) => ({
          media: expectedMedia(device, orientation, scheme),
          href: `/splash/${device.name}-${orientation}-${scheme}.png`,
        })),
      ),
    );

    // Compared as sets both ways: missing links leave a device blank, and extra
    // links point at files the generator no longer writes.
    expect(new Set(LINKS.map((l) => l.href))).toEqual(new Set(expected.map((e) => e.href)));
    expect(LINKS.length).toBe(expected.length);
    for (const { media, href } of expected) {
      expect(LINKS, `link for ${href}`).toContainEqual({ media, href });
    }
  });

  /**
   * Dark carries the only prefers-color-scheme clause; light carries none and is
   * the catch-all. A symmetric pair would look tidier and would hand a blank
   * screen to any engine that does not understand the feature, because an
   * unknown media feature evaluates false — so the worst case has to be "light
   * image on a dark device", never "no image".
   */
  it("leaves light as an unconditional fallback, declared after dark", () => {
    const lastDark = LINKS.findLastIndex((l) => l.media.includes("prefers-color-scheme"));
    const firstLight = LINKS.findIndex((l) => !l.media.includes("prefers-color-scheme"));
    expect(firstLight, "at least one scheme-free link must exist").toBeGreaterThanOrEqual(0);
    expect(lastDark, "every dark link must precede every light one").toBeLessThan(firstLight);

    for (const link of LINKS) {
      if (link.href.endsWith("-light.png")) {
        expect(link.media, `${link.href} must not be scheme-scoped`).not.toContain(
          "prefers-color-scheme",
        );
      } else {
        expect(link.media, `${link.href} must be dark-scoped`).toContain(
          "(prefers-color-scheme: dark)",
        );
      }
    }
  });
});

describe("the images themselves", () => {
  const cases = DEVICES.flatMap((device) =>
    ORIENTATIONS.flatMap((orientation) =>
      SCHEMES.map((scheme) => ({
        label: `${device.name}-${orientation}-${scheme}`,
        device,
        orientation,
        scheme,
      })),
    ),
  );

  it.each(cases)("$label is present, correctly sized and the right colour", (c) => {
    const file = join(EDC, "public", "splash", `${c.label}.png`);
    expect(statSync(file).isFile(), `${file} is missing — run generate-splash`).toBe(true);

    const png = readPng(file);
    const [width, height] = expectedPixels(c.device, c.orientation);
    expect([png.width, png.height], `${c.label} pixel size`).toEqual([width, height]);

    // The whole point of reading PLTE: if someone retunes --background and does
    // not regenerate, the launch image hands over to a differently-coloured app
    // and the seam this phase exists to remove comes back.
    expect(png.palette, `${c.label} must match the ${c.scheme} canvas token`).toEqual(
      CANVAS[c.scheme],
    );
  });

  it("stays small enough to belong in a public repo", () => {
    const total = cases.reduce(
      (sum, c) => sum + statSync(join(EDC, "public", "splash", `${c.label}.png`)).size,
      0,
    );
    // Measured 35.5 KB for 76 files as 1-bit palette PNGs. The truecolour
    // encoding of the same pixels was 931.7 KB, so this ceiling is really an
    // assertion that nobody has quietly switched the encoder back.
    expect(total).toBeLessThan(120 * 1024);
  });
});
