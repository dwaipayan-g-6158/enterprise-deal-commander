import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetInstallPrompt,
  _setDeferredForTest,
  canInstall,
  onInstallAvailabilityChange,
  promptInstall,
  type InstallPromptEvent,
} from "./install-prompt";

/** A stand-in for the Chromium event, which no test environment fires. */
function fakeEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = vi.fn(async () => {});
  return {
    event: { prompt, userChoice: Promise.resolve({ outcome }) } as unknown as InstallPromptEvent,
    prompt,
  };
}

afterEach(() => _resetInstallPrompt());

describe("install availability", () => {
  it("offers nothing until the browser has offered something", () => {
    // The button must not exist on a browser that never fires the event —
    // which is every iOS Safari.
    expect(canInstall()).toBe(false);
  });

  it("offers an install once the event is captured", () => {
    _setDeferredForTest(fakeEvent().event);
    expect(canInstall()).toBe(true);
  });

  it("tells subscribers when that changes", () => {
    const seen: boolean[] = [];
    const off = onInstallAvailabilityChange(() => seen.push(canInstall()));
    _setDeferredForTest(fakeEvent().event);
    off();
    _setDeferredForTest(null);
    expect(seen).toEqual([true]);
  });
});

describe("prompting", () => {
  it("shows the browser dialog and reports the choice", async () => {
    const { event, prompt } = fakeEvent("accepted");
    _setDeferredForTest(event);
    await expect(promptInstall()).resolves.toBe("accepted");
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("reports a dismissal as a dismissal, not a failure", async () => {
    _setDeferredForTest(fakeEvent("dismissed").event);
    await expect(promptInstall()).resolves.toBe("dismissed");
  });

  it("consumes the event, because it cannot be shown twice", async () => {
    // Chromium's event is single-use. Re-prompting throws, and leaving the row
    // on screen after it has been used is an affordance that does nothing.
    _setDeferredForTest(fakeEvent().event);
    await promptInstall();
    expect(canInstall()).toBe(false);
    await expect(promptInstall()).resolves.toBe("unavailable");
  });

  it("survives a browser that rejects the prompt", async () => {
    const event = {
      prompt: async () => { throw new Error("not allowed"); },
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    } as unknown as InstallPromptEvent;
    _setDeferredForTest(event);
    await expect(promptInstall()).resolves.toBe("unavailable");
  });

  it("does nothing when there is nothing to prompt", async () => {
    await expect(promptInstall()).resolves.toBe("unavailable");
  });
});

describe("the listener has to outlive React's mount", () => {
  it("registers at module scope, not inside a hook", () => {
    /**
     * `beforeinstallprompt` fires once, early, and usually before React has
     * rendered anything. A `useEffect` subscription misses it and the row never
     * appears — the failure is silent and looks like the browser simply chose
     * not to offer an install.
     */
    const source = readFileSync(join(import.meta.dirname, "install-prompt.ts"), "utf8");
    const listener = source.indexOf('addEventListener("beforeinstallprompt"');
    expect(listener, "the listener is gone").toBeGreaterThan(-1);
    expect(source.slice(0, listener)).not.toMatch(/useEffect|function use[A-Z]/);
  });

  it("suppresses the browser's own mini-infobar", () => {
    // Without preventDefault the browser bar competes with the in-app row and
    // is easy to dismiss permanently by accident.
    const source = readFileSync(join(import.meta.dirname, "install-prompt.ts"), "utf8");
    expect(source).toMatch(/event\.preventDefault\(\)/);
  });
});

describe("the account screen only shows what can work", () => {
  const SCREEN = readFileSync(
    join(import.meta.dirname, "..", "screens", "account", "account-screen.tsx"),
    "utf8",
  );

  it("renders the row conditionally rather than disabling it", () => {
    // On iOS the event never arrives, so a rendered-but-dead button would be
    // the only way for the user to discover it does nothing.
    expect(SCREEN).toMatch(/installable \? \(/);
    expect(SCREEN).not.toMatch(/disabled=\{!installable\}/);
  });

  it("keeps sign out above the trailing prose", () => {
    // The ordering fix from the chrome-occlusion bug: floating chrome may cover
    // prose, never the destructive control. A new row must not push Sign out
    // back into that band.
    const signOut = SCREEN.indexOf('title={signingOut ? "Signing out…" : "Sign out"}');
    const engine = SCREEN.indexOf('title="Engine settings"');
    expect(signOut).toBeGreaterThan(-1);
    expect(signOut).toBeLessThan(engine);
  });
});
