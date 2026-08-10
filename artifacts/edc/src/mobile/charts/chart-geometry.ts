/**
 * All path and layout maths for the mobile chart kit.
 *
 * Pure, no JSX, no DOM — so it runs under a vitest config with `environment:
 * "node"`, and so the shapes can be checked by reading numbers rather than by
 * squinting at a screenshot. Every chart component below this is a thin render
 * over these functions.
 *
 * RELATIVE IMPORTS ONLY (and currently none at all): the standalone vitest
 * config has no `resolve.alias`, so a `@/` import here would make the whole
 * suite unrunnable. board.ts and risk-model.ts carry the same warning.
 *
 * ## Coordinate space
 *
 * Everything works in a normalised viewBox and is stretched to fit by
 * `preserveAspectRatio="none"`, with `vectorEffect="non-scaling-stroke"` keeping
 * strokes an honest width afterwards. That is what lets one geometry serve a
 * 320px phone and a 430px one without recomputing anything on resize — the
 * technique trajectory-scrubber.tsx already proved.
 *
 * Anything that must stay circular (a playhead dot, a detent notch) is an HTML
 * element positioned on top, never an SVG circle, because a circle in a
 * non-uniformly scaled viewBox is an ellipse.
 */

export const VIEW_W = 1000;
export const VIEW_H = 320;

export interface Point {
  x: number;
  y: number;
}

/** Inclusive numeric bounds for an axis. */
export interface Scale {
  min: number;
  max: number;
}

/**
 * Bounds for a value series.
 *
 * Zero-based unless the data never approaches zero, in which case a zero floor
 * would flatten the whole series into the top few pixels and hide the variation
 * that is the entire reason for drawing it. `zeroBased` forces the honest
 * version where the magnitude — not the movement — is the point.
 */
export function scaleFor(values: number[], opts: { zeroBased?: boolean } = {}): Scale {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { min: 0, max: 1 };

  let min = Math.min(...finite);
  let max = Math.max(...finite);

  if (opts.zeroBased) min = Math.min(0, min);
  else {
    const span = max - min;
    // A series with no variation still needs a band to sit in, or it divides by
    // zero and renders at the top edge.
    if (span === 0) {
      const pad = Math.abs(max) * 0.1 || 1;
      min -= pad;
      max += pad;
    } else {
      const pad = span * 0.08;
      min -= pad;
      max += pad;
    }
  }

  if (max === min) max = min + 1;
  return { min, max };
}

/** Maps a value onto the viewBox's y axis, where larger values sit higher. */
export function yFor(value: number, scale: Scale, height = VIEW_H): number {
  const t = (value - scale.min) / (scale.max - scale.min);
  return height - t * height;
}

/** Evenly spaces n points across the viewBox width, inset by half a step. */
export function xFor(index: number, count: number, width = VIEW_W): number {
  if (count <= 1) return width / 2;
  return (index / (count - 1)) * width;
}

/** Points for a value series. */
export function seriesPoints(values: number[], scale: Scale, width = VIEW_W, height = VIEW_H): Point[] {
  return values.map((v, i) => ({ x: xFor(i, values.length, width), y: yFor(v, scale, height) }));
}

function fmt(n: number): string {
  // Trims float noise that would otherwise put 14 digits in the DOM for every
  // point of every chart.
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** An open polyline through the points. */
export function linePath(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(" ");
}

/** The same line, closed down to a baseline, for a gradient area fill. */
export function areaPath(points: Point[], height = VIEW_H): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${fmt(last.x)} ${height} L${fmt(first.x)} ${height} Z`;
}

/**
 * A filled band between two series — a forecast's p10 floor and p90 ceiling.
 * Out along the ceiling, back along the floor, closed.
 */
export function bandPath(lo: Point[], hi: Point[]): string {
  if (lo.length === 0 || hi.length === 0) return "";
  const out = hi.map((p, i) => `${i === 0 ? "M" : "L"}${fmt(p.x)} ${fmt(p.y)}`).join(" ");
  const back = [...lo].reverse().map((p) => `L${fmt(p.x)} ${fmt(p.y)}`).join(" ");
  return `${out} ${back} Z`;
}

export interface BarRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Centre, for placing a scrub detent or a label. */
  cx: number;
}

/**
 * Bars across the viewBox.
 *
 * `gap` is a fraction of the slot rather than an absolute width, so the bars
 * keep their proportions at any device width — an absolute gap looks correct at
 * 390px and turns 24 bars into hairlines at 320.
 */
export function barRects(
  values: number[],
  scale: Scale,
  opts: { gap?: number; width?: number; height?: number } = {},
): BarRect[] {
  const width = opts.width ?? VIEW_W;
  const height = opts.height ?? VIEW_H;
  const gap = opts.gap ?? 0.28;
  if (values.length === 0) return [];

  const slot = width / values.length;
  const barWidth = slot * (1 - gap);
  const baseline = yFor(Math.max(scale.min, 0), scale, height);

  return values.map((v, i) => {
    const y = yFor(v, scale, height);
    const top = Math.min(y, baseline);
    return {
      x: i * slot + (slot - barWidth) / 2,
      y: top,
      width: barWidth,
      // A zero-height rect is invisible, so a real zero still gets a hairline —
      // otherwise an empty stage reads as missing data rather than as none.
      height: Math.max(Math.abs(baseline - y), 1),
      cx: i * slot + slot / 2,
    };
  });
}

export interface RingSegment {
  /** Fraction of the whole, 0–1. */
  value: number;
  dashArray: string;
  dashOffset: number;
}

/**
 * Donut segments as stroke-dasharray/offset on concentric circles.
 *
 * No arc-path trigonometry: one animatable property per segment, crisper round
 * caps, and no large-arc-flag bug waiting at exactly 50%. `circumference` is the
 * caller's 2πr.
 */
export function ringSegments(values: number[], circumference: number): RingSegment[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => ({ value: 0, dashArray: `0 ${circumference}`, dashOffset: 0 }));

  let consumed = 0;
  return values.map((raw) => {
    const v = Math.max(0, raw) / total;
    const length = v * circumference;
    const segment: RingSegment = {
      value: v,
      dashArray: `${fmt(length)} ${fmt(circumference - length)}`,
      // Negative, because stroke-dashoffset runs backwards along the path.
      dashOffset: -consumed,
    };
    consumed += length;
    return segment;
  });
}

export interface FunnelStep {
  label: string;
  value: number;
  /** Bar width as a fraction of the full track, 0–1. */
  widthPct: number;
  /** How much of the previous step did NOT reach this one, 0–1. Null at the top. */
  dropPct: number | null;
  /** Survivors as a fraction of the first step, 0–1. */
  ofFirst: number;
}

/**
 * A funnel as a stepped bar cascade rather than a trapezoid.
 *
 * A drawn trapezoid encodes the same number twice — width AND the slope between
 * widths — and at phone scale the slope is what people read, which makes small
 * differences look dramatic and large ones look gentle. A cascade of plain bars
 * lets the receding right edge BE the funnel, while each row stays a bar you can
 * compare honestly against the one above it.
 */
export function funnelGeometry(rows: { label: string; value: number }[]): FunnelStep[] {
  if (rows.length === 0) return [];
  // Widths are relative to the widest step, not to the first: a funnel that
  // grows in the middle (a re-entry, a recycled stage) would otherwise overflow
  // the track and clip.
  const peak = Math.max(...rows.map((r) => Math.max(0, r.value)), 0);
  const first = Math.max(0, rows[0].value);

  return rows.map((row, i) => {
    const value = Math.max(0, row.value);
    const prev = i === 0 ? null : Math.max(0, rows[i - 1].value);
    return {
      label: row.label,
      value,
      widthPct: peak > 0 ? value / peak : 0,
      dropPct: prev != null && prev > 0 ? Math.max(0, (prev - value) / prev) : prev === 0 ? 0 : null,
      ofFirst: first > 0 ? value / first : 0,
    };
  });
}

/**
 * Radar polygon vertices, first axis at twelve o'clock and running clockwise.
 *
 * Radar ships as an opt-in second view, not the default: the area it encloses is
 * an artefact of axis ORDER rather than of the data, so reordering the axes
 * changes the shape without changing a single value. Sorted bars beat it on
 * every task the risk panel actually supports.
 */
export function radarPoints(values: number[], scale: Scale, radius: number): Point[] {
  const n = values.length;
  if (n === 0) return [];
  return values.map((v, i) => {
    const t = Math.max(0, Math.min(1, (v - scale.min) / (scale.max - scale.min)));
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(angle) * t * radius, y: Math.sin(angle) * t * radius };
  });
}

/** `points` attribute for a polygon. */
export function polygonPoints(points: Point[]): string {
  return points.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");
}
