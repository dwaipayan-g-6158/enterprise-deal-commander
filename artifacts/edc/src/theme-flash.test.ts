import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC } from "./mobile/module-graph";

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
