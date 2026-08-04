import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A single KPI in the bento grid: label, figure, and one line of context.
 *
 * Rendered as a button when `onPress` is supplied, so drill-down tiles are
 * keyboard-reachable and announce themselves as interactive. Figures use the
 * mono face — a column of numbers that doesn't align is a column you have to
 * read twice.
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
      <p className="m-eyebrow">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-2xl font-semibold tracking-[-0.03em]",
          tone === "critical" && "text-[var(--m-error)]",
        )}
      >
        {value}
      </p>
      {footnote ? <div className="m-data m-muted mt-1">{footnote}</div> : null}
    </>
  );

  if (!onPress) {
    return <div className={cn("m-card p-4", className)}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onPress}
      className={cn("m-card m-press p-4 text-left", className)}
    >
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
    <span className={cn("inline-flex items-center gap-1", up ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--m-error)]")}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {format(Math.abs(delta))}
      <span className="m-muted opacity-70">{label}</span>
    </span>
  );
}
