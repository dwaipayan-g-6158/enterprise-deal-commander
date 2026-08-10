import { cn } from "@/lib/utils";
import {
  barRects,
  scaleFor,
  VIEW_H,
  VIEW_W,
  type Scale,
} from "@/mobile/charts/chart-geometry";
import { SEPARATOR, SEPARATOR_WIDTH, SHAPE_STROKE_WIDTH, seriesPaint, type ChartPaint } from "@/mobile/charts/chart-colors";
import { detentFor } from "@/mobile/charts/scrub-model";
import { useScrub } from "@/mobile/charts/use-scrub";

export interface BarDatum {
  label: string;
  value: number;
  /** Overrides the series colour — a per-bar risk or health paint. */
  paint?: ChartPaint;
}

/**
 * Bars with scrub-to-inspect.
 *
 * The kit's workhorse, and the first primitive built, because it is where the
 * scrub gesture proves itself — everything else reuses that interaction rather
 * than reinventing it.
 *
 * Also the answer to radar. A radar chart's enclosed area is an artefact of axis
 * ORDER, so reordering the axes changes the shape without changing a value;
 * sorted bars beat it on every task the risk panel supports, which is why this
 * takes `sorted` rather than radar taking a default.
 *
 * `role="slider"` is the honest ARIA for scrub-to-inspect: a value you move
 * through a range, with the readout as `aria-valuetext`. It is the pattern
 * trajectory-scrubber.tsx already proved on this codebase.
 */
export function MBars({
  data,
  zeroBased = true,
  format,
  label,
  height = 160,
  className,
}: {
  data: BarDatum[];
  /** Bars encode magnitude, so the axis starts at zero unless told otherwise. */
  zeroBased?: boolean;
  format: (value: number) => string;
  label: string;
  height?: number;
  className?: string;
}) {
  const values = data.map((d) => d.value);
  const scale: Scale = scaleFor(values, { zeroBased });
  const bars = barRects(values, scale);
  const { index, scrubbing, handlers } = useScrub(data.length);
  const active = index != null ? data[index] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, ...handlers.style }}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, data.length - 1)}
        aria-valuenow={index ?? 0}
        aria-valuetext={active ? `${active.label}, ${format(active.value)}` : label}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
        onKeyDown={handlers.onKeyDown}
        onBlur={handlers.onBlur}
      >
        {bars.map((bar, i) => {
          const paint = data[i].paint ?? seriesPaint(0);
          const isActive = i === index;
          return (
            <rect
              key={data[i].label}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={4}
              fill={paint.fill}
              stroke={paint.stroke}
              // Non-scaling, or the stretch that fits the viewBox to the device
              // would make vertical strokes thick and horizontal ones thin.
              vectorEffect="non-scaling-stroke"
              strokeWidth={isActive ? SHAPE_STROKE_WIDTH * 2 : SHAPE_STROKE_WIDTH}
              opacity={index == null || isActive ? 1 : 0.55}
            />
          );
        })}
      </svg>

      {/* The playhead is HTML, not SVG: a circle in a non-uniformly scaled
          viewBox is an ellipse, and a 1px rule would be stretched too. */}
      {active && scrubbing ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/30"
          style={{ left: `${detentFor(index!, data.length) * 100}%` }}
        />
      ) : null}

      <p className="m-caption m-muted mt-2 text-center" aria-hidden="true">
        {active ? (
          <>
            <span className="m-num text-foreground">{format(active.value)}</span> · {active.label}
          </>
        ) : (
          "Drag to inspect"
        )}
      </p>
    </div>
  );
}

/** Separator between adjacent shapes, so neither reads as the other's edge. */
export const barSeparator = { stroke: SEPARATOR, strokeWidth: SEPARATOR_WIDTH };
