import { cn } from "@/lib/utils";
import { toFanSeries, type Forecast } from "@/components/cockpit/charts/transforms";
import { areaPath, linePath, scaleFor, seriesPoints, VIEW_H, VIEW_W } from "@/mobile/charts/chart-geometry";
import { SHAPE_STROKE_WIDTH, seriesPaint } from "@/mobile/charts/chart-colors";

/**
 * A Monte Carlo forecast as a percentile curve.
 *
 * Feeds off `toFanSeries` from the desktop chart transforms, which is already
 * unit-tested — the shaping is shared, only the rendering differs. That is the
 * pattern for the whole kit: reuse the maths, replace the renderer.
 *
 * ## Why this is not a band, despite the name
 *
 * It was, and the band was meaningless. `toFanSeries` sets `lo: f.p10` and
 * `hi: f.p90` — the SAME two constants at every one of the five points — so a
 * band between them has flat edges by construction, for any input, forever.
 * Measured on the deployed app: top edge at y=22.07 and bottom at y=297.93
 * across the whole width. A rectangle.
 *
 * Worse, it restated the line it sat behind. The x axis here is PERCENTILE, not
 * time, so the curve already runs from p10 to p90; drawing a p10–p90 slab behind
 * it adds a second copy of its own endpoints.
 *
 * Desktop's `forecast-fan.tsx` renders the same constant band but at
 * `fillOpacity 0.06` — nearly invisible — and puts a *separate* fill at 0.18
 * under the mid line, which is the one that reads. Mobile had copied only the
 * band, at the strength desktop reserves for the meaningful fill. So this now
 * fills under the curve instead, which is what `areaPath` was already in the kit
 * for. `toFanSeries` is untouched: it still defines the p10→p90 ordering, and
 * desktop keeps rendering exactly as it did.
 *
 * The shape now carries information — a steep curve is a tight distribution, a
 * shallow one is a wide one.
 *
 * ## The three figures are still the chart
 *
 * A distribution's shape is genuinely hard to read at 358px, and the decision it
 * supports is "what do I commit to" — which is answered by three numbers, not by
 * a silhouette. So the p10/p50/p90 row is rendered as text ABOVE the curve and is
 * the primary reading; the curve is context for how wide the uncertainty is.
 * Inverting that would be prettier and less useful. The marker ties the middle
 * figure to the point on the curve it came from.
 */
export function MForecastBand({
  forecast,
  format,
  label = "Forecast",
  height = 120,
  className,
}: {
  forecast: Forecast;
  format: (value: number) => string;
  label?: string;
  height?: number;
  className?: string;
}) {
  const series = toFanSeries(forecast);
  const paint = seriesPaint(0);

  const mids = series.map((s) => s.mid);
  const scale = scaleFor([forecast.p10, forecast.p90, ...mids], { zeroBased: false });
  const midPoints = seriesPoints(mids, scale);
  // p50 is the third of the five ordered percentiles, and the figure the header
  // calls "Likely".
  const median = midPoints[Math.floor(midPoints.length / 2)];

  return (
    <div className={className}>
      <dl className="mb-3 grid grid-cols-3 gap-2">
        {[
          { k: "Conservative", v: forecast.p10 },
          { k: "Likely", v: forecast.p50 },
          { k: "Optimistic", v: forecast.p90 },
        ].map((cell, i) => (
          <div key={cell.k} className={cn(i === 1 && "text-center", i === 2 && "text-right")}>
            <dt className="m-caption m-muted">{cell.k}</dt>
            <dd className={cn("m-num mt-0.5", i === 1 ? "m-title" : "m-headline")}>
              {format(cell.v)}
            </dd>
          </div>
        ))}
      </dl>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height }}
        role="img"
        aria-label={`${label}: between ${format(forecast.p10)} and ${format(forecast.p90)}, most likely ${format(forecast.p50)}`}
      >
        <path d={areaPath(midPoints)} fill={paint.fill} />
        <path
          d={linePath(midPoints)}
          fill="none"
          stroke={paint.stroke}
          strokeWidth={SHAPE_STROKE_WIDTH}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {median ? (
          // r is in viewBox units on a non-uniformly scaled box, so a plain
          // circle would render as an ellipse — hence the counter-scaled rx/ry.
          // (chart-geometry.ts's header note.)
          <ellipse
            cx={median.x}
            cy={median.y}
            rx={VIEW_W / 150}
            ry={VIEW_H / 48}
            fill={paint.stroke}
          />
        ) : null}
      </svg>
    </div>
  );
}
