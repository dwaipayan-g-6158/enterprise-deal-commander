/**
 * Scrubbing: turning a finger position into a selected index, with detents.
 *
 * The pure half of the gesture, split out from the pointer plumbing so it can be
 * tested. `trajectory-scrubber.tsx` proved the interaction; this generalises it
 * for the whole chart kit.
 */

/**
 * Minimum gap between haptic pulses.
 *
 * A fast scrub across thirty bars crosses thirty detents in well under a second.
 * Firing on each one is not feedback, it is a buzz — and on a device where the
 * haptic is a no-op (iOS closed the side channel; see lib/haptics.ts) it is
 * invisible in review and unbearable on hardware.
 */
export const HAPTIC_MIN_INTERVAL_MS = 60;

/**
 * Which index a fraction of the track selects.
 *
 * Rounds to the NEAREST index rather than flooring, so each index owns the half
 * step either side of its centre. Flooring gives the last item a half-width
 * target and makes the end of any chart feel unreachable.
 */
export function indexAt(fraction: number, count: number): number {
  if (count <= 0) return 0;
  const clamped = Math.max(0, Math.min(1, fraction));
  return Math.max(0, Math.min(count - 1, Math.round(clamped * (count - 1))));
}

/** Fraction of the track a pointer sits at, given the element's box. */
export function fractionAt(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

/** The centre of an index's detent, as a fraction of the track. */
export function detentFor(index: number, count: number): number {
  if (count <= 1) return 0.5;
  return index / (count - 1);
}

/**
 * Whether a haptic should fire for this crossing.
 *
 * Pure so the rate limit is testable: it takes the clock rather than reading it,
 * which also keeps the caller honest about which timestamp it is using.
 */
export function shouldHaptic(
  previousIndex: number | null,
  nextIndex: number,
  lastFiredAt: number | null,
  now: number,
): boolean {
  if (previousIndex === nextIndex) return false;
  if (lastFiredAt == null) return true;
  return now - lastFiredAt >= HAPTIC_MIN_INTERVAL_MS;
}

/**
 * Keyboard equivalent of the gesture.
 *
 * A scrubber is a slider, and a slider that only responds to a finger excludes
 * every keyboard and switch user. Returns null for keys it does not handle so
 * the caller knows whether to preventDefault.
 */
export function indexForKey(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return Math.min(count - 1, current + 1);
    case "ArrowLeft":
    case "ArrowDown":
      return Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return Math.max(0, count - 1);
    case "PageUp":
      return Math.min(count - 1, current + Math.max(1, Math.round(count / 10)));
    case "PageDown":
      return Math.max(0, current - Math.max(1, Math.round(count / 10)));
    default:
      return null;
  }
}
