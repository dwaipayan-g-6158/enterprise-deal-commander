import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "./lib/css-token-audit";
import { SRC } from "./mobile/module-graph";

/**
 * How the service worker is allowed to answer an API read.
 *
 * This exists because getting it wrong is invisible in every test that does not
 * involve a real service worker, and catastrophic in the app: the API-reads
 * bucket was `StaleWhileRevalidate`, which reverted the result of EVERY WRITE.
 *
 * The sequence, measured on the deployed build: a mutation succeeds, the client
 * invalidates and refetches the read it just changed, and SWR answers that
 * refetch from cache with the body from BEFORE the write. React Query commits
 * the stale value, the optimistic patch is undone on screen, and the background
 * revalidation arrives ~1.5s later with nothing left to trigger a re-render.
 * Asked twice at that instant, plainly and with a cache-buster, the same URL
 * returned `false` and `true`.
 *
 * Nothing about that is detectable from the client code, which is correct. It
 * lives entirely in one string in vite.config.ts, which is why it is asserted
 * here rather than trusted.
 */

const CONFIG = stripComments(readFileSync(join(SRC, "..", "vite.config.ts"), "utf8"));

/** The `{ ... }` following a cacheName, which is where its handler sits. */
function bucketFor(cacheName: string): string {
  const at = CONFIG.indexOf(`cacheName: "${cacheName}"`);
  expect(at, `no runtimeCaching entry names ${cacheName}`).toBeGreaterThan(-1);
  // Back up to the start of this entry, then take a window big enough to hold it.
  const start = CONFIG.lastIndexOf("{", CONFIG.lastIndexOf("handler", at));
  return CONFIG.slice(start, at + 600);
}

describe("API read caching", () => {
  it("answers reads from the network first, so a write cannot be reverted", () => {
    const bucket = bucketFor("edc-api-reads");
    expect(bucket).toMatch(/handler:\s*"NetworkFirst"/);
    expect(
      bucket,
      "StaleWhileRevalidate serves the pre-write body to the refetch that follows a write",
    ).not.toMatch(/handler:\s*"StaleWhileRevalidate"/);
  });

  it("still falls back to cache rather than hanging on a dead network", () => {
    // NetworkFirst without a timeout waits out the full fetch before reaching
    // for the cache, which on a stalled mobile connection is the whole point of
    // having one.
    expect(bucketFor("edc-api-reads")).toMatch(/networkTimeoutSeconds:\s*[1-9]/);
  });

  /**
   * The offline story is the only reason this bucket exists, so the cache has
   * to still be written and still be purged on sign-out.
   */
  it("keeps caching successful reads, and keeps the sign-out purge reachable", () => {
    expect(bucketFor("edc-api-reads")).toMatch(/cacheableResponse:\s*\{\s*statuses:\s*\[0,\s*200\]/);
    expect(CONFIG, "useSignOut purges caches whose key starts edc-api-").toMatch(
      /cacheName:\s*"edc-api-/,
    );
  });

  /**
   * Lookups are deliberately the exception, and the reason is which of them a
   * write can contradict — nothing in this app authors a stage or a gate
   * definition, so there is no write-then-read-your-own-write to get wrong.
   * Pinned so a future blanket change has to be a decision rather than a sweep.
   */
  it("leaves the lookups bucket on StaleWhileRevalidate", () => {
    expect(bucketFor("edc-api-lookups")).toMatch(/handler:\s*"StaleWhileRevalidate"/);
  });

  it("never serves auth from cache, which the offline session fallback depends on", () => {
    expect(CONFIG).toMatch(/!\/\\\/api\\\/v1\\\/auth\\\//);
  });
});
