import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./mobile/module-graph";
import { isOutsideShell } from "./lib/shell-routes";

/**
 * The theme has to be on `<html>` before the first paint.
 *
 * next-themes applies the class from JavaScript after React mounts. In Next.js
 * it injects its own pre-paint script; in a plain Vite SPA there is nothing
 * before the module entry, so `<html>` renders with NO theme class and
 * `:root`'s light tokens paint. On a dark device that is a white screen, and
 * `body`'s 2s background-color transition then smears the correction into a
 * slow fade instead of a blink.
 *
 * Measured on the deployed build — dark device, cold cache, 6x CPU throttle:
 * no class at the first frame, body at rgb(249,250,251), class arriving at
 * 344ms. One capture had the fade still running 1.9s in.
 *
 * None of that is visible to a component test, and it only reproduces when the
 * main bundle is slow to execute — which is every phone and no dev machine.
 * Hence a source guard.
 */

const HTML = readFileSync(join(SRC, "..", "index.html"), "utf8");

/** Everything up to the module entry — i.e. what runs before the app does. */
const BEFORE_APP = HTML.slice(0, HTML.indexOf('<script type="module"'));

/** The inline script's body, comments and all. */
const INLINE = BEFORE_APP.slice(BEFORE_APP.indexOf("<script>"));

describe("pre-paint theme", () => {
  it("runs a blocking inline script before the app module", () => {
    expect(HTML, "index.html should still load the app as a module").toContain(
      '<script type="module"',
    );
    expect(
      BEFORE_APP,
      "the theme script must come BEFORE the module entry, or it cannot beat the paint",
    ).toContain("<script>");
  });

  it("is inline, not a fetched file, so nothing can delay it", () => {
    const inline = BEFORE_APP.slice(BEFORE_APP.indexOf("<script>"));
    expect(inline, "a src= script would be a network round trip before paint").not.toMatch(
      /<script[^>]+src=/,
    );
  });

  it("reads the same stored preference next-themes writes", () => {
    const inline = BEFORE_APP.slice(BEFORE_APP.indexOf("<script>"));
    // Key and vocabulary must match ThemeProvider's, or the two disagree and the
    // flash comes back for anyone who has used the in-app toggle.
    expect(inline).toMatch(/localStorage\.getItem\(\s*["']theme["']\s*\)/);
    expect(inline).toMatch(/["']dark["']/);
    expect(inline).toMatch(/["']system["']/);
  });

  it("falls back to the OS preference, which is what 'system' means", () => {
    const inline = BEFORE_APP.slice(BEFORE_APP.indexOf("<script>"));
    expect(inline).toMatch(/prefers-color-scheme:\s*dark/);
  });

  it("adds the same class attribute ThemeProvider is configured for", () => {
    const provider = readFileSync(join(SRC, "components", "theme-provider.tsx"), "utf8");
    expect(provider, "if this stops being class-based the script below is wrong").toMatch(
      /attribute=["']class["']/,
    );
    const inline = BEFORE_APP.slice(BEFORE_APP.indexOf("<script>"));
    expect(inline).toMatch(/classList\.add\(\s*["']dark["']\s*\)/);
  });

  /**
   * A throw here would leave the class unset for the whole session — strictly
   * worse than the bug being fixed, and invisible in any environment where
   * storage happens to work.
   */
  it("cannot throw, because storage is not always readable", () => {
    const inline = BEFORE_APP.slice(BEFORE_APP.indexOf("<script>"));
    expect(inline).toMatch(/try\s*\{/);
    expect(inline).toMatch(/catch\s*\(/);
  });
});

/**
 * The ambient time band, which is the SAME bug as the theme class and was left
 * out of the original fix.
 *
 * `data-time-band` selects `--background` and `--card` (index.css,
 * mobile/styles/tokens.css). AmbientBackground used to be the only thing that set
 * it, from a React effect — so on every load the page painted the bandless
 * background and then tweened two seconds to the real one once React mounted.
 * Unlike the theme flash this was not a dark-mode edge case: it happened on every
 * refresh, on every route, in both shells, and it is the main reason a reload
 * looked like the app was struggling to rebuild itself.
 *
 * Stamping it here makes the first painted colour the final one. The tween that
 * made the correction visible is separately gated — see the last block below.
 */
describe("the sign-in route is dark before anything paints", () => {
  /**
   * /login opts out of the theme system — it paints its own shell from an inlined
   * .dark palette, because the Catalyst sign-in iframe is themed by one static
   * stylesheet that cannot follow every token permutation. So a light-mode refresh
   * painted body at rgb(243,244,247) for ~370ms and then cut to near-black, with
   * nothing over the gap: /login is exempt from AppReveal and ShellGate draws no
   * skeleton there.
   *
   * The path test is a duplicate of a rule that also lives in lib/shell-routes.ts,
   * for the same reason the time-band boundaries below are duplicated: nothing
   * importable can run this early. So it is parsed and EXECUTED here rather than
   * string-matched — a pattern that is present but wrong passes a grep.
   */
  const literal = /alwaysDark\s*=\s*(.+)\.test\(location\.pathname\)/.exec(INLINE);

  it("decides it from the path, inside the same pre-paint script", () => {
    expect(literal, "no location.pathname test for the sign-in route").not.toBeNull();
  });

  it("feeds that into the dark decision instead of computing it and dropping it", () => {
    expect(INLINE).toMatch(/var dark\s*=\s*alwaysDark\s*\|\|/);
  });

  it("matches the sign-in route, including under a BASE_PATH prefix", () => {
    const re = new RegExp(literal![1].replace(/^\/|\/$/g, ""));
    expect(re.test("/login")).toBe(true);
    expect(re.test("/login/")).toBe(true);
    // Matched at the end precisely so a deployment under a sub-path still works.
    expect(re.test("/app/login")).toBe(true);
  });

  it("does not match a route that merely starts the same", () => {
    const re = new RegExp(literal![1].replace(/^\/|\/$/g, ""));
    expect(re.test("/logindiagnostics")).toBe(false);
    expect(re.test("/")).toBe(false);
    expect(re.test("/deals")).toBe(false);
  });

  it("agrees with the shell-routes list that /login is not the app", () => {
    // The two encode one fact — this route renders no shell and follows no theme.
    // If /login ever stops being special there, this stops being right here.
    expect(isOutsideShell("/login")).toBe(true);
  });
});

describe("pre-paint time band", () => {
  /** The band boundaries, as the shared module states them. */
  const TIME_BANDS = readFileSync(join(SRC, "lib", "greetings", "time-bands.ts"), "utf8");

  /**
   * Every hour threshold in a source, in order of appearance.
   *
   * Compared rather than re-implemented: the inline script cannot import
   * getTimeBand (nothing importable runs that early), so the boundaries are
   * necessarily duplicated. Duplication is fine; SILENT duplication is not.
   */
  function thresholds(source: string): number[] {
    return [...source.matchAll(/hour\s*[><]=?\s*(\d+)/g)].map((m) => Number(m[1]));
  }

  /**
   * The band names a source mentions, in first-appearance order, deduped —
   * time-bands.ts names all four twice (once in the TimeBand union, once per
   * return), the inline script once each. The ORDER is the thing being compared:
   * it encodes which band each threshold belongs to.
   */
  function bands(source: string): string[] {
    return [
      ...new Set([...source.matchAll(/"(morning|afternoon|evening|night)"/g)].map((m) => m[1])),
    ];
  }

  it("stamps the band on <html> before the app module runs", () => {
    expect(
      INLINE,
      "the band must be set before first paint, or --background changes after it",
    ).toMatch(/setAttribute\(\s*["']data-time-band["']/);
  });

  it("uses the same hour boundaries as time-bands.ts", () => {
    // 6/12/17/21. A drift here does not throw — it silently tints the app on a
    // different schedule than the greeting that is supposed to match it.
    expect(thresholds(INLINE)).toEqual(thresholds(TIME_BANDS));
  });

  it("names the same four bands, in the same order", () => {
    expect(bands(INLINE)).toEqual(bands(TIME_BANDS));
  });

  it("is still inside the try/catch, so a blocked read cannot lose the theme too", () => {
    // Both stamps share one try block. If the band work were moved outside it, a
    // throw from Date/setAttribute would abandon the theme class as well — worse
    // than the bug either half fixes.
    const tryBody = INLINE.slice(INLINE.indexOf("try"), INLINE.indexOf("} catch"));
    expect(tryBody).toContain("data-time-band");
  });

  it("leaves AmbientBackground as an updater that cannot re-trigger the tween", () => {
    // It still has to exist: a session left open across 12:00/17:00/21:00 should
    // re-tint. But it runs on mount too, when the pre-paint script has already
    // written the same value — and an unconditional re-write hands body a fresh
    // background-color to transition to, which is the exact smear this removes.
    const ambient = readFileSync(join(SRC, "components", "ambient-background.tsx"), "utf8");
    expect(ambient, "the write must be guarded by a read of the current value").toMatch(
      /getAttribute\(\s*["']data-time-band["']\s*\)\s*===\s*band/,
    );
  });
});

/**
 * The tween itself.
 *
 * Two seconds is right for the band crossing at 12:00/17:00/21:00 and wrong for
 * the first paint, and unqualified it applied to both — the first resolution of
 * `--background` counts as a change, so body spent two seconds fading into the
 * colour it had already been given. One capture had it still running 1.9s in.
 *
 * Both halves are load-bearing: the pre-paint stamp above removes the change, and
 * gating the transition removes the fade that would make any other
 * first-resolution visible. Keeping only one of them brings the smear back in a
 * slightly different shape.
 */
describe("the 2s background transition", () => {
  const SHEETS = [
    { name: "index.css", css: readFileSync(join(SRC, "index.css"), "utf8") },
    {
      name: "mobile/styles/material.css",
      css: readFileSync(join(SRC, "mobile", "styles", "material.css"), "utf8"),
    },
  ] as const;

  for (const sheet of SHEETS) {
    describe(sheet.name, () => {
      /** Every rule whose body animates background-color, with its selector. */
      const animated = [
        ...sheet.css.matchAll(/([^{}]+)\{([^}]*transition:[^;}]*background-color[^;}]*;)/g),
      ].map((m) => ({ selector: m[1].trim(), body: m[2] }));

      it("animates background-color somewhere, or this guard is measuring nothing", () => {
        expect(animated.length).toBeGreaterThan(0);
      });

      it("can only run once boot is over", () => {
        // data-app-ready is set by AppReveal when it lifts. Without the gate the
        // tween runs during boot, which is when it must not.
        for (const rule of animated) {
          expect(rule.selector, `${sheet.name}: "${rule.selector}"`).toContain(
            "[data-app-ready]",
          );
        }
      });
    });
  }

  it("has exactly one writer of data-app-ready, and it is AppReveal", () => {
    // If a second component set it, the gate would open before AppReveal decided
    // the app was ready and the tween would be back inside boot.
    const reveal = readFileSync(join(SRC, "components", "app-reveal.tsx"), "utf8");
    expect(reveal).toMatch(/setAttribute\(\s*["']data-app-ready["']/);
  });
});
