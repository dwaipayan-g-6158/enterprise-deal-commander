import { logger } from "./logger";

/**
 * Swappable cache abstraction for the Phase 2 backbone.
 *
 * The default implementation is a simple in-process TTL map — adequate for a
 * single-process, single-commander deployment and required by the milestone
 * (no Redis dependency). The `Cache` interface is intentionally minimal and
 * backend-agnostic so it can later be swapped for Redis/Memcached without
 * touching call sites.
 *
 * Three usage tiers are expected:
 *   1. Lookup data (long TTL, rarely changes) — e.g. pipeline stages, catalog.
 *   2. Mutation-invalidated intelligence (assembled per deal; invalidated by
 *      the event bus when the deal/gates/blockers change).
 *   3. Short-TTL summaries (portfolio rollups) that may briefly serve stale.
 */
export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  /** Invalidate every key beginning with `prefix`. Returns count removed. */
  invalidatePrefix(prefix: string): number;
  clear(): void;
  /** Memoize an async producer under `key` with the given TTL. */
  wrap<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T>;
  stats(): { size: number; hits: number; misses: number };
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class InProcessCache implements Cache {
  private readonly store = new Map<string, Entry>();
  /**
   * Per-key generation counter, bumped on every invalidation (delete / prefix /
   * clear). `wrap()` captures the generation before running its producer and
   * refuses to write the result back if the generation advanced meanwhile — so
   * a read that started before a concurrent mutation can never repopulate a
   * stale value after the mutation invalidated it.
   */
  private readonly generations = new Map<string, number>();
  private hits = 0;
  private misses = 0;
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = 60_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  private bump(key: string): void {
    this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
    this.bump(key);
  }

  invalidatePrefix(prefix: string): number {
    let removed = 0;
    const keys = new Set<string>([
      ...this.store.keys(),
      ...this.generations.keys(),
    ]);
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        if (this.store.delete(key)) removed++;
        this.bump(key);
      }
    }
    return removed;
  }

  clear(): void {
    const keys = new Set<string>([
      ...this.store.keys(),
      ...this.generations.keys(),
    ]);
    this.store.clear();
    for (const key of keys) this.bump(key);
  }

  async wrap<T>(
    key: string,
    ttlMs: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const gen = this.generations.get(key) ?? 0;
    const value = await producer();
    // Only cache if no invalidation happened for this key while producing.
    if ((this.generations.get(key) ?? 0) === gen) {
      this.set(key, value, ttlMs);
    }
    return value;
  }

  stats() {
    return { size: this.store.size, hits: this.hits, misses: this.misses };
  }
}

/** Process-wide cache singleton. */
export const cache: Cache = new InProcessCache();

/** Cache key namespaces. Keep prefixes stable — invalidation matches on them. */
export const CacheKeys = {
  intelligencePrefix: "intel:",
  intelligence: (dealId: string) => `intel:${dealId}`,
  lookupPrefix: "lookup:",
  summaryPrefix: "summary:",
} as const;

/** TTLs (ms) per tier. */
export const CacheTtl = {
  intelligence: 30_000,
  lookup: 10 * 60_000,
  summary: 15_000,
} as const;

/** Invalidate all cached intelligence/summaries derived from a deal. */
export function invalidateDeal(dealId: string): void {
  cache.delete(CacheKeys.intelligence(dealId));
  cache.invalidatePrefix(CacheKeys.summaryPrefix);
  logger.debug({ dealId }, "Invalidated deal cache");
}
