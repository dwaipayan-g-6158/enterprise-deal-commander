import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_AHEAD } from "@/mobile/lib/tones";

/**
 * A single KPI in the bento grid: label, figure, and one line of context.
 * It reports; it does not navigate.
 *
 * It used to carry an `onPress` prop with a whole `<button>` branch behind it
 * and no caller anywhere. The obvious fix was to wire the drill-down that had
 * clearly been imagined for it — "Red alerts: 1" to the Deals screen's
 * Critical filter — and driving that showed why it was never wired: the tile
 * counts *alerts* and the filter matches *deals whose health is RED*. On the
 * seed data that is 1 and 0, so the link lands on "Nothing in this filter".
 * They are different units and no amount of plumbing reconciles them.
 *
 * So the prop is gone rather than connected. The alert this figure counts is
 * already listed, by name, in the Critical alerts card two hundred pixels
 * below — which is the drill-down, and it was there all along.
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
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  footnote?: ReactNode;
  tone?: "default" | "critical";
  className?: string;
}) {
  return (
    <div className={cn("m-card m-reveal flex flex-col p-4", className)}>
      <p className="m-label m-muted">{label}</p>
      <p className={cn("m-title mt-1.5", tone === "critical" && "text-destructive")}>{value}</p>
      {/* mt-auto is what aligns a pair of tiles: the footnote sits on the
          floor of the card rather than directly under a figure, so one tile
          wrapping to two lines doesn't push its neighbour out of step. */}
      {footnote ? <div className="m-caption m-muted mt-auto pt-1">{footnote}</div> : null}
    </div>
  );
}

/**
 * Week-over-week movement. Direction is carried by an arrow as well as color,
 * so the signal survives both a monochrome render and a colorblind reader.
 * A zero delta shows an em dash rather than "0", which reads as a measurement
 * rather than a change.
 *
 * The trailing label is muted and nothing more. It used to carry `opacity-70`
 * on top of the muted colour, which measured 4.08:1 against the card — under
 * AA. Stacking opacity on a token that is already de-emphasised is how a
 * palette that passes on paper fails in the browser.
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
      <span className="m-muted">— {label}</span>
    );
  }
  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1", up ? TONE_AHEAD : "text-destructive")}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {format(Math.abs(delta))}
      <span className="m-muted">{label}</span>
    </span>
  );
}
