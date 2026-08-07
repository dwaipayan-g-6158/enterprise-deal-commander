import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the invariants of public/login-iframe.css.
 *
 * That file is ~1,300 lines of Zoho-quirk workarounds delivered to a document we
 * do not control, so almost none of it is unit-testable. These few properties
 * are, and each one has already broken in production:
 *
 * - A single stray `0x01` byte sat in front of `'Geist'` for the file's whole
 *   life. CSS error recovery drops the offending DECLARATION and keeps its
 *   neighbours, so the rule still applied — just without a font — and Zoho's
 *   `body { font-family: Roboto }` won unopposed. Nothing failed, nothing
 *   logged; the font was simply wrong. Hence the control-character test.
 * - `css_url` REPLACES Catalyst's own embedded_signin.css. If that @import is
 *   missing or demoted below a rule, Zoho's base layout and its `display:none`
 *   sub-flow toggles go with it and the form stops advancing between steps.
 * - `color-scheme: dark` is the only thing that stops the iframe's canvas being
 *   painted white. See the comment on the declaration itself.
 */

const CSS = readFileSync(
  path.join(__dirname, "..", "..", "..", "public", "login-iframe.css"),
  "utf8",
);

/** CSS with comments removed, for tests that care about real statements. */
const STRIPPED = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("login-iframe.css", () => {
  it("contains no control characters", () => {
    // eslint-disable-next-line no-control-regex
    const bad = [...CSS.matchAll(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g)].map((m) => ({
      offset: m.index,
      byte: `0x${CSS.charCodeAt(m.index ?? 0).toString(16).padStart(2, "0")}`,
      context: CSS.slice(Math.max(0, (m.index ?? 0) - 20), (m.index ?? 0) + 20).replace(/\s+/g, " "),
    }));
    expect(bad).toEqual([]);
  });

  it("imports Catalyst's own stylesheet as the very first statement", () => {
    // Must precede everything: css_url replaces Zoho's sheet rather than adding
    // to it, and @import is only honoured before other rules.
    const firstStatement = STRIPPED.trim().split(";")[0] + ";";
    expect(firstStatement).toContain("@import");
    expect(firstStatement).toContain("static-file?file_name=embedded_signin.css");
  });

  it("declares both @imports ahead of any style rule", () => {
    const firstBrace = STRIPPED.indexOf("{");
    const preamble = STRIPPED.slice(0, firstBrace);
    expect([...preamble.matchAll(/@import/g)]).toHaveLength(2);
    expect(preamble).toContain("family=Geist");
  });

  it("sets color-scheme: dark, without which the canvas paints white", () => {
    expect(STRIPPED).toMatch(/color-scheme:\s*dark/);
  });

  it("applies the Geist stack to html and body", () => {
    // The regression this file's history is defined by: the declaration existed
    // but was invalid, so it silently did nothing.
    const rule = STRIPPED.match(/html,\s*body\s*\{[^}]*background:\s*var\(--liw-bg\)[^}]*\}/);
    expect(rule, "the html/body rule carrying --liw-bg should exist").not.toBeNull();
    expect(rule?.[0]).toMatch(/font-family:\s*'Geist'/);
  });

  it("keeps inputs at 16px so iOS does not zoom on focus", () => {
    // Anything smaller triggers focus auto-zoom, which persists across the
    // email -> password navigation in a standalone PWA.
    expect(STRIPPED).toMatch(/font-size:\s*16px/);
  });
});
