import { useId } from "react";
import { cn } from "@/lib/utils";
import { areaPath, linePath, scaleFor, seriesPoints, VIEW_H, VIEW_W } from "@/mobile/charts/chart-geometry";
import { SHAPE_STROKE_WIDTH, seriesPaint, type ChartPaint } from "@/mobile/charts/chart-colors";

/**
 * A trend glyph, not a chart.
 *
 * It carries direction and shape at a size where axes and ticks would be noise —
 * inline beside a figure, inside a list row. It is deliberately NOT scrubbable:
 * a 24px-tall target cannot host a gesture, and pretending otherwise produces a
 * control nobody can hit. When the individual values matter, use MBars.
 *
 * The accessible name states the story rather than the shape, because "a line
 * that goes up and slightly down" is not information — first value, last value,
 * and direction are.
 */
export function MSparkline({
  values,
  paint = seriesPaint(0),
  label,
  format,
  height = 40,
  showArea = true,
  className,
}: {
  values: number[];
  paint?: ChartPaint;
  /** What the series is — "Close score", "Weighted pipeline". */
  label: string;
  format: (value: number) => string;
  height?: number;
  showArea?: boolean;
  className?: string;
}) {
  const gradientId = useId();
  const usable = values.filter((v) => Number.isFinite(v));

  if (usable.length < 2) {
    return (
      <p className={cn("m-caption m-muted", className)}>Not enough history yet</p>
    );
  }

  const scale = scaleFor(usable);
  const points = seriesPoints(usable, scale);
  const first = usable[0];
  const last = usable[usable.length - 1];
  const direction = last > first ? "up" : last < first ? "down" : "flat";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
      className={className}
      role="img"
      aria-label={`${label}: ${format(last)}, ${direction} from ${format(first)} across ${usable.length} points`}
    >
      {showArea ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={paint.stroke} stopOpacity={0.22} />
              <stop offset="100%" stopColor={paint.stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath(points)} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path
        d={linePath(points)}
        fill="none"
        stroke={paint.stroke}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
