// Pure presentation logic for the Portfolio Risk Analysis page. No React/JSX so
// it stays node-testable under the app's environment:"node" vitest config,
// mirroring the risk-presentation.ts / close-timeline-model.ts split.
// NOTE: relative imports, not "@/" — vitest.config.ts is a standalone config
// with no resolve.alias, so a value import through "@/..." fails at test
// runtime even though tsc (which reads tsconfig `paths`) accepts it.
import { formatNum, round2 } from "../../lib/format";
import { RISK_LEVEL_CLASS, RISK_LEVEL_SHORT_LABEL, classifyRisk } from "../../lib/semantic-colors";

export type LiftDirection = "above" | "at" | "below";

export interface LiftPresentation {
  /** "1.8×" — the ratio with its × marker. Never a +/- sign: see below. */
  text: string;
  direction: LiftDirection;
  /** Tooltip / aria phrasing that names the baseline explicitly. */
  label: string;
}

/**
 * Lift is a RATIO whose baseline is 1, not 0 — an under-represented 0.5×
 * previously rendered "+0.5x" (portfolio.tsx) because the sign test was
 * `lift > 0`, which is true for every non-negative ratio. There is no
 * meaningful sign on a ratio, so none is printed; direction/label carry the
 * above/below-baseline meaning instead.
 *
 * Classification runs on the ROUNDED value the user actually sees, so a lift of
 * 1.004 can never render "1×" while claiming to be above baseline.
 */
export function liftPresentation(lift: unknown): LiftPresentation {
  const raw = Number(lift);
  const safe = Number.isFinite(raw) && raw >= 0 ? raw : 0;
  const shown = round2(safe);
  const direction: LiftDirection = shown > 1 ? "above" : shown < 1 ? "below" : "at";
  const text = `${formatNum(safe)}×`;
  const label =
    direction === "at"
      ? `${text} — exactly the portfolio-wide baseline rate`
      : `${text} the portfolio-wide baseline rate (${direction === "above" ? "over" : "under"}-represented)`;
  return { text, direction, label };
}

// riskScore bands mirror the PRD semantic ramp (and the Whitespace heatmap uses
// its own, separate attachBand ramp below — the two are NOT the same scale,
// don't conflate them). Tint stays low-opacity so it reads as data.
// Thresholds/labels come from the shared classifyRisk (0-25/26-50/51-75/76-100)
// so the heatmap can never drift from every other risk-level surface again.
// Moved here verbatim from portfolio-risk-heatmap.tsx.
export function riskBand(score: number): { cell: string; label: string } {
  const level = classifyRisk(score);
  return { cell: RISK_LEVEL_CLASS[level].cell, label: RISK_LEVEL_SHORT_LABEL[level] };
}

/**
 * Diversification reads "good when high": green when risk is well spread,
 * rose when concentrated. Moved from portfolio-summary-cards.tsx
 * (`diversificationAccent`) and RE-THRESHOLDED for the normalized index a
 * paired backend change (`diversificationIndex` in portfolio-metrics.ts)
 * introduced: `D = (1 - Σw²) × n/(n-1)`.
 *
 * The old thresholds (0.66/0.4) were tuned against the UN-normalized raw HHI,
 * whose ceiling is `1 - 1/n` — literally unreachable above 0.5 for a 2-cell
 * portfolio, so 0.66 was already broken (structurally, not just mistuned).
 * The new normalized metric is a true [0,1] evenness measure independent of
 * cell count, which is what makes a FIXED threshold legitimate for the first
 * time — but the whole scale also shifted up (×2.0 at n=2, ×1.33 at n=4), so
 * the numbers must move up with it, not just become "valid".
 *
 * 0.85/0.6 map to a statement that is most precise at LARGER n and only
 * asymptotically approaches "no single cell holds much more than ~40% of
 * correlated risk" as n grows — the exact top-cell percentage a given D
 * implies shifts with cell count n (e.g. D >= 0.85 corresponds to a top cell
 * of <=69% at n=2, <=59% at n=3, tightening toward ~40% only for larger n), so
 * read "~40%" as the asymptotic story, not an exact claim at every n. The
 * ORDERING and the concentrated-vs-spread verdict still hold at every n:
 * >=0.85 (genuinely spread) > 0.60-0.85 (a real hotspot, roughly half to
 * two-thirds concentrated in one cell) > <0.60 (concentrated, two-thirds or
 * more in one cell). At the OLD 0.66/0.4 thresholds, a single cell holding
 * 50% of all risk would have read GREEN (D ≈ 0.78-0.89 under the new formula)
 * — backwards for a metric whose entire job is flagging concentration.
 *
 * Non-finite (NaN/Infinity) coerces to the ROSE branch, not a thrown error or
 * a default green: the normalized formula divides by (n-1) and is
 * undefined/degenerate for a single-cell portfolio if the server doesn't
 * special-case it, and `Infinity >= 0.85` would otherwise paint the single
 * most concentrated portfolio possible green. This mirrors formatNum's own
 * `Number(n) || 0` coercion so the accent can never disagree with the number
 * printed next to it.
 */
export function diversificationBand(d: unknown): string {
  const v = Number(d);
  const safe = Number.isFinite(v) ? v : 0;
  if (safe >= 0.85) return "text-emerald-600 dark:text-emerald-400";
  if (safe >= 0.6) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

/**
 * Attach % → border + tint. Low attach = whitespace opportunity (warm), high
 * = cool/calm — high attach paints emerald here, which is one of this app's
 * permitted "unrelated good meanings" (score bands, velocity, attach rate)
 * that stay emerald even though semantic-colors.ts reserves emerald for "won"
 * on risk/health/outcome surfaces specifically (see that file's own header
 * comment) — this is a DIFFERENT axis (attach rate, not risk/health/outcome),
 * so it is exempt, not an inconsistency to "fix" in a future palette sweep.
 * Moved verbatim from product-mix-section.tsx (`heatClasses`).
 */
export function attachBand(attachPct: number): string {
  if (attachPct >= 0.6)
    return "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/15";
  if (attachPct >= 0.3)
    return "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15";
  if (attachPct > 0)
    return "border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/15";
  return "border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15";
}

export const MAX_CORRELATION_BADGES = 3;

/**
 * Splits a correlation-code list into what to render inline vs. what to
 * collapse behind a "+N" overflow badge — the raw `alertCorrelations` array
 * from the API has no upper bound, and rendering one badge per code with no
 * cap can blow out a table cell. Cap of 3 follows the existing precedent in
 * components/autopsy/loss-risk-panel.tsx.
 */
export function splitCorrelations<T extends { code: string }>(
  list: T[] | undefined,
  max: number = MAX_CORRELATION_BADGES,
): { shown: T[]; hiddenCount: number; hiddenCodes: string[] } {
  const all = list ?? [];
  const shown = all.slice(0, max);
  const hidden = all.slice(max);
  return { shown, hiddenCount: hidden.length, hiddenCodes: hidden.map((c) => c.code) };
}
