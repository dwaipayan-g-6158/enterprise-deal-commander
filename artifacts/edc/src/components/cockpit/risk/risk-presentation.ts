import { Ban, ShieldAlert, AlertTriangle, Info, type LucideIcon } from "lucide-react";
import type { RiskActionPriority, RiskDimension } from "./risk-model";

export interface PriorityPresentation {
  Icon: LucideIcon;
  className: string;
}

/**
 * Pure map: action priority -> lucide icon + semantic color class.
 * Unknown / unexpected priorities fall back to a neutral Info marker so
 * a malformed engine payload never throws in render.
 */
export function priorityPresentation(priority: RiskActionPriority | string): PriorityPresentation {
  switch (priority) {
    case "BLOCKER":
      return { Icon: Ban, className: "text-destructive" };
    case "CRITICAL":
      return { Icon: ShieldAlert, className: "text-destructive" };
    case "HIGH":
      return { Icon: AlertTriangle, className: "text-orange-500" };
    case "MEDIUM":
      return { Icon: Info, className: "text-amber-500" };
    case "LOW":
      return { Icon: Info, className: "text-muted-foreground" };
    default:
      return { Icon: Info, className: "text-muted-foreground" };
  }
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/**
 * Pure calc: split a dimension into a base segment + an amplified tip segment.
 * `amplified` is true only when amplification is present AND patterns contributed.
 * Both widths are clamped to [0,100]; the amp tip is `score - baseScore` (never < 0)
 * when amplified, else 0. Falls back to the full score as the base when baseScore is
 * absent so a non-amplified bar still fills correctly.
 */
export function dimensionBarSegments(dim: RiskDimension): {
  basePct: number;
  ampPct: number;
  amplified: boolean;
} {
  const score = clampPct(dim.score);
  const amplified =
    typeof dim.amplification === "number" &&
    dim.amplification > 0 &&
    !!dim.contributingPatterns?.length;
  if (!amplified) {
    return { basePct: score, ampPct: 0, amplified: false };
  }
  const base = clampPct(typeof dim.baseScore === "number" ? dim.baseScore : score);
  const ampPct = clampPct(Math.max(0, score - base));
  return { basePct: base, ampPct, amplified: true };
}
