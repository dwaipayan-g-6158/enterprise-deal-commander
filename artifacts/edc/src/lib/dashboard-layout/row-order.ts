/**
 * Lightweight manual dashboard layout control (PRD 4.8, descoped from the
 * PRD's literal behavioral auto-adapt engine — see the design spec). The 9
 * ids below are the dashboard's structural rows in their shipped order;
 * `pages/dashboard.tsx` maps each id to its JSX at render time. Nothing ever
 * reorders itself — this only ever changes when the commander clicks an
 * up/down control.
 */

import type { KeyValueStore } from "@/lib/storage";

const ROW_ORDER_KEY = "edc.dashboard.rowOrder";

export const DEFAULT_ROW_ORDER: string[] = [
  "vital-signs",
  "health-risk-alerts",
  "actions-forecast",
  "stage-gate-funnel",
  "deal-roster",
  "close-timeline-activity",
  "velocity-competitive",
  "simulation-band",
  "memory-insights",
];

function isValidPermutation(candidate: unknown): candidate is string[] {
  if (!Array.isArray(candidate)) return false;
  if (candidate.length !== DEFAULT_ROW_ORDER.length) return false;
  if (!candidate.every((id) => typeof id === "string")) return false;
  const candidateSet = new Set(candidate);
  if (candidateSet.size !== candidate.length) return false; // no duplicates
  const defaultSet = new Set(DEFAULT_ROW_ORDER);
  return candidate.every((id) => defaultSet.has(id));
}

/** Reads the stored row order, falling back to the default on any drift (added/removed/renamed row, corrupt storage). Never throws. */
export function getRowOrder(store: KeyValueStore): string[] {
  let raw: string | null;
  try {
    raw = store.getItem(ROW_ORDER_KEY);
  } catch {
    return DEFAULT_ROW_ORDER;
  }
  if (!raw) return DEFAULT_ROW_ORDER;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_ROW_ORDER;
  }
  return isValidPermutation(parsed) ? parsed : DEFAULT_ROW_ORDER;
}

/** Persists a row order. Never throws. */
export function saveRowOrder(store: KeyValueStore, order: string[]): void {
  try {
    store.setItem(ROW_ORDER_KEY, JSON.stringify(order));
  } catch {
    // localStorage full/unavailable — the reorder just won't persist this round.
  }
}

/** Pure array reorder; no-ops if `id` is missing or already at the requested boundary. */
export function moveRow(order: string[], id: string, direction: "up" | "down"): string[] {
  const index = order.indexOf(id);
  if (index === -1) return order;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= order.length) return order;
  const next = [...order];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

/** Clears the stored override, reverting to the default order. Never throws. */
export function resetRowOrder(store: KeyValueStore): void {
  try {
    store.setItem(ROW_ORDER_KEY, JSON.stringify(DEFAULT_ROW_ORDER));
  } catch {
    // localStorage full/unavailable — the reset just won't persist this round.
  }
}
