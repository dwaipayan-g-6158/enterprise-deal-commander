import type { TimeBand } from "./time-bands";
import type { ShownEntry } from "./shown-history";

export interface GreetingEntry {
  id: string;
  hook: string | null;
  text: string;
}

export type GreetingPool = Record<TimeBand, GreetingEntry[]>;

export interface GreetingContext {
  namePart: string;
  procurementCount: number;
  closeThisWeekValueRaw: number;
  closeThisWeekValue: string;
  closeThisWeekCount: number;
  recentPhaseAdvanceCount: number;
  activeValidationValueRaw: number;
  activeValidationValue: string;
  overdueActionCount: number;
  oneStepFromCloseDealName?: string;
}

export const KNOWN_HOOKS = [
  "procurementCount",
  "closeThisWeekValue",
  "closeThisWeekCount",
  "recentPhaseAdvanceCount",
  "activeValidationValue",
  "overdueActionCount",
  "oneStepFromCloseDealName",
] as const;

type KnownHook = (typeof KNOWN_HOOKS)[number];

const HOOK_ELIGIBILITY: Record<KnownHook, (ctx: GreetingContext) => boolean> = {
  procurementCount: (c) => c.procurementCount > 0,
  closeThisWeekValue: (c) => c.closeThisWeekValueRaw > 0,
  closeThisWeekCount: (c) => c.closeThisWeekCount > 0,
  recentPhaseAdvanceCount: (c) => c.recentPhaseAdvanceCount > 0,
  activeValidationValue: (c) => c.activeValidationValueRaw > 0,
  overdueActionCount: (c) => c.overdueActionCount > 0,
  oneStepFromCloseDealName: (c) => !!c.oneStepFromCloseDealName,
};

const FALLBACK_GREETING = {
  id: "fallback",
  text: "Good day{{namePart}}. Let's see what's on deck today.",
};

function isEligible(entry: GreetingEntry, ctx: GreetingContext): boolean {
  if (entry.hook === null) return true;
  const check = HOOK_ELIGIBILITY[entry.hook as KnownHook];
  return check ? check(ctx) : false;
}

function interpolate(text: string, ctx: GreetingContext): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = (ctx as unknown as Record<string, unknown>)[key];
    return value != null ? String(value) : "";
  });
}

/**
 * Picks one greeting for the given band: filters to hook-eligible entries,
 * excludes ids shown in the last 48h (relaxing that filter only if it would
 * otherwise leave zero candidates), then interpolates the context values.
 */
export function selectGreeting(
  pool: GreetingPool,
  band: TimeBand,
  context: GreetingContext,
  shownHistory: ShownEntry[],
  random: () => number = Math.random,
): { id: string; text: string } {
  const bandEntries = pool[band] ?? [];
  const eligible = bandEntries.filter((e) => isEligible(e, context));
  if (eligible.length === 0) {
    return {
      id: FALLBACK_GREETING.id,
      text: interpolate(FALLBACK_GREETING.text, context),
    };
  }
  const shownIds = new Set(shownHistory.map((s) => s.id));
  const fresh = eligible.filter((e) => !shownIds.has(e.id));
  const candidates = fresh.length > 0 ? fresh : eligible;
  const chosen = candidates[Math.floor(random() * candidates.length)];
  return { id: chosen.id, text: interpolate(chosen.text, context) };
}
