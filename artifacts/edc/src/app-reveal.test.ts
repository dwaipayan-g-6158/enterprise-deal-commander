import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripCodeComments } from "./mobile/class-scan";

/**
 * The boot mask's contract.
 *
 * AppReveal holds an opaque panel over the app during a reload and cross-fades it
 * away once the app is worth looking at. Everything it gets wrong is invisible in
 * the place people would look for it: the properties that matter are a timeout
 * that must exist, a z-index relative to two other components, and four route
 * patterns whose failure mode is a blank panel over someone else's document. None
 * of that shows up in a render test, and the suite here is `environment: "node"`
 * anyway — so this is a source guard, like theme-flash.test.ts and splash.test.ts.
 *
 * Comments are stripped before every assertion. This component's own prose
 * explains its z-index by naming z-[100] and its exemptions by naming /login, so
 * scanning the raw file would let those assertions pass after the code had lost
 * them — the exact regression shell-a11y.test.ts documents.
 */

const SRC = import.meta.dirname;
const RAW = readFileSync(join(SRC, "components", "app-reveal.tsx"), "utf8");
const SOURCE = stripCodeComments(RAW);
const APP = stripCodeComments(readFileSync(join(SRC, "App.tsx"), "utf8"));
// The route patterns moved to their own module when ShellGate started needing the
// same set — see lib/shell-routes.ts. Still asserted from here, because "the mask
// stays off these four" is this component's contract wherever the list lives.
const ROUTES = stripCodeComments(readFileSync(join(SRC, "lib", "shell-routes.ts"), "utf8"));
const CSS = readFileSync(join(SRC, "index.css"), "utf8");

/** `.app-reveal { ... }` and its `[data-leaving]` variant. */
function rule(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `${selector} should exist in index.css`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
}

/**
 * The same, for a rule nested inside an `@media` block.
 *
 * `rule()` cannot do this job: `.app-reveal-lockup` appears three times in the
 * file — once bare, once under the phone gate and once under reduced motion — and
 * a bare `indexOf` would always return the first, so a gate assertion written with
 * it would silently be checking the unguarded rule instead.
 */
function mediaRule(query: string, selector: string): string {
  const block = CSS.indexOf(`@media ${query} {`);
  expect(block, `@media ${query} should exist in index.css`).toBeGreaterThan(-1);
  const at = CSS.indexOf(`${selector} {`, block);
  expect(at, `${selector} should exist inside @media ${query}`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
}

describe("the reveal has both a floor and a ceiling", () => {
  it("waits a minimum, so a warm refresh is one movement and not a flicker", () => {
    expect(SOURCE).toMatch(/FLOOR_MS\s*=\s*(\d+)/);
    const floor = Number(SOURCE.match(/FLOOR_MS\s*=\s*(\d+)/)![1]);
    expect(floor).toBeGreaterThan(0);
    // Long enough to read as deliberate, short enough that nobody is waiting on
    // it. Past about half a second a mask stops feeling like a transition.
    expect(floor).toBeLessThanOrEqual(400);
  });

  it("lifts on a hard ceiling no matter what the network is doing", () => {
    /**
     * The single most important property in the file. Every screen underneath has
     * its own skeleton, so hitting this costs a reader a plainer first frame; a
     * mask with no ceiling would cost them the app. One slow Catalyst read — and
     * they are full-table reads behind a concurrency limiter — would otherwise be
     * enough to hold someone behind a blank panel indefinitely.
     */
    expect(SOURCE).toMatch(/CEILING_MS\s*=\s*(\d+)/);
    const ceiling = Number(SOURCE.match(/CEILING_MS\s*=\s*(\d+)/)![1]);
    const floor = Number(SOURCE.match(/FLOOR_MS\s*=\s*(\d+)/)![1]);
    expect(Number.isFinite(ceiling)).toBe(true);
    expect(ceiling).toBeGreaterThan(floor);
    expect(ceiling).toBeLessThanOrEqual(2000);
  });

  it("arms the ceiling with a timer, not just a declaration", () => {
    // A constant nothing schedules is a comment. Both timers hang off the same
    // effect, so this also pins the floor.
    expect(SOURCE).toMatch(/setTimeout\(\s*leave\s*,\s*CEILING_MS\s*\)/);
    // Non-greedy across the whole call: the floor's callback contains its own
    // parentheses, so a [^)]* class stops inside setFloorElapsed(true).
    expect(SOURCE).toMatch(/setTimeout\([\s\S]*?FLOOR_MS\s*\)/);
  });

  it("keeps the fade constant and the stylesheet in step", () => {
    const fade = Number(SOURCE.match(/FADE_MS\s*=\s*(\d+)/)![1]);
    // A JS timer shorter than the CSS duration removes the node mid-fade; longer
    // leaves an invisible panel over the app swallowing nothing but time.
    expect(rule(".app-reveal")).toContain(`${fade}ms`);
  });
});

describe("the reveal cannot outlive a stalled query", () => {
  it("does not treat a quiet query cache as readiness on its own", () => {
    /**
     * `useIsFetching() === 0` is true at two moments and only the second means
     * anything — before the first query starts, and after the last one finishes.
     * The first zero arrives before the lazy shell chunk has downloaded, because
     * every query in this app lives inside that chunk. Lifting on it would reveal
     * an empty shell, which is the failure this whole component exists to prevent.
     */
    expect(SOURCE, "readiness must require having SEEN a fetch, not merely none now").toMatch(
      /sawFetching/,
    );
  });

  it("requires the quiet to persist, because it also goes quiet between waves", () => {
    /**
     * The correction the deployed measurement forced after the first version
     * shipped. The page loads in three waves — session, then role/lookups, then
     * the dashboard's twenty — and each wave is only mounted by the commit the
     * previous wave's data triggered. So the in-flight count returns to ZERO in
     * the gaps: measured at 479ms and 1292ms before the real 2047ms, with gaps of
     * 11ms and 22ms. `sawFetching` cannot catch those; it is already set.
     *
     * Without the debounce the mask lifted at 477ms onto a page that stayed on its
     * skeleton until 1658ms — the same bug this component exists to fix, wearing a
     * shorter coat.
     */
    expect(SOURCE).toMatch(/QUIET_MS\s*=\s*(\d+)/);
    const quiet = Number(SOURCE.match(/QUIET_MS\s*=\s*(\d+)/)![1]);
    // An order of magnitude above the observed 11-22ms wave gaps, and well inside
    // the ceiling so it can never be the thing that decides.
    expect(quiet).toBeGreaterThanOrEqual(100);
    const ceiling = Number(SOURCE.match(/CEILING_MS\s*=\s*(\d+)/)![1]);
    expect(quiet).toBeLessThan(ceiling / 2);

    // A new request must CANCEL the pending verdict, not race it.
    expect(SOURCE).toMatch(/setQuietHeld\(false\)/);
    expect(SOURCE).toMatch(/clearTimeout\(t\)/);
    expect(SOURCE).toMatch(/offline\s*\|\|\s*quietHeld/);
  });

  it("counts offline as settled rather than pending", () => {
    // use-auth-guard.ts makes the same call for the same reason: offline, the
    // session query is disabled and screens render from the service worker cache,
    // so no fetch ever starts. Without this the offline launch — the one case that
    // was ready immediately — would sit behind the panel until the ceiling.
    expect(SOURCE).toMatch(/navigator\.onLine/);
    expect(SOURCE).toMatch(/offline\s*\|\|/);
  });

  it("waits for fonts, so the page is not revealed mid-reflow", () => {
    expect(SOURCE).toMatch(/document\.fonts/);
    expect(SOURCE).toMatch(/fonts\.ready/);
  });

  it("cannot lift twice", () => {
    // leave() is reachable from the ceiling, the readiness effect and the exempt
    // path. Without the latch, a second call would re-enter the fade.
    expect(SOURCE).toMatch(/leftRef/);
  });
});

describe("the reveal stays off the routes it must not cover", () => {
  /**
   * Sliced to `];`, not to the first `]` — every pattern contains a `[/?]`
   * character class, so stopping at the first bracket would capture one and a bit
   * of the first route and quietly pass the "contains /login" assertions while
   * seeing none of the others.
   */
  const patterns = (() => {
    const start = ROUTES.indexOf("ROUTES_OUTSIDE_SHELL");
    expect(start, "ROUTES_OUTSIDE_SHELL should exist").toBeGreaterThan(-1);
    return ROUTES.slice(start, ROUTES.indexOf("];", start));
  })();

  it("never covers the Catalyst gateway's own documents", () => {
    /**
     * The embedded sign-in iframe, the logout bounce and password recovery all
     * live under these two prefixes, and the gateway answers them before this app
     * does. A full-screen panel over Zoho's document is the same mistake the
     * service worker's navigateFallbackDenylist exists to prevent, with the same
     * symptom: a sign-in form that is simply not there.
     */
    expect(patterns).toContain("/__catalyst");
    expect(patterns).toContain("/accounts");
  });

  it("never veils the sign-in page", () => {
    // Matters on the redirect path more than the direct one: a sessionless
    // refresh is sent here by useAuthGuard, and holding the mask through that
    // bounce would show a veiled sign-in form.
    expect(patterns).toContain("/login");
  });

  it("never waits on a session for the public share route", () => {
    // /share/:token resolves no session at all, so a contract that waits for one
    // would always run to the ceiling.
    expect(patterns).toContain("/share");
  });

  it("anchors every pattern and terminates it", () => {
    /**
     * Same two rules vite.config.ts's denylist states. Unanchored, /login would
     * also match /deals?ref=/login; unterminated, it would match a future
     * /logindiagnostics. Both fail open — the mask disappears from a route that
     * wanted it, or covers one that did not.
     */
    // Line-based rather than one regex over the whole block: these patterns are
    // themselves regex literals full of escaped slashes and character classes, and
    // a regex to parse them is where this guard would acquire its own bug.
    const literals = patterns
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("/^"));

    expect(literals.length, patterns).toBeGreaterThanOrEqual(4);
    for (const literal of literals) {
      expect(literal, literal).toContain("(?:[/?]|$)");
    }
  });

  it("decides once at mount, so a later navigation cannot resurrect it", () => {
    // This is a boot mask. Re-evaluating the exemption per navigation would drop
    // an opaque panel over the app when someone moves from /login into it.
    // `useState<...>(` — the generic sits between the name and the paren.
    expect(SOURCE).toMatch(/useState[^(]*\(\(\)\s*=>\s*isOutsideShell/);
  });

  it("still declares boot over on an exempt route", () => {
    // Otherwise data-app-ready is never set for the session, and the ambient
    // band tween stays disabled for someone who refreshed on /login.
    expect(SOURCE).toMatch(/phase === "gone"\)\s*leave\(\)/);
  });
});

describe("the reveal is painted so it cannot cost a layout pass", () => {
  it("fades opacity and nothing else", () => {
    // Compositor-only, deliberately: the fade lands on the frame where a page's
    // widgets have just committed, and a transition that reflows there would be
    // paid for exactly when there is least headroom.
    const transition = rule(".app-reveal").match(/transition:\s*([^;]+);/)![1];
    expect(transition).toContain("opacity");
    for (const layoutProperty of ["width", "height", "transform", "top", "left", "all"]) {
      expect(transition, `transition should not animate ${layoutProperty}`).not.toContain(
        layoutProperty,
      );
    }
  });

  it("paints the same token the body already carries", () => {
    // The panel's ARRIVAL has to stay invisible: index.html stamps theme and band
    // before first paint, so body is already this colour. Still true with the
    // phone lockup in it — the lockup is a mark and two lines of text on that same
    // ground, not a brand colour, and there is deliberately no sky gradient.
    expect(rule(".app-reveal")).toContain("hsl(var(--background))");
  });

  it("carries the phone lockup", () => {
    /**
     * This REVERSES an earlier rule in this file, which asserted the panel had no
     * children at all on the grounds that a logo inside a 250-1200ms window is a
     * flash rather than a signal. That reasoning held for the case it was written
     * against and does not hold for the one that turned up in measurement: on the
     * mobile Command screen the mask reliably runs to its full ceiling, because
     * the page has no data until ~2050ms. So the choice was never logo-versus-
     * nothing, it was logo-versus-a-second-of-flat-colour-on-every-refresh.
     *
     * Desktop keeps the original contract, which is what the gate below is for.
     */
    expect(SOURCE).toMatch(/className="app-reveal-lockup"/);
    expect(SOURCE).toContain("Enterprise Deal Commander");
    expect(SOURCE).toContain("Mobile Edition");
  });

  it("gates the lockup off desktop, where the mask is still invisible", () => {
    // Desktop reaches first content inside the floor, so it has nothing to cover
    // and nothing to brand. A CSS gate rather than useMediaQuery: this paints in
    // the same commit as the shell it covers, and a JS gate could disagree with
    // ShellGate on render #1 — the very mistake ShellGate's own comment warns
    // about when it picks useMediaQuery over useIsMobile.
    expect(mediaRule("(min-width: 768px)", ".app-reveal-lockup")).toContain("display: none");
    // 767/768 is the app's single "this is a phone" boundary.
    expect(APP).toContain("(max-width: 767px)");
  });

  it("draws the mark online and leaves it static offline", () => {
    // Conditional on knowing there is TIME for the draw, rather than a gamble on
    // how long the panel happens to live. Online the ceiling lifts the mask, so
    // ~1200ms is available; offline leave() fires at the 250ms floor, where a
    // draw would be cut about a quarter through — four petal outlines with no
    // fill, which reads as a rendering bug rather than an interrupted flourish.
    expect(SOURCE).toMatch(/<EdcLogoMark[^>]*animated=\{!offline\}/);
  });

  it("draws fast enough to finish inside the ceiling", () => {
    /**
     * The load-bearing arithmetic. The mark's last petal begins at DELAYS[3] and
     * its fill lands FILL_LAG + FILL_DUR later, so the sequence ends at
     * 1.62 + 0.72 + 0.7 = 3.04s at timeScale 1. Divided by this scale it must fit
     * inside CEILING_MS, or the mask lifts mid-draw.
     *
     * Read from edc-logo-mark.tsx rather than hardcoded: if someone retimes the
     * petals, this fails instead of silently shipping a cut-off mark.
     */
    const scale = Number(SOURCE.match(/MARK_TIME_SCALE\s*=\s*([\d.]+)/)![1]);
    const ceiling = Number(SOURCE.match(/CEILING_MS\s*=\s*(\d+)/)![1]);

    const mark = stripCodeComments(
      readFileSync(join(SRC, "components", "edc-logo-mark.tsx"), "utf8"),
    );
    const delays = JSON.parse(mark.match(/DELAYS\s*=\s*(\[[^\]]+\])/)![1]) as number[];
    const fillLag = Number(mark.match(/FILL_LAG\s*=\s*([\d.]+)/)![1]);
    const fillDur = Number(mark.match(/FILL_DUR\s*=\s*([\d.]+)/)![1]);
    const drawDur = Number(mark.match(/DRAW_DUR\s*=\s*([\d.]+)/)![1]);

    const last = delays[delays.length - 1];
    const sequenceMs = (Math.max(last + drawDur, last + fillLag + fillDur) / scale) * 1000;

    expect(sequenceMs, "the draw must complete before the mask lifts").toBeLessThan(ceiling);
    // And not so fast it reads as a pop rather than a draw.
    expect(sequenceMs).toBeGreaterThan(400);
  });

  it("is faster than BootSplash's scale, because its window is shorter", () => {
    // BootSplash has a 1450ms floor set to outlast the sequence; this has a
    // 1200ms ceiling. Borrowing 2.2 here would overrun it.
    const here = Number(SOURCE.match(/MARK_TIME_SCALE\s*=\s*([\d.]+)/)![1]);
    const splash = stripCodeComments(
      readFileSync(join(SRC, "mobile", "shell", "boot-splash.tsx"), "utf8"),
    );
    const there = Number(splash.match(/MARK_TIME_SCALE\s*=\s*([\d.]+)/)![1]);
    expect(here).toBeGreaterThan(there);
  });

  it("announces nothing, so the skeleton's live region is not talked over", () => {
    // MobileShellSkeleton owns the one "Loading Deal Commander…" announcement in
    // the whole boot stack. Words on screen do not change that: they are branding,
    // and the status is already being read.
    expect(SOURCE).toContain('aria-hidden="true"');
    expect(SOURCE).not.toContain('role="status"');
  });

  it("styles the lockup from root tokens, never the lazy .m-shell ones", () => {
    /**
     * mobile/styles/{tokens,type}.css are imported at the LAZY mobile chunk's
     * entry, so at this component's first paint `.m-display`, `.m-body`, `.m-muted`
     * and every `--m-*` token are undefined. Using them here would render unstyled
     * text on the one frame this component exists to control — and it would do it
     * silently, which is why this is asserted rather than commented.
     */
    expect(SOURCE).not.toMatch(/className="[^"]*\bm-(?:hero|display|body|muted)\b/);
    expect(rule(".app-reveal-sub")).toContain("hsl(var(--muted-foreground))");
  });

  it("keeps the lockup's type in step with the mobile ladder", () => {
    // .app-reveal-title mirrors .m-display and .app-reveal-sub mirrors .m-body,
    // with type.css owning the numbers. If the ladder moves and these do not, the
    // refresh surface and the launch splash stop being the same lockup.
    const ladder = readFileSync(join(SRC, "mobile", "styles", "type.css"), "utf8");
    const display = ladder.slice(ladder.indexOf(".m-display {"));
    const body = ladder.slice(ladder.indexOf(".m-body {"));

    for (const value of ["1.12", "660", "-0.028em"]) {
      expect(rule(".app-reveal-title"), `title should match .m-display's ${value}`).toContain(value);
      expect(display.slice(0, display.indexOf("}"))).toContain(value);
    }
    for (const value of ["1.5", "400", "-0.006em"]) {
      expect(rule(".app-reveal-sub"), `sub should match .m-body's ${value}`).toContain(value);
      expect(body.slice(0, body.indexOf("}"))).toContain(value);
    }
  });

  it("keeps the lockup visible under reduced motion, dropping only its entrance", () => {
    // That preference pre-elapses the floor but leaves the data contract and the
    // ceiling in place, so the mask still HOLDS — hiding the lockup would blank
    // exactly the case it helps.
    const reduced = mediaRule("(prefers-reduced-motion: reduce)", ".app-reveal-lockup");
    expect(reduced).toContain("animation: none");
    expect(reduced).not.toContain("display: none");
  });

  it("sits above every in-app overlay but below BootSplash and the Toaster", () => {
    /**
     * 95 is chosen against two neighbours, and both directions matter.
     *
     * Above the z-50 surfaces (dialogs, sheets, popovers, the desktop sidebar) so
     * a restored route with an open overlay is still covered. Below the z-[100]
     * pair: BootSplash must stay on top on a cold installed launch — that is what
     * lets these two coexist with no coordination code, since this panel's whole
     * fade then happens behind something opaque — and the Toaster must stay on top
     * so a real error raised during boot is readable.
     */
    const z = Number(rule(".app-reveal").match(/z-index:\s*(\d+)/)![1]);
    expect(z).toBeGreaterThan(50);
    expect(z).toBeLessThan(100);
  });

  it("stops swallowing input the moment the fade starts", () => {
    expect(rule(".app-reveal[data-leaving]")).toContain("pointer-events: none");
    expect(rule(".app-reveal[data-leaving]")).toContain("opacity: 0");
  });

  it("skips the fade under prefers-reduced-motion", () => {
    // The global clamp zeroes the duration anyway, so a clamped fade is a render
    // for no visible gain — and the floor has to be skipped explicitly or a
    // reduced-motion user waits behind a panel for nothing to happen.
    expect(SOURCE).toMatch(/prefersReducedMotion\(\)\s*\?\s*"gone"/);
    expect(SOURCE).toMatch(/useState\(\(\)\s*=>\s*prefersReducedMotion\(\)\)/);
  });
});

/**
 * The reservations that keep the masked window from hiding real instability.
 *
 * These exist because the mask made the shifts INVISIBLE without making them go
 * away, and an invisible shift is still recorded by the Core Web Vitals API and
 * still becomes visible the moment anything reveals earlier. Every number below was
 * measured on the deployed app at 390px, so a guard that only checked "some min-h
 * is present" would pass while the value drifted away from the thing it reserves.
 */
describe("layout reservations measured against the deployed app", () => {
  const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), "utf8");

  it("reserves the mobile verdict block's two slots", () => {
    // The block sits above everything on the phone, so its growth moves the whole
    // screen: measured 148px loading against 219px resolved. Greeting 56 -> 102,
    // verdict 48 -> 74.
    const verdict = read("mobile", "screens", "command", "verdict-block.tsx");
    expect(verdict).toContain("min-h-[102px]");
    expect(verdict).toContain("min-h-[74px]");
    // The gap has to belong to the wrapper, or it exists in only one state.
    expect(verdict).toMatch(/className="mt-5 min-h-\[74px\]"/);
  });

  it("gives the mobile needs list a count-independent box", () => {
    /**
     * A FIXED box, not a reservation, and the difference was measured the hard way.
     *
     * 112px per resolved row, 336px for the three rows the block is built around,
     * against a 92px placeholder — so it grew 244px on arrival. Reserving three
     * rows fixed that and created its mirror image: the row COUNT is unknown until
     * the data lands, and a run returning one row collapsed 336px to 112px and
     * yanked everything below it UP 224px. CLS did not improve.
     *
     * For a list of unknown length no placeholder height is correct, so the box
     * must not depend on the count. The loading and populated states have to sit
     * INSIDE it — if the empty-state branch came first in a plain ternary, the box
     * itself would be what moves.
     */
    const needs = read("mobile", "screens", "command", "needs-block.tsx");
    expect(needs).toContain("min-h-[336px]");
    expect(needs).toContain("h-28");
    // The empty state opts out: one sentence in a 336px frame reads as a failure.
    expect(needs).toMatch(/rows\.length === 0 && !loading/);
  });

  it("reserves the nav bar's subtitle line wherever it is data-driven", () => {
    /**
     * `subtitle === undefined` cannot distinguish "not yet" from "never", so this
     * is opt-in — and the opt-in is the part that rots. Any screen deriving its
     * subtitle from a query needs it, or its bar grows 20px on arrival and moves
     * everything below.
     */
    const navBar = read("mobile", "shell", "m-nav-bar.tsx");
    expect(navBar).toContain("reserveSubtitle");
    expect(navBar).toContain("min-h-[46px]");

    for (const screen of [
      ["mobile", "screens", "command", "command-screen.tsx"],
      ["mobile", "screens", "memory", "memory-screen.tsx"],
      ["mobile", "screens", "deals", "deals-screen.tsx"],
      // Covers every Intelligence lens in one place.
      ["mobile", "screens", "intelligence", "lens-screen.tsx"],
    ]) {
      expect(read(...screen), screen.join("/")).toContain("reserveSubtitle");
    }
  });

  it("reserves the desktop hero and daily bar too", () => {
    // The same class of bug on the other shell, and the same fix.
    expect(read("components", "dashboard", "dashboard-hero.tsx")).toContain("min-h-[88px]");
    const bar = read("components", "dashboard", "daily-bar", "daily-bar.tsx");
    expect(bar).toContain("min-h-[44px]");
    // Hidden rather than an empty pill when every segment legitimately renders
    // nothing, which is what makes reserving the height safe.
    expect(bar).toContain("empty:hidden");
  });
});

describe("one gate covers both shells", () => {
  it("is mounted once, inside the Router and the QueryClientProvider", () => {
    /**
     * Inside the Router because it reads the path for its exemptions, and
     * useLocation outside a Router has no base applied. Inside the
     * QueryClientProvider because useIsFetching is its readiness signal. Mounted
     * beside ShellGate rather than in either shell, so desktop and mobile inherit
     * it without knowing it exists.
     */
    expect(APP).toContain("<AppReveal />");
    expect(APP.match(/<AppReveal \/>/g)).toHaveLength(1);

    const router = APP.slice(APP.indexOf("<WouterRouter"), APP.indexOf("</WouterRouter>"));
    expect(router, "must be inside WouterRouter for useLocation to resolve").toContain(
      "<AppReveal />",
    );
    expect(router).toContain("<ShellGate />");
  });

  it("does not import the mobile chunk to coordinate with BootSplash", () => {
    // The z-order settles it (see above). Importing boot-splash.tsx or its
    // standalone helper here would pull the whole mobile chunk into the main
    // bundle so a laptop downloads the phone app to learn something it can infer.
    expect(SOURCE).not.toMatch(/from\s+["']@\/mobile/);
  });
});
