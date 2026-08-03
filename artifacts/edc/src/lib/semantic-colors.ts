// Single source of truth for risk/health/outcome colour. Root cause of the
// original "low risk deal and Closed-Won deal both render emerald" bug: ~24
// independently-authored colour maps across the app duplicated the same
// values with no shared module, so no single edit could fix it.
//
// Semantic rules, ordered by what matters when two of them meet on one row:
//
//  1. Health is a literal traffic light — emerald / yellow / red. It is the
//     column a human reads as "is this deal OK", so it gets the colours that
//     need no decoding. (This inverts an earlier rule that reserved green for
//     "won" and pushed health onto the risk ramp instead: the badge then said
//     "Healthy" and rendered sky-blue, which reads as a bug.)
//  2. Closed-Won is VIOLET (matching --chart-4), not green. Won and healthy
//     must never share a hue — a won deal's row shows both badges at once,
//     and that collision is the bug this file exists to prevent. WHICH of the
//     two moves off green is arbitrary; that they differ is not.
//  3. Risk keeps its own 4-tier analytic ramp: sky → amber → orange → red.
//     Health and Risk are adjacent columns, so Risk deliberately does NOT
//     reuse health's palette — sky for LOW is what stops the two columns from
//     reading as duplicates of each other.
//  4. Red means live danger only — HIGH risk or CRITICAL health. Lost is
//     neutral slate, never red: a lost deal is over, not on fire.
//  5. Emerald is also the app's "good metric" channel (score bands, velocity,
//     delta arrows, MEDDPICC, presence, the board's Committed chip). Health
//     GREEN joining that channel is deliberate — healthy IS good, and a
//     second green-adjacent hue would only be confusable with this one. Do
//     NOT blanket find-and-replace "emerald": only touch a colour if it is
//     selected by a risk level, health status, or terminal deal outcome.
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
 *  variants; no raw hex). */
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

/** Health's own 3-state traffic light. GREEN/YELLOW are authored — they no
 *  longer derive from the risk ramp (header rule 1) — while RED keeps aliasing
 *  HIGH, because there both scales genuinely mean the same red. Light-mode
 *  `text` sits at -700 rather than the risk ramp's -600: emerald-600 and
 *  yellow-600 are each under 4.5:1 on white, and yellow is the worst case in
 *  the whole palette. */
export const HEALTH_CLASS: Record<Health, LevelClass> = {
  GREEN: {
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/12",
    border: "border-emerald-500/40",
    fill: "bg-emerald-500",
    dot: "bg-emerald-500",
    borderL: "border-l-emerald-500",
    cell: "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25",
  },
  YELLOW: {
    text: "text-yellow-700 dark:text-yellow-400",
    bg: "bg-yellow-500/12",
    border: "border-yellow-500/40",
    fill: "bg-yellow-500",
    dot: "bg-yellow-500",
    borderL: "border-l-yellow-500",
    cell: "bg-yellow-500/15 border-yellow-500/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-500/25",
  },
  RED: RISK_LEVEL_CLASS.HIGH,
};

/** Solid badge classes (bg + hover + text) — health has no risk-level analogue
 *  since RED already has a shadcn `variant="destructive"` path. YELLOW carries
 *  dark text rather than white: no shade of yellow light enough to still read
 *  as yellow can carry white text legibly. */
export const HEALTH_BADGE_CLASS: Record<Health, string> = {
  GREEN: "bg-emerald-600 hover:bg-emerald-700 text-white",
  YELLOW: "bg-yellow-400 hover:bg-yellow-500 text-yellow-950",
  RED: "", // callers use variant="destructive" instead of a class override
};

/** Human-facing word for the Health badge. Deliberately NOT the literal enum:
 *  a badge whose own text is a colour name asserts its swatch instead of its
 *  meaning, so it reads as a bug the moment the two disagree. Also deliberately
 *  distinct wording from RISK_LEVEL_LABEL, because Health and Risk are adjacent
 *  columns/badges in the roster and cockpit and identical vocabulary would make
 *  them look like the same column twice. This is what the badge SAYS;
 *  HEALTH_BADGE_CLASS/HEALTH_CLASS own what it LOOKS like. */
export const HEALTH_LABEL: Record<Health, string> = {
  GREEN: "Healthy",
  YELLOW: "Needs Attention",
  RED: "Critical",
};

/** Space-constrained form of HEALTH_LABEL, mirroring RISK_LEVEL_SHORT_LABEL.
 *  Required wherever the label shares a fixed-height KPI cell or a one-line
 *  three-item legend — "Needs Attention" clips in those. */
export const HEALTH_SHORT_LABEL: Record<Health, string> = {
  GREEN: "Healthy",
  YELLOW: "Attention",
  RED: "Critical",
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

/** Terminal deal outcome. `won` is violet — it vacated emerald so health could
 *  become a true traffic light (header rule 2); violet is otherwise unclaimed
 *  by any status scale and already present as --chart-4, so it reads as
 *  deliberate rather than arbitrary. `lost` is off red/rose (which collided
 *  with live HIGH risk) at neutral slate. The `dark:` split on `lost` is
 *  load-bearing, not cosmetic — light mode needs slate darker than the pale
 *  card, dark mode needs it lighter than `--border` — do not simplify it away. */
export const OUTCOME_CLASS: Record<Outcome, OutcomeClass> = {
  won: {
    text: "text-violet-700 dark:text-violet-400",
    bg: "bg-violet-500/15",
    border: "border-violet-500/20",
    dot: "bg-violet-500",
    fill: "bg-violet-500",
    borderL: "border-l-violet-500",
    badge: "bg-violet-600 text-white",
    ring: "ring-violet-500/70",
    icon: "text-violet-500",
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
  GREEN: "hsl(160 84% 39%)", // emerald-500
  YELLOW: "hsl(45 93% 47%)", // yellow-500
  RED: RISK_LEVEL_HSL.HIGH,
};

/** Outcome's chart form. Shades match OUTCOME_RGB so a donut and a sankey
 *  ribbon showing the same won/lost split can't disagree. This existed only as
 *  RGB before, which is why winloss-donut.tsx hand-rolled `--chart-2` for won
 *  and `--destructive` for lost — the latter breaking the "lost is never red"
 *  rule in the header. */
export const OUTCOME_HSL: Record<Outcome, string> = {
  won: "hsl(262 83% 58%)", // violet-600
  lost: "hsl(215 16% 47%)", // slate-500
};

/** Bare "r,g,b" triples for `rgba()` composition (tint fills, sankey/matrix flows). */
export const RISK_LEVEL_RGB: Record<RiskLevel, string> = {
  LOW: "14,165,233", // sky-500
  MODERATE: "245,158,11", // amber-500
  ELEVATED: "249,115,22", // orange-500
  HIGH: "239,68,68", // red-500
};

export const HEALTH_RGB: Record<Health, string> = {
  GREEN: "16,185,129", // emerald-500
  YELLOW: "234,179,8", // yellow-500
  RED: RISK_LEVEL_RGB.HIGH,
};

export const OUTCOME_RGB: Record<Outcome, string> = {
  won: "124,58,237", // violet-600
  lost: "100,116,139", // slate-500
};

/** #RRGGBB literals ONLY — the briefing export (html-to-image / print) is
 *  always light paper regardless of the viewer's theme, and per
 *  briefing-report.tsx's own header comment, colours there must be static
 *  literals, never a CSS-variable/oklch chain the capture path can't resolve.
 *  All at the -600 shade to match the report's existing red/amber literals. */
export const BRIEFING_HEALTH_HEX: Record<Health, string> = {
  GREEN: "#059669", // emerald-600
  YELLOW: "#CA8A04", // yellow-600
  RED: "#DC2626", // red-600
};

export const BRIEFING_OUTCOME_HEX: Record<Outcome, string> = {
  won: "#7C3AED", // violet-600
  lost: "#475569", // slate-600
};
