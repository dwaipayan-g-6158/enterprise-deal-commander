/**
 * Dynamic Type.
 *
 * Every size in the mobile shell is a fixed `rem`, and iOS Safari does not
 * scale `rem` with the system text size — so a reader who has turned text up
 * in Settings got nothing at all from an app that is otherwise built for
 * their thumb. That is the single largest accessibility gap in the shell.
 *
 * There is no API for the setting, but `font: -apple-system-body` resolves to
 * the user's own body size, so a throwaway probe reports it. Measured against
 * iOS's 17px default, the ratio drives `--m-type-scale`, which the six type
 * styles multiply through.
 *
 * Everywhere else the probe resolves to something near the default and this
 * is a no-op, which is the intent — it is not a zoom control, it is one
 * platform's setting being honoured.
 */

/** iOS's default `.body` size. The ratio is measured against this. */
const BASELINE_PX = 17;

/**
 * Bounds. The floor allows a reader who has turned text *down* to get some of
 * that back without dropping the 13px caption under 12. The ceiling is where
 * the tab bar's four labels stop fitting across 375px — past that the layout
 * breaks rather than adapting, and a broken layout serves nobody.
 */
const MIN_SCALE = 0.92;
const MAX_SCALE = 1.35;

const PROPERTY = "--m-type-scale";

/**
 * A size the probe could never legitimately report. Set before the shorthand
 * so that on an engine which does not know `-apple-system-body` — where the
 * whole declaration is simply dropped — the sentinel survives and says so.
 *
 * This guard is the difference between a no-op and a bug: without it every
 * non-Apple browser fell back to its 16px default, measured 16/17, and
 * quietly shrank the entire interface by 6%. Caught by the contrast audit,
 * which reported 13px captions rendering at 12.
 */
const SENTINEL_PX = 1;

/** Reads the platform's body size and returns it as a clamped ratio. */
export function measureTypeScale(): number {
  if (typeof document === "undefined") return 1;
  if (typeof CSS !== "undefined" && !CSS.supports("font", "-apple-system-body")) return 1;

  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  // `font` shorthand, not `font-family`: the system keyword only carries a
  // size when it is set as the whole font. It comes last so that where it is
  // understood it overrides the sentinel, and where it is not, it doesn't.
  probe.style.cssText =
    `position:absolute;top:-9999px;left:-9999px;visibility:hidden;` +
    `font-size:${SENTINEL_PX}px;font:-apple-system-body;`;
  document.body.appendChild(probe);
  const px = Number.parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();

  if (!Number.isFinite(px) || px <= SENTINEL_PX * 4) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, px / BASELINE_PX));
}

/** Publishes the ratio for the stylesheet. Returns the value it wrote. */
export function applyTypeScale(): number {
  const scale = measureTypeScale();
  document.documentElement.style.setProperty(PROPERTY, String(scale));
  return scale;
}
