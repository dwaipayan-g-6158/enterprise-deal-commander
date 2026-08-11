/**
 * What the shell's live strip is saying, if anything.
 *
 * Pure and clock-injected, so every boundary is testable without timers and the
 * caller cannot disagree with it about which clock is in use — the same shape
 * write/undo.ts uses for the undo window.
 */

export type LiveStatus = "offline" | "saving" | "saved";

/**
 * How long a confirmation stays up.
 *
 * Long enough to be read on a phone held at arm's length, short enough that it
 * is gone before the next tap. Two seconds tested as too long: the strip was
 * still up when the thumb reached the next control, so it read as a stuck
 * status rather than as a reply to the last one.
 */
export const SAVED_VISIBLE_MS = 1800;

export interface LiveStatusInput {
  /**
   * From `navigator.onLine`, which reports whether an interface is up rather
   * than whether anything is reachable — it is true on a captive portal and in
   * a lift. That is tolerable HERE and not in write-outcome.ts, because this
   * strip is ambient context about what you are reading ("last-synced data"),
   * not a verdict on whether a write landed. A write's own offline detection
   * still comes from the shape of the failure.
   */
  offline: boolean;
  /** Any mobile write in flight. */
  writing: boolean;
  /** When a write last SUCCEEDED, in the caller's clock. Null before the first. */
  savedAt: number | null;
  now: number;
}

/**
 * Offline outranks saving, and saving outranks saved.
 *
 * Offline first because "Saving…" over a dead connection is a promise the write
 * layer deliberately refuses to make — `MOBILE_WRITE_OPTIONS` sets
 * `networkMode: "always"` precisely so a write REJECTS instead of queueing, and
 * the copy everywhere else says "not saved" rather than "queued". Saving over
 * saved because a new action supersedes the confirmation of the last one.
 */
export function liveStatus({ offline, writing, savedAt, now }: LiveStatusInput): LiveStatus | null {
  if (offline) return "offline";
  if (writing) return "saving";
  if (savedAt !== null && now - savedAt < SAVED_VISIBLE_MS) return "saved";
  return null;
}

/**
 * How long until the strip would change on its own, or null if nothing is
 * pending. Lets the component schedule exactly one timeout instead of polling.
 */
export function msUntilIdle({ offline, writing, savedAt, now }: LiveStatusInput): number | null {
  if (offline || writing || savedAt === null) return null;
  const left = SAVED_VISIBLE_MS - (now - savedAt);
  return left > 0 ? left : null;
}
