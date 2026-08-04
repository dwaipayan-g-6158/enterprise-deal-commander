import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A single KPI in the bento grid: label, figure, and one line of context.
 *
 * Rendered as a button when `onPress` is supplied, so drill-down tiles are
 * keyboard-reachable and announce themselves as interactive.
 *
 * Tiles are laid out as a column with the footnote pinned to the bottom, so
 * a pair sitting side by side with footnotes of different line counts still
 * agree on where the figure sits. They did not before, and two tiles that
 * never line up is the kind of thing a reader notices without being able to
 * say why.
 */
export function StatTile({
  label,
  value,
  footnote,
  tone = "default",
  onPress,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  footnote?: ReactNode;
  tone?: "default" | "critical";
  onPress?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <p className="m-label">{label}</p>
      <p className={cn("m-title mt-1.5", tone === "critical" && "text-destructive")}>{value}</p>
      {/* mt-auto is what aligns a pair of tiles: the footnote sits on the
          floor of the card rather than directly under a figure, so one tile
          wrapping to two lines doesn't push its neighbour out of step. */}
      {footnote ? <div className="m-caption m-muted mt-auto pt-1">{footnote}</div> : null}
    </>
  );

  const shape = "m-card m-reveal flex flex-col p-4";

  if (!onPress) {
    return <div className={cn(shape, className)}>{body}</div>;
  }

  return (
    <button type="button" onClick={onPress} className={cn(shape, "m-press text-left", className)}>
      {body}
    </button>
  );
}

/**
 * Week-over-week movement. Direction is carried by an arrow as well as color,
 * so the signal survives both a monochrome render and a colorblind reader.
 * A zero delta shows an em dash rather than "0", which reads as a measurement
 * rather than a change.
 */
export function DeltaLine({
  delta,
  format,
  label = "vs last wk",
}: {
  delta: number | null | undefined;
  format: (n: number) => string;
  label?: string;
}) {
  if (delta == null || delta === 0) {
    return (
      <span className="m-muted">
        — <span className="opacity-70">{label}</span>
      </span>
    );
  }
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1", up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {format(Math.abs(delta))}
      <span className="m-muted opacity-70">{label}</span>
    </span>
  );
}
