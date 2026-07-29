// Single source of truth for risk/health/outcome colour. Root cause of the
// "low risk deal and Closed-Won deal both render emerald" bug: ~24
// independently-authored colour maps across the app duplicated the same
// values with no shared module. Consolidating here first (this file starts
// with TODAY's colours — a zero-visual-change refactor) then flipping the
// values in one place (see the `LOW`/`lost` rows below) is what makes both
// steps reviewable: the refactor's acceptance criterion is "screenshots are
// pixel-identical", and the flip's diff is ~10 lines.
//
// Semantic rule going forward: green means "won" EXCLUSIVELY. Sky→amber→
// orange→red is the live-risk ramp — red is reserved for live HIGH risk and
// never means "lost". Lost is neutral slate. Do NOT blanket find-and-replace
// "emerald"/"rose" elsewhere in the app — most occurrences encode unrelated
// "good" meanings (score bands, velocity, delta arrows, MEDDPICC, presence)
// that must stay emerald. Only touch a colour if it is selected by a risk
// level, health status, or terminal deal outcome.
//
// No new CSS tokens: Tailwind v4's `@theme` block (index.css) has no
// --color-success/-warning/-danger, and the briefing export (html-to-image)
// needs a hex LITERAL regardless of any token (see BRIEFING_* below and
// briefing-report.tsx's own header comment) — so a token layer would add a
// third representation to keep in sync, not remove one.

export type RiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
export type Health = "GREEN" | "YELLOW" | "RED";
export type Outcome = "won" | "lost";

export function classifyRisk(score: number): RiskLevel {
  if (score <= 25) return "LOW";
  if (score <= 50) return "MODERATE";
  if (score <= 75) return "ELEVATED";
  return "HIGH";
}

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  LOW: "Low Risk",
  MODERATE: "Moderate Risk",
  ELEVATED: "Elevated Risk",
  HIGH: "High Risk",
};

/** Space-constrained form of RISK_LEVEL_LABEL (heatmap cells, legends). */
export const RISK_LEVEL_SHORT_LABEL: Record<RiskLevel, string> = {
  LOW: "Low",
  MODERATE: "Moderate",
  ELEVATED: "Elevated",
  HIGH: "High",
};

/** Legacy 3-state health -> a risk level, for fallback rendering when the
 *  richer `risk` payload is absent. */
export function healthToRiskLevel(h: Health): RiskLevel {
  return h === "RED" ? "HIGH" : h === "YELLOW" ? "MODERATE" : "LOW";
}

interface LevelClass {
  text: string;
  bg: string;
  border: string;
  fill: string;
  dot: string;
  /** 4px left-accent border (`border-l-*`), for the deal strip and similar cards. */
  borderL: string;
  /** Heatmap cell tint (bg + border + text + hover), for the Portfolio risk heatmap. */
  cell: string;
}

/** Theme-aware Tailwind utility classes per risk level (named utilities + dark
 *  variants; no raw hex). Only the LOW row changes when the palette flips. */
export const RISK_LEVEL_CLASS: Record<RiskLevel, LevelClass> = {
  LOW: {
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/12",
    border: "border-sky-500/40",
    fill: "bg-sky-500",
    dot: "bg-sky-500",
    borderL: "border-l-sky-500",
    cell: "bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300 hover:bg-sky-500/25",
  },
  MODERATE: {
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/12",
    border: "border-amber-500/40",
    fill: "bg-amber-500",
    dot: "bg-amber-500",
    borderL: "border-l-amber-500",
    cell: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25",
  },
  ELEVATED: {
    text: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/12",
    border: "border-orange-500/40",
    fill: "bg-orange-500",
    dot: "bg-orange-500",
    borderL: "border-l-orange-500",
    cell: "bg-orange-500/15 border-orange-500/30 text-orange-700 dark:text-orange-300 hover:bg-orange-500/25",
  },
  HIGH: {
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/12",
    border: "border-red-500/40",
    fill: "bg-red-500",
    dot: "bg-red-500",
    borderL: "border-l-red-500",
    cell: "bg-red-500/15 border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/25",
  },
};

/** Health (3-state) is DERIVED, never authored — this is what makes drift
 *  between the risk and health colour scales structurally impossible. */
export const HEALTH_CLASS: Record<Health, LevelClass> = {
  GREEN: RISK_LEVEL_CLASS[healthToRiskLevel("GREEN")],
  YELLOW: RISK_LEVEL_CLASS[healthToRiskLevel("YELLOW")],
  RED: RISK_LEVEL_CLASS[healthToRiskLevel("RED")],
};

/** Solid badge classes (bg + hover + white text) — health has no risk-level
 *  analogue since RED already has a shadcn `variant="destructive"` path. */
export const HEALTH_BADGE_CLASS: Record<Health, string> = {
  GREEN: "bg-sky-500 hover:bg-sky-600 text-white",
  YELLOW: "bg-amber-500 hover:bg-amber-600 text-white",
  RED: "", // callers use variant="destructive" instead of a class override
};

interface OutcomeClass {
  text: string;
  bg: string;
  border: string;
  dot: string;
  fill: string;
  borderL: string;
  badge: string;
  ring: string;
  icon: string;
}

/** Terminal deal outcome. `won` is unchanged emerald; `lost` moves off
 *  red/rose (which collided with live HIGH risk) to neutral slate. The
 *  `dark:` split on `lost` is load-bearing, not cosmetic — light mode needs
 *  slate darker than the pale card, dark mode needs it lighter than
 *  `--border` — do not simplify it away. */
export const OUTCOME_CLASS: Record<Outcome, OutcomeClass> = {
  won: {
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/20",
    dot: "bg-emerald-500",
    fill: "bg-emerald-500",
    borderL: "border-l-emerald-500",
    badge: "bg-emerald-500 text-white",
    ring: "ring-emerald-500/70",
    icon: "text-emerald-500",
  },
  lost: {
    text: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-500/15 dark:bg-slate-400/20",
    border: "border-slate-500/30 dark:border-slate-400/30",
    dot: "bg-slate-500 dark:bg-slate-400",
    fill: "bg-slate-500 dark:bg-slate-400",
    borderL: "border-l-slate-500 dark:border-l-slate-400",
    badge: "bg-slate-600 text-white dark:bg-slate-500",
    ring: "ring-slate-500/70 dark:ring-slate-400/70",
    icon: "text-slate-500 dark:text-slate-400",
  },
};

// ---- Chart forms (recharts can't take Tailwind classes) -------------------

/** hsl(...) strings, hue/sat/light chosen to match the Tailwind palette
 *  utilities above 1:1. HIGH intentionally stays `hsl(var(--destructive))` —
 *  it already tracked the theme's destructive token before this file existed. */
export const RISK_LEVEL_HSL: Record<RiskLevel, string> = {
  LOW: "hsl(199 89% 48%)", // sky-500
  MODERATE: "hsl(38 92% 50%)", // amber-500
  ELEVATED: "hsl(25 95% 53%)", // orange-500
  HIGH: "hsl(var(--destructive))",
};

export const HEALTH_HSL: Record<Health, string> = {
  GREEN: RISK_LEVEL_HSL[healthToRiskLevel("GREEN")],
  YELLOW: RISK_LEVEL_HSL[healthToRiskLevel("YELLOW")],
  RED: RISK_LEVEL_HSL[healthToRiskLevel("RED")],
};

/** Bare "r,g,b" triples for `rgba()` composition (tint fills, sankey/matrix flows). */
export const RISK_LEVEL_RGB: Record<RiskLevel, string> = {
  LOW: "14,165,233", // sky-500
  MODERATE: "245,158,11", // amber-500
  ELEVATED: "249,115,22", // orange-500
  HIGH: "239,68,68", // red-500
};

export const HEALTH_RGB: Record<Health, string> = {
  GREEN: RISK_LEVEL_RGB[healthToRiskLevel("GREEN")],
  YELLOW: RISK_LEVEL_RGB[healthToRiskLevel("YELLOW")],
  RED: RISK_LEVEL_RGB[healthToRiskLevel("RED")],
};

export const OUTCOME_RGB: Record<Outcome, string> = {
  won: "5,150,105", // emerald-600
  lost: "100,116,139", // slate-500
};

/** #RRGGBB literals ONLY — the briefing export (html-to-image / print) is
 *  always light paper regardless of the viewer's theme, and per
 *  briefing-report.tsx's own header comment, colours there must be static
 *  literals, never a CSS-variable/oklch chain the capture path can't resolve.
 *  All at the -600 shade to match the report's existing red/amber literals. */
export const BRIEFING_HEALTH_HEX: Record<Health, string> = {
  GREEN: "#0284C7", // sky-600
  YELLOW: "#D97706", // amber-600, unchanged
  RED: "#DC2626", // red-600, unchanged
};

export const BRIEFING_OUTCOME_HEX: Record<Outcome, string> = {
  won: "#059669", // emerald-600, unchanged
  lost: "#475569", // slate-600
};
