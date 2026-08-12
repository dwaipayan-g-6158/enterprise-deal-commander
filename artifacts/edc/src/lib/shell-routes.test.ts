import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isOutsideShell, isSignInRoute, SIGN_IN_CANVAS } from "./shell-routes";
import { stripCodeComments } from "../mobile/class-scan";

/**
 * The routes that render no app shell, and the two things that must respect them.
 *
 * These assertions call the predicate rather than scanning for its patterns, which
 * is what app-reveal.test.ts had to do while the list lived inside a component. A
 * pattern that is present but wrong passes a source scan and fails here.
 */

const APP = stripCodeComments(readFileSync(join(import.meta.dirname, "..", "App.tsx"), "utf8"));

describe("isOutsideShell", () => {
  it("covers the four routes that mount no shell", () => {
    expect(isOutsideShell("/login")).toBe(true);
    expect(isOutsideShell("/share/abc123")).toBe(true);
    expect(isOutsideShell("/__catalyst/sdk/init.js")).toBe(true);
    expect(isOutsideShell("/accounts/p/50044704196/signin")).toBe(true);
  });

  it("covers them with a query string, which is how the redirect arrives", () => {
    expect(isOutsideShell("/login?next=%2Fdeals")).toBe(true);
  });

  it("leaves every route that DOES mount the shell alone", () => {
    // The skeleton is right on these — it is a preview of what is coming.
    for (const path of ["/", "/deals", "/deals/abc", "/analytics", "/memory", "/settings"]) {
      expect(isOutsideShell(path), path).toBe(false);
    }
  });

  it("is anchored, so a route that merely mentions one does not match", () => {
    // The failure this prevents: a shell route losing its skeleton, and the boot
    // mask silently disappearing from a page that wanted it.
    expect(isOutsideShell("/deals?ref=/login")).toBe(false);
    expect(isOutsideShell("/x/accounts")).toBe(false);
  });

  it("is terminated, so a longer path that starts the same does not match", () => {
    expect(isOutsideShell("/logindiagnostics")).toBe(false);
    expect(isOutsideShell("/shared")).toBe(false);
  });
});

describe("ShellGate's Suspense fallback", () => {
  it("is gated on the route, not just the viewport", () => {
    // Both skeletons draw signed-in chrome — a 256px sidebar with seven nav rows on
    // desktop, a nav bar and four-item tab bar on mobile. Ungated, a refresh of
    // /login showed the desktop shell for ~280ms (measured 61→342ms on the deployed
    // build) before the sign-in card, which reads as an already-authenticated app.
    expect(APP).toContain("isOutsideShell");
    // The fallback must be the gated expression, not a bare skeleton.
    expect(APP).toMatch(/fallback=\{fallback\}/);
  });

  it("paints the sign-in gap in the page's own colour, and nothing elsewhere", () => {
    // The pre-paint stamp cannot cover this window: next-themes restores the stored
    // preference at mount, and the whole Suspense gap is after that. So a light-mode
    // reader got dark, then light for ~370ms, then the near-black page.
    expect(APP).toContain("SIGN_IN_CANVAS");
    expect(APP).toContain("isSignInRoute");
    // /share is outside the shell but fully themed, so it must still get nothing.
    expect(APP).toMatch(/:\s*null/);
  });
});

describe("the sign-in canvas colour", () => {
  it("is the colour the sign-in page actually paints", () => {
    // One value, two users. A near-miss between them would read as a flash at the
    // handoff from the gap to the page, which is exactly what this replaced.
    const login = readFileSync(
      join(import.meta.dirname, "..", "pages", "login.tsx"),
      "utf8",
    );
    expect(login).toContain("SIGN_IN_CANVAS");
    expect(login, "the page must not restate the literal").not.toMatch(
      /SHELL_BG\s*=\s*"hsl\(/,
    );
  });

  it("is dark, since that is the whole point of forcing it", () => {
    // Guards against someone "tidying" it into a token that follows the theme —
    // which would put the light background straight back.
    expect(SIGN_IN_CANVAS).toBe("hsl(220 10% 8%)");
  });

  it("applies to sign-in only, not to every route outside the shell", () => {
    expect(isSignInRoute("/login")).toBe(true);
    expect(isSignInRoute("/login?next=%2Fdeals")).toBe(true);
    expect(isSignInRoute("/share/abc")).toBe(false);
    expect(isSignInRoute("/logindiagnostics")).toBe(false);
    expect(isSignInRoute("/deals")).toBe(false);
  });
});
