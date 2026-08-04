import { cn } from "@/lib/utils";
import {
  HEALTH_CLASS,
  HEALTH_LABEL,
  RISK_LEVEL_CLASS,
  RISK_LEVEL_SHORT_LABEL,
  type Health,
} from "@/lib/semantic-colors";
import type { RiskLevel } from "@/components/cockpit/risk/risk-model";
import { VELOCITY_LABEL } from "@/components/roster/model/velocity";
import type { VelocityBucket } from "@/components/roster/model/roster-types";

/**
 * Compact status marks for the mobile shell. Every one of them takes its
 * colour from semantic-colors.ts rather than defining its own — health and
 * risk mean the same thing here as they do in the cockpit, and a phone
 * inventing a second palette is how the two stop agreeing.
 *
 * Colour is never the only channel: each mark carries a label or an
 * accessible name alongside it.
 */

export function HealthDot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", HEALTH_CLASS[health].dot, className)}
      role="img"
      aria-label={HEALTH_LABEL[health]}
    />
  );
}

export function HealthPill({ health }: { health: Health }) {
  const c = HEALTH_CLASS[health];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        c.bg,
        c.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} aria-hidden="true" />
      {HEALTH_LABEL[health]}
    </span>
  );
}

export function RiskPill({ level, score }: { level: RiskLevel; score?: number | null }) {
  const c = RISK_LEVEL_CLASS[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        c.bg,
        c.text,
        c.border,
      )}
    >
      {RISK_LEVEL_SHORT_LABEL[level]}
      {score != null ? <span className="font-mono opacity-80">{score}</span> : null}
    </span>
  );
}

/** A neutral metadata chip — stage, pricing model, a count. */
export function MetaChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-[var(--m-keyline)] px-1.5 py-0.5 text-xs",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Velocity relative to the stage benchmark. NO_DATE renders nothing rather
 * than an em dash: on a card, a mark that means "no signal" is just noise
 * competing with the marks that do mean something.
 */
export function VelocityMark({ bucket, deltaDays }: { bucket: VelocityBucket; deltaDays: number | null }) {
  if (bucket === "NO_DATE") return null;
  const tone =
    bucket === "STALLED"
      ? "text-red-600 dark:text-red-400"
      : bucket === "SLOW"
        ? "text-orange-600 dark:text-orange-400"
        : bucket === "FAST"
          ? "text-emerald-600 dark:text-emerald-400"
          : "m-muted";
  return (
    <span className={cn("inline-flex items-center gap-1", tone)}>
      {VELOCITY_LABEL[bucket]}
      {deltaDays != null ? (
        <span className="font-mono opacity-80">
          {deltaDays > 0 ? "+" : ""}
          {deltaDays}d
        </span>
      ) : null}
    </span>
  );
}
