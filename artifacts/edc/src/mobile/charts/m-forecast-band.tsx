import { cn } from "@/lib/utils";
import { toFanSeries, type Forecast } from "@/components/cockpit/charts/transforms";
import { bandPath, linePath, scaleFor, seriesPoints, VIEW_H, VIEW_W } from "@/mobile/charts/chart-geometry";
import { SHAPE_STROKE_WIDTH, seriesPaint } from "@/mobile/charts/chart-colors";

/**
 * A Monte Carlo forecast as a band with a median line.
 *
 * Feeds off `toFanSeries` from the desktop chart transforms, which is already
 * unit-tested — the shaping is shared, only the rendering differs. That is the
 * pattern for the whole kit: reuse the maths, replace the renderer.
 *
 * ## The three figures are the chart
 *
 * A distribution's shape is genuinely hard to read at 358px, and the decision it
 * supports is "what do I commit to" — which is answered by three numbers, not by
 * a silhouette. So the p10/p50/p90 row is rendered as text ABOVE the band and is
 * the primary reading; the band is context for how wide the uncertainty is.
 * Inverting that would be prettier and less useful.
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
  const loPoints = seriesPoints(series.map((s) => s.lo), scale);
  const hiPoints = seriesPoints(series.map((s) => s.hi), scale);

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
        <path d={bandPath(loPoints, hiPoints)} fill={paint.fill} />
        <path
          d={linePath(midPoints)}
          fill="none"
          stroke={paint.stroke}
          strokeWidth={SHAPE_STROKE_WIDTH}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
