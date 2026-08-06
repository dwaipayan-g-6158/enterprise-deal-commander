// Tests for the Data Store access layer's request-scoped read cache, its
// concurrency limiter, and its error-shape handling (lib/db/src/catalyst/sdk.ts).
//
// These are worth having as real (not skipped) tests even though the rest of
// the Catalyst migration can only be verified against the deployed app: none of
// this needs a live Data Store. `fetchAllRows` and friends reach the platform
// only through `catalystApp.datastore().table(name)`, so a hand-rolled fake app
// exercises the whole path — which is the same reason these behaviors were
// invisible until production: nothing local ever ran them.
//
// Every behavior below was written against a live-confirmed platform fact:
//   {statusCode: 429, code: "TOO_MANY_REQUESTS",
//    message: "Concurrency limit reached for the feature COMPONENT"}
// returned as a PLAIN OBJECT, not an Error.

import { describe, it, expect } from "vitest";
import {
  fetchAllRows,
  insertRow,
  updateRow,
  deleteRow,
  isDuplicateValueError,
  catalystErrorInfo,
  type RawRow,
} from "@workspace/db/catalyst";

/** A rejection shaped exactly like the Node SDK's — a plain object, no Error. */
function sdkRejection(statusCode: number, code: string, message: string): unknown {
  return { statusCode, code, message };
}

interface FakeOptions {
  /** Rejections to throw (and consume) before the read finally succeeds. */
  failFirst?: unknown[];
  /** Resolve reads only when released, so overlap can be observed. */
  gate?: { promise: Promise<void> };
}

function makeFakeApp(rows: Record<string, RawRow[]>, opts: FakeOptions = {}) {
  const readCounts: Record<string, number> = {};
  const writeCounts: Record<string, number> = {};
  let concurrent = 0;
  let peakConcurrent = 0;
  const failures = [...(opts.failFirst ?? [])];

  const app = {
    datastore: () => ({
      table: (name: string) => ({
        async *getIterableRows() {
          readCounts[name] = (readCounts[name] ?? 0) + 1;
          concurrent++;
          peakConcurrent = Math.max(peakConcurrent, concurrent);
          try {
            if (opts.gate) await opts.gate.promise;
            const failure = failures.shift();
            if (failure) throw failure;
            for (const row of rows[name] ?? []) yield row;
          } finally {
            concurrent--;
          }
        },
        async insertRow(values: Record<string, unknown>) {
          writeCounts[name] = (writeCounts[name] ?? 0) + 1;
          const row = { ROWID: "1", ...values } as RawRow;
          (rows[name] ??= []).push(row);
          return row;
        },
        async updateRow(values: Record<string, unknown>) {
          writeCounts[name] = (writeCounts[name] ?? 0) + 1;
          return values as RawRow;
        },
        async deleteRow() {
          writeCounts[name] = (writeCounts[name] ?? 0) + 1;
        },
      }),
    }),
  };

  return {
    app,
    readCount: (t: string) => readCounts[t] ?? 0,
    writeCount: (t: string) => writeCounts[t] ?? 0,
    peak: () => peakConcurrent,
  };
}

describe("Data Store error shape", () => {
  // The regression that made four copies of isDuplicateValueError dead code.
  it("recognizes a duplicate-value rejection delivered as a plain object", () => {
    const err = sdkRejection(400, "DUPLICATE_VALUE", "Duplicate value found for the column");
    expect(err instanceof Error).toBe(false); // the trap, pinned
    expect(isDuplicateValueError(err)).toBe(true);
  });

  it("still recognizes one delivered as an Error", () => {
    expect(isDuplicateValueError(new Error("DUPLICATE_VALUE: name"))).toBe(true);
  });

  it("does not mistake an unrelated failure for a duplicate", () => {
    expect(isDuplicateValueError(sdkRejection(500, "INTERNAL", "boom"))).toBe(false);
    expect(isDuplicateValueError(null)).toBe(false);
  });

  it("normalizes code/statusCode off a plain-object rejection", () => {
    const info = catalystErrorInfo(
      sdkRejection(429, "TOO_MANY_REQUESTS", "Concurrency limit reached for the feature COMPONENT"),
    );
    expect(info).toEqual({
      statusCode: 429,
      code: "TOO_MANY_REQUESTS",
      message: "Concurrency limit reached for the feature COMPONENT",
    });
  });
});

describe("request-scoped read cache", () => {
  it("reads a table once per request no matter how many repos ask", async () => {
    const fake = makeFakeApp({ deals: [{ ROWID: "1", name: "a" }] });
    for (let i = 0; i < 5; i++) await fetchAllRows(fake.app, "deals");
    expect(fake.readCount("deals")).toBe(1);
  });

  it("collapses concurrent readers onto ONE in-flight read", async () => {
    // The stampede case: bounded-concurrency workers all start together, so
    // caching the resolved value (rather than the promise) would still let
    // every worker miss and issue its own read.
    let release!: () => void;
    const gate = { promise: new Promise<void>((r) => (release = r)) };
    const fake = makeFakeApp({ deals: [{ ROWID: "1" }] }, { gate });

    const all = Promise.all(Array.from({ length: 8 }, () => fetchAllRows(fake.app, "deals")));
    release();
    await all;

    expect(fake.readCount("deals")).toBe(1);
  });

  it("gives each caller its own array, so an in-place sort cannot leak", async () => {
    const fake = makeFakeApp({
      deals: [{ ROWID: "2", n: "b" }, { ROWID: "1", n: "a" }],
    });
    const first = await fetchAllRows(fake.app, "deals");
    first.sort((x, y) => x["n"]!.localeCompare(y["n"]!));
    const second = await fetchAllRows(fake.app, "deals");
    expect(second.map((r) => r["ROWID"])).toEqual(["2", "1"]);
  });

  it("scopes the cache to one app object, so requests never share reads", async () => {
    const rows = { deals: [{ ROWID: "1" }] };
    const a = makeFakeApp(rows);
    const b = makeFakeApp(rows);
    await fetchAllRows(a.app, "deals");
    await fetchAllRows(b.app, "deals");
    expect(a.readCount("deals")).toBe(1);
    expect(b.readCount("deals")).toBe(1);
  });

  it("does not memoize a failed read", async () => {
    const fake = makeFakeApp(
      { deals: [{ ROWID: "1" }] },
      { failFirst: [sdkRejection(500, "INTERNAL", "transient")] },
    );
    await expect(fetchAllRows(fake.app, "deals")).rejects.toBeTruthy();
    const rows = await fetchAllRows(fake.app, "deals");
    expect(rows).toHaveLength(1);
    expect(fake.readCount("deals")).toBe(2);
  });
});

describe("read-after-write within one request", () => {
  it.each([
    ["insertRow", (app: unknown) => insertRow(app, "deals", { name: "new" })],
    ["updateRow", (app: unknown) => updateRow(app, "deals", "1", { name: "edited" })],
    ["deleteRow", (app: unknown) => deleteRow(app, "deals", "1")],
  ])("%s invalidates the cached read", async (_label, write) => {
    const fake = makeFakeApp({ deals: [{ ROWID: "1", name: "old" }] });
    await fetchAllRows(fake.app, "deals");
    await write(fake.app);
    await fetchAllRows(fake.app, "deals");
    // Re-read rather than serving the pre-write snapshot.
    expect(fake.readCount("deals")).toBe(2);
  });

  it("only invalidates the table that was written", async () => {
    const fake = makeFakeApp({ deals: [{ ROWID: "1" }], stages: [{ ROWID: "1" }] });
    await fetchAllRows(fake.app, "deals");
    await fetchAllRows(fake.app, "stages");
    await insertRow(fake.app, "deals", { name: "x" });
    await fetchAllRows(fake.app, "deals");
    await fetchAllRows(fake.app, "stages");
    expect(fake.readCount("deals")).toBe(2);
    expect(fake.readCount("stages")).toBe(1);
  });
});

describe("concurrency limiting and 429 retry", () => {
  it("retries a 429 rejection instead of surfacing it as a 500", async () => {
    const fake = makeFakeApp(
      { deals: [{ ROWID: "1" }] },
      {
        failFirst: [
          sdkRejection(429, "TOO_MANY_REQUESTS", "Concurrency limit reached for the feature COMPONENT"),
          sdkRejection(429, "TOO_MANY_REQUESTS", "Concurrency limit reached for the feature COMPONENT"),
        ],
      },
    );
    const rows = await fetchAllRows(fake.app, "deals");
    expect(rows).toHaveLength(1);
    expect(fake.readCount("deals")).toBe(3);
  });

  it("does NOT retry a non-429 rejection", async () => {
    const fake = makeFakeApp(
      { deals: [] },
      { failFirst: [sdkRejection(400, "INVALID_INPUT", "bad column")] },
    );
    await expect(fetchAllRows(fake.app, "deals")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(fake.readCount("deals")).toBe(1);
  });

  it("holds every slot it is given, batch after batch", async () => {
    // The regression guard. A limiter that leaks its counter still satisfies
    // "never exceeds the cap" — it just degrades toward serial, which looks
    // like slowness rather than a bug. So assert the FLOOR too: once enough
    // work is queued, the cap should actually be saturated, and it should
    // still be saturated after many handoffs (the leak only shows up once
    // waiters have been woken repeatedly).
    const tables = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`t${i}`, [{ ROWID: "1" }]]),
    );
    const fake = makeFakeApp(tables);
    await Promise.all(Object.keys(tables).map((t) => fetchAllRows(fake.app, t)));
    expect(fake.peak()).toBe(6);

    // A second wave on a fresh app: if the process-wide counter had leaked
    // during the first wave, this one would run one-at-a-time.
    const second = makeFakeApp(
      Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`u${i}`, [{ ROWID: "1" }]])),
    );
    await Promise.all(
      Object.keys(tables).map((_, i) => fetchAllRows(second.app, `u${i}`)),
    );
    expect(second.peak()).toBe(6);
  });

  it("caps how many reads are in flight at once across distinct tables", async () => {
    // Distinct tables so the per-request cache can't do the limiting for us —
    // this has to be the semaphore.
    const tables = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`t${i}`, [{ ROWID: "1" }]]),
    );
    let release!: () => void;
    const gate = { promise: new Promise<void>((r) => (release = r)) };
    const fake = makeFakeApp(tables, { gate });

    const all = Promise.all(Object.keys(tables).map((t) => fetchAllRows(fake.app, t)));
    // Let the queue build up before letting any read finish.
    await new Promise((r) => setTimeout(r, 20));
    const peakWhileBlocked = fake.peak();
    release();
    await all;

    expect(peakWhileBlocked).toBeGreaterThan(0);
    expect(peakWhileBlocked).toBeLessThanOrEqual(6);
    expect(fake.peak()).toBeLessThanOrEqual(6);
  });
});
