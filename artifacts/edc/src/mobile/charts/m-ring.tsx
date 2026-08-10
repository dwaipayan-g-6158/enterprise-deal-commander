import { cn } from "@/lib/utils";
import { ringSegments } from "@/mobile/charts/chart-geometry";
import { SHAPE_STROKE_WIDTH, seriesPaint, type ChartPaint } from "@/mobile/charts/chart-colors";

export interface RingDatum {
  label: string;
  value: number;
  paint?: ChartPaint;
}

/**
 * A proportional ring, for a two-to-four-way split of one whole.
 *
 * Drawn with stroke-dasharray rather than arc paths: one animatable property per
 * segment, honest round caps, and no large-arc-flag branch to get wrong at
 * exactly 50%.
 *
 * The ring is `aria-hidden` and the list beside it is the real content. That is
 * not a concession — a proportional area is genuinely hard to read to three
 * significant figures, so the list is what a sighted reader uses too. Colour is
 * never the only channel here.
 *
 * The SVG is square and uniformly scaled, so a circle is a circle — unlike the
 * stretched viewBoxes the line and bar charts use.
 */
export function MRing({
  data,
  centreLabel,
  centreValue,
  size = 132,
  thickness = 14,
  className,
}: {
  data: RingDatum[];
  centreLabel?: string;
  centreValue?: string;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const segments = ringSegments(data.map((d) => d.value), circumference);
  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={thickness}
          />
          {segments.map((segment, i) => (
            <circle
              key={data[i].label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={(data[i].paint ?? seriesPaint(i)).stroke}
              strokeWidth={thickness}
              strokeDasharray={segment.dashArray}
              strokeDashoffset={segment.dashOffset}
              // Starts the first segment at twelve o'clock instead of three.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          ))}
          {/* Hairline between segments, so two adjacent hues do not read as one
              shape with a colour change in the middle. */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="none"
            strokeWidth={SHAPE_STROKE_WIDTH}
          />
        </svg>

        {centreValue ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="m-title m-num">{centreValue}</span>
            {centreLabel ? <span className="m-caption m-muted">{centreLabel}</span> : null}
          </div>
        ) : null}
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((datum, i) => (
          <li key={datum.label} className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 translate-y-0.5 rounded-full"
              style={{ backgroundColor: (datum.paint ?? seriesPaint(i)).stroke }}
            />
            <span className="m-caption min-w-0 flex-1 truncate">{datum.label}</span>
            <span className="m-caption m-num shrink-0">
              {total > 0 ? `${Math.round((Math.max(0, datum.value) / total) * 100)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
