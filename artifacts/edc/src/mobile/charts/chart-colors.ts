import type { Health, Outcome, RiskLevel } from "@/lib/semantic-colors";

/**
 * Chart paint for the mobile kit.
 *
 * Two things are true at once and both matter:
 *
 *  1. `semantic-colors.ts` remains the single source of what a risk level or a
 *     health status IS. Nothing here invents a colour identity.
 *  2. A shape drawn on a card has a contrast requirement that a badge does not.
 *     The Tailwind -500 fills those roles use are correct as fills and fail WCAG
 *     1.4.11's 3:1 as shapes — amber-500 measures 1.94:1 on white, which is why
 *     index.css records the light-mode series palette as a known gap and pins
 *     only dark.
 *
 * The kit resolves that instead of inheriting it: the FILL keeps the recognisable
 * hue at a low alpha, and a STROKE in a darkened form of the same hue carries the
 * contrast. 1.4.11 binds on the boundary of a graphical object, so a compliant
 * boundary makes a compliant object. The stroke tokens are declared and measured
 * in tokens.css / tokens.test.ts.
 *
 * Everything resolves through `var()`, so charts follow the theme and the time
 * band with no JS and no re-render.
 */

const stroke = (name: string) => `hsl(var(--m-stroke-${name}))`;
const fill = (name: string, alpha: number) => `hsl(var(--m-stroke-${name}) / ${alpha})`;

/** Fill alpha for an area, band or bar. Low enough that the stroke reads as the edge. */
export const FILL_ALPHA = 0.18;
/** A slightly stronger fill for a shape with no neighbours to compare against. */
export const FILL_ALPHA_SOLO = 0.28;

export interface ChartPaint {
  stroke: string;
  fill: string;
}

function paint(name: string, alpha = FILL_ALPHA): ChartPaint {
  return { stroke: stroke(name), fill: fill(name, alpha) };
}

export const RISK_PAINT: Record<RiskLevel, ChartPaint> = {
  LOW: paint("low"),
  MODERATE: paint("moderate"),
  ELEVATED: paint("elevated"),
  HIGH: paint("high"),
};

export const HEALTH_PAINT: Record<Health, ChartPaint> = {
  GREEN: paint("green"),
  YELLOW: paint("yellow"),
  RED: paint("high"),
};

export const OUTCOME_PAINT: Record<Outcome, ChartPaint> = {
  won: paint("won"),
  lost: paint("lost"),
};

/**
 * Non-semantic series, for anything that does not mean "risk" or "health" — a
 * multi-line trend, a flow ribbon, a generic breakdown. Reaching for these to
 * colour a risk level would put two vocabularies on one screen.
 */
export const SERIES_PAINT: ChartPaint[] = [1, 2, 3, 4, 5].map((n) => ({
  stroke: `hsl(var(--m-series-${n}))`,
  fill: `hsl(var(--m-series-${n}) / ${FILL_ALPHA})`,
}));

export function seriesPaint(index: number): ChartPaint {
  return SERIES_PAINT[index % SERIES_PAINT.length];
}

/** The hairline that separates adjacent shapes so neither reads as the other's edge. */
export const SEPARATOR = "hsl(var(--card))";
export const SEPARATOR_WIDTH = 1;
export const SHAPE_STROKE_WIDTH = 1.5;
