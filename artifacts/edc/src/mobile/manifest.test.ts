import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeRosterUrl } from "../components/roster/model/roster-url";
import { MOBILE_ROUTES, matchesPattern } from "./nav/routes";

/**
 * The PWA manifest lives inside `vite.config.ts`, which cannot be imported here
 * — it throws unless PORT and BASE_PATH are set, which is the whole reason this
 * package has a standalone vitest config. So it is read as text.
 *
 * That is enough for the question being asked: what URLs does the installed app
 * offer, and does the app still understand them?
 */
const CONFIG = readFileSync(join(import.meta.dirname, "..", "..", "vite.config.ts"), "utf8");

/**
 * Every `url:` inside the manifest's `shortcuts` array.
 *
 * The array is found by BALANCED BRACKETS rather than by scanning to the next
 * `icons:`. The first draft did the latter and stopped at the `icons:` nested
 * inside the first shortcut — so it read one URL out of four and would have
 * declared three broken shortcuts fine. The count tripwire below caught it,
 * which is exactly what that assertion is for.
 */
function shortcutUrls(): string[] {
  const marker = CONFIG.indexOf("shortcuts:");
  expect(marker, "the manifest no longer declares shortcuts").toBeGreaterThan(-1);

  const open = CONFIG.indexOf("[", marker);
  expect(open, "shortcuts is no longer an array").toBeGreaterThan(-1);

  let depth = 0;
  let close = -1;
  for (let i = open; i < CONFIG.length; i++) {
    if (CONFIG[i] === "[") depth++;
    else if (CONFIG[i] === "]") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  expect(close, "the shortcuts array is unbalanced").toBeGreaterThan(open);

  const block = CONFIG.slice(open, close);
  return [...block.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("manifest shortcuts", () => {
  it("declares some", () => {
    // The tripwire every scan-based suite here carries: a regex that matched
    // nothing would make every assertion below vacuously true.
    expect(shortcutUrls().length).toBeGreaterThanOrEqual(3);
  });

  it("points at routes the shell actually has", () => {
    for (const url of shortcutUrls()) {
      // Manifest URLs are relative to the manifest, so they carry no leading
      // slash. The router sees them with one.
      const path = `/${url.split("?")[0]}`;
      const claimed = MOBILE_ROUTES.some((route) => matchesPattern(route.pattern, path));
      expect(claimed, `${url} resolves to no mobile route`).toBe(true);
    }
  });

  it("uses query keys the Deals screen can actually decode", () => {
    /**
     * The regression this exists for.
     *
     * The Red alerts shortcut read `?filter=critical` — a key the old hand-rolled
     * segment filter understood. When Deals moved onto `roster-url.ts` as its
     * source of truth, `decodeRosterUrl` began dropping that key silently, as a
     * decoder should, and the shortcut started opening the whole pipeline while
     * still calling itself "Red alerts". Nothing threw. Nothing logged.
     *
     * So: every shortcut carrying a query must decode to a view that is
     * genuinely narrower than the default.
     */
    for (const url of shortcutUrls()) {
      const [path, query] = url.split("?");
      if (!query) continue;
      expect(path, `${url} carries a query but is not a deals link`).toBe("deals");

      const { view } = decodeRosterUrl(query);
      const narrowed =
        view.filters.health.length > 0 ||
        view.filters.velocity.length > 0 ||
        view.filters.stage.length > 0 ||
        view.filters.closePreset !== "any" ||
        view.filters.tcvMin != null ||
        view.filters.scoreMin != null;

      expect(narrowed, `${url} decodes to an unfiltered list`).toBe(true);
    }
  });

  it("keeps every key it writes, rather than losing some to the decoder", () => {
    // A shortcut with two keys where only one survives is half-broken in the
    // same silent way — the sort would be dropped while the filter held.
    for (const url of shortcutUrls()) {
      const query = url.split("?")[1];
      if (!query) continue;
      const written = new URLSearchParams(query);
      const { view } = decodeRosterUrl(query);

      if (written.has("h")) expect(view.filters.health, url).not.toHaveLength(0);
      if (written.has("close")) expect(view.filters.closePreset, url).not.toBe("any");
      if (written.has("so")) expect(view.sort.length, url).toBeGreaterThan(0);
      if (written.has("v")) expect(view.filters.velocity, url).not.toHaveLength(0);
      if (written.has("g")) expect(view.group, url).not.toBe("none");
    }
  });
});

describe("the installed app's identity", () => {
  it("keeps a stable manifest id, so an install is never orphaned", () => {
    // Changing `id` registers as a different app and strands existing installs
    // on an icon that no longer updates.
    expect(CONFIG).toMatch(/id:\s*"\/"/);
  });

  it("still denies the Catalyst auth paths from the navigation fallback", () => {
    // Not decoration: navigateFallback serving index.html for these is what
    // broke Catalyst embedded sign-in, and the app cannot be logged into at all
    // when it regresses.
    for (const path of ["/api", "/accounts", "/__catalyst", "/baas"]) {
      expect(CONFIG.includes(path), `${path} is no longer denied`).toBe(true);
    }
  });
});
