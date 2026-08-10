/**
 * Which archived deals are selected for comparison.
 *
 * ## Module scope, not component state
 *
 * The selection has to survive the push into `/memory/compare` and the trip back
 * — and on this shell a navigation unmounts the screen, so component state would
 * lose it in both directions. A store outside React is the smallest thing that
 * works; the alternative is a context provider wrapping the whole shell for a
 * feature that lives on one tab.
 *
 * The comparison URL carries the ids too, so a comparison stays shareable. This
 * is what the root reads to know which cards are ticked.
 */

/** Four columns is what a phone can page through before it stops being a comparison. */
export const MAX_COMPARE = 4;

/** At least two, or there is nothing to compare against. */
export const MIN_COMPARE = 2;

let selected: string[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeCompare(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function compareSelection(): string[] {
  return selected;
}

/**
 * Toggle an id in or out.
 *
 * Adding past the cap is a NO-OP rather than an eviction. Silently dropping the
 * first pick to make room for a fifth is the kind of thing that makes someone
 * think the app lost their selection.
 */
export function toggleCompare(id: string): void {
  selected = nextSelection(selected, id);
  emit();
}

export function clearCompare(): void {
  if (selected.length === 0) return;
  selected = [];
  emit();
}

/** Adopt a selection from a URL, so a shared comparison ticks the right cards. */
export function adoptCompare(ids: string[]): void {
  const deduped = [...new Set(ids.filter(Boolean))].slice(0, MAX_COMPARE);
  if (deduped.length === selected.length && deduped.every((id, i) => id === selected[i])) return;
  selected = deduped;
  emit();
}

/** The pure transition, exported so the cap and the ordering are testable. */
export function nextSelection(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((v) => v !== id);
  if (current.length >= MAX_COMPARE) return current;
  return [...current, id];
}

export function canCompare(ids: string[]): boolean {
  return ids.length >= MIN_COMPARE;
}

/** The `?ids=` value the comparison screen reads. */
export function encodeCompare(ids: string[]): string {
  return ids.join(",");
}

export function decodeCompare(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_COMPARE);
}
