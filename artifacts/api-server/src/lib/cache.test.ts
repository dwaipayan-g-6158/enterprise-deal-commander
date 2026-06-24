import { describe, it, expect, beforeEach } from "vitest";
import { InProcessCache } from "./cache";

describe("InProcessCache", () => {
  let cache: InProcessCache;

  beforeEach(() => {
    cache = new InProcessCache();
  });

  it("returns a cached value on hit and runs the producer only on miss", async () => {
    let calls = 0;
    const producer = async () => {
      calls++;
      return "value";
    };

    expect(await cache.wrap("k", 1000, producer)).toBe("value");
    expect(await cache.wrap("k", 1000, producer)).toBe("value");
    expect(calls).toBe(1);
  });

  it("expires entries after their TTL", async () => {
    cache.set("k", "v", 5);
    expect(cache.get("k")).toBe("v");
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get("k")).toBeUndefined();
  });

  it("invalidatePrefix removes every key under the prefix and reports the count", () => {
    cache.set("intel:a", 1);
    cache.set("intel:b", 2);
    cache.set("summary:x", 3);
    const removed = cache.invalidatePrefix("intel:");
    expect(removed).toBe(2);
    expect(cache.get("intel:a")).toBeUndefined();
    expect(cache.get("intel:b")).toBeUndefined();
    expect(cache.get("summary:x")).toBe(3);
  });

  describe("wrap() generation guard", () => {
    it("refuses to cache a value produced across an intervening invalidation", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      // Start a wrap whose producer is still in flight.
      const inflight = cache.wrap("intel:deal-1", 1000, async () => {
        await gate;
        return "stale-snapshot";
      });

      // A concurrent mutation invalidates the key while the producer runs.
      cache.delete("intel:deal-1");

      // Let the producer finish and resolve.
      release();
      expect(await inflight).toBe("stale-snapshot");

      // The guard must have discarded the now-stale result instead of caching
      // it: the next read is a miss and re-runs the producer.
      let recomputed = false;
      const fresh = await cache.wrap("intel:deal-1", 1000, async () => {
        recomputed = true;
        return "fresh";
      });
      expect(recomputed).toBe(true);
      expect(fresh).toBe("fresh");
    });

    it("also discards values invalidated via invalidatePrefix mid-flight", async () => {
      // Establish generation tracking for the key (as a prior invalidation
      // would). The prefix guard can then detect the intervening invalidation.
      cache.delete("summary:portfolio");

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      const inflight = cache.wrap("summary:portfolio", 1000, async () => {
        await gate;
        return "stale";
      });
      cache.invalidatePrefix("summary:");
      release();
      await inflight;

      expect(cache.get("summary:portfolio")).toBeUndefined();
    });

    it("caches normally when no invalidation happens during production", async () => {
      const value = await cache.wrap("intel:deal-2", 1000, async () => "ok");
      expect(value).toBe("ok");
      // No producer runs on the second call -> served from cache.
      const second = await cache.wrap("intel:deal-2", 1000, async () => {
        throw new Error("should not run");
      });
      expect(second).toBe("ok");
    });
  });
});
