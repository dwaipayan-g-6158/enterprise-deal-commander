import { cn } from "@/lib/utils";
import { funnelGeometry } from "@/mobile/charts/chart-geometry";
import { seriesPaint, type ChartPaint } from "@/mobile/charts/chart-colors";
import { haptic } from "@/mobile/lib/haptics";

export interface FunnelRow {
  label: string;
  value: number;
  paint?: ChartPaint;
}

/**
 * A funnel as a stepped bar cascade.
 *
 * Not a trapezoid, and that is a legibility decision rather than a stylistic
 * one. A drawn trapezoid encodes the same number twice — the width AND the slope
 * between widths — and at phone scale the slope is what people actually read,
 * which makes small drops look dramatic and large ones look gentle. Plain bars
 * let the receding right edge BE the funnel shape while each row stays something
 * you can compare honestly against the row above it.
 *
 * Built as HTML rather than SVG: each row is a real button with a real 48px
 * target, the labels wrap and truncate with the browser's own typography, and
 * nothing needs a non-scaling-stroke.
 *
 * The drop between steps is stated in words on the row it belongs to. A funnel
 * whose conversion rates live in a separate legend makes the reader do the
 * subtraction that is the entire point of the chart.
 */
export function MFunnel({
  rows,
  format,
  onSelect,
  className,
}: {
  rows: FunnelRow[];
  format: (value: number) => string;
  /** Tapping a stage — usually opens that stage's deals in a sheet. */
  onSelect?: (row: FunnelRow, index: number) => void;
  className?: string;
}) {
  const steps = funnelGeometry(rows);
  if (steps.length === 0) return null;

  return (
    <ol className={cn("space-y-2", className)}>
      {steps.map((step, i) => {
        const paint = rows[i].paint ?? seriesPaint(0);
        const interactive = onSelect != null;

        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="m-label min-w-0 truncate">{step.label}</span>
              <span className="m-caption m-num shrink-0">
                {format(step.value)}
                {i > 0 ? (
                  <span className="m-muted"> · {Math.round(step.ofFirst * 100)}%</span>
                ) : null}
              </span>
            </div>

            {/* The track is full width; the fill recedes. Reading the remaining
                track is how the eye gets the funnel without a drawn slope. */}
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-[var(--m-dur-move)] ease-[var(--m-ease-standard)]"
                style={{
                  width: `${step.widthPct * 100}%`,
                  backgroundColor: paint.fill,
                  boxShadow: `inset 0 0 0 1.5px ${paint.stroke}`,
                }}
              />
            </div>

            {step.dropPct != null && step.dropPct > 0 ? (
              <p className="m-caption m-muted mt-1">
                {Math.round(step.dropPct * 100)}% did not reach this stage
              </p>
            ) : null}
          </>
        );

        return (
          <li key={step.label}>
            {interactive ? (
              <button
                type="button"
                onClick={() => {
                  haptic();
                  onSelect(rows[i], i);
                }}
                className="m-press m-tap w-full rounded-lg px-1 py-1 text-left"
              >
                {content}
              </button>
            ) : (
              <div className="px-1 py-1">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
