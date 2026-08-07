import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { injectCatalystIframeTheme } from "./catalyst-iframe-link";

const ORIGIN = "https://edc.example";

// The module reads window.location.origin to build an absolute href. Vitest runs
// this package in the "node" environment (no jsdom), so stub the one global it
// touches rather than pulling in a DOM just for this.
let savedWindow: unknown;
beforeAll(() => {
  savedWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { location: { origin: ORIGIN } };
});
afterAll(() => {
  (globalThis as { window?: unknown }).window = savedWindow;
});

type FakeLink = { rel: string; href: string; attrs: Record<string, string> };

function fakeDoc({ hasHead = true, existingLink = false } = {}) {
  const appended: FakeLink[] = [];
  const style: Record<string, string> = {};
  const doc = {
    documentElement: { style },
    head: hasHead ? { appendChild: (n: FakeLink) => void appended.push(n) } : null,
    querySelector: () => (existingLink ? ({} as object) : null),
    createElement: (): FakeLink => ({
      rel: "",
      href: "",
      attrs: {},
      setAttribute(this: FakeLink, k: string, v: string) {
        this.attrs[k] = v;
      },
    } as FakeLink),
  } as unknown as Document;
  return { doc, appended, style };
}

describe("injectCatalystIframeTheme", () => {
  it("forces color-scheme: dark on the document element", () => {
    // The whole point. Zoho's document has no color-scheme, so it computes to
    // `normal` (light) and the UA paints the document's CANVAS white. The canvas
    // is not an element, so no background rule in the stylesheet can reach it —
    // this is the only thing that stops the panel rendering as a white box.
    const { doc, style } = fakeDoc();
    injectCatalystIframeTheme(doc);
    expect(style.colorScheme).toBe("dark");
  });

  it("still sets color-scheme when the stylesheet link is already present", () => {
    // The early return for an existing link must not skip this. Set inline and
    // unconditionally, it also beats the <link>'s async fetch — otherwise the
    // recovery page flashes a white canvas until the sheet lands.
    const { doc, style, appended } = fakeDoc({ existingLink: true });
    expect(injectCatalystIframeTheme(doc)).toBe(true);
    expect(style.colorScheme).toBe("dark");
    expect(appended).toHaveLength(0);
  });

  it("appends the stylesheet with an absolute href and the idempotency marker", () => {
    const { doc, appended } = fakeDoc();
    expect(injectCatalystIframeTheme(doc)).toBe(true);
    expect(appended).toHaveLength(1);
    expect(appended[0].rel).toBe("stylesheet");
    // Absolute against OUR origin — a relative href would resolve against
    // whatever Zoho path the frame currently has loaded.
    expect(appended[0].href).toBe(`${ORIGIN}/login-iframe.css`);
    expect(appended[0].attrs["data-edc-theme"]).toBe("1");
  });

  it("reports failure without throwing when the document has no head yet", () => {
    const { doc, appended } = fakeDoc({ hasHead: false });
    expect(injectCatalystIframeTheme(doc)).toBe(false);
    expect(appended).toHaveLength(0);
  });
});
