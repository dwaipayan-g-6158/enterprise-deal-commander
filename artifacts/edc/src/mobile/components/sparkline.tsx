/**
 * A bare trend line — no axes, no grid, no tooltip.
 *
 * Hand-drawn SVG rather than recharts: at 40px tall the whole chart is the
 * shape of the line, and recharts' responsive container plus axis machinery
 * would cost more than it renders. The trajectory panel on desktop remains
 * the place to actually read values off a chart.
 */
export function Sparkline({
  values,
  width = 88,
  height = 32,
  className,
  ariaLabel,
}: {
  /** Chronological. Nulls are gaps in the series and are skipped. */
  values: (number | null)[];
  width?: number;
  height?: number;
  className?: string;
  ariaLabel: string;
}) {
  const points = values.filter((v): v is number => v != null);
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (points.length - 1);

  const path = points
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (height - pad * 2) * (1 - (v - min) / span);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const last = points[points.length - 1];
  const rising = last >= points[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <path
        d={path}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={rising ? "stroke-emerald-500" : "stroke-orange-500"}
      />
      <circle
        cx={pad + (points.length - 1) * stepX}
        cy={pad + (height - pad * 2) * (1 - (last - min) / span)}
        r="2.5"
        className={rising ? "fill-emerald-500" : "fill-orange-500"}
      />
    </svg>
  );
}
