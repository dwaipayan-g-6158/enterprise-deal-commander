import type { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  HEALTH_CLASS,
  HEALTH_LABEL,
  OUTCOME_CLASS,
  OUTCOME_LABEL,
  RISK_LEVEL_CLASS,
  RISK_LEVEL_SHORT_LABEL,
  type Health,
} from "@/lib/semantic-colors";
import { terminalOutcome } from "@/components/roster/model/board";
import type { RiskLevel } from "@/components/cockpit/risk/risk-model";
import { VELOCITY_LABEL } from "@/components/roster/model/velocity";
import type { VelocityBucket } from "@/components/roster/model/roster-types";
import { TONE_AHEAD, TONE_SLIPPING, TONE_STALLED } from "@/mobile/lib/tones";

/**
 * Compact status marks for the mobile shell.
 *
 * The three pills are `Badge` underneath, so a mark here is structurally the
 * same object as a mark in the cockpit. Colour still comes from
 * semantic-colors.ts and is passed in rather than added to Badge's variants —
 * health and risk mean the same thing on a phone as they do on a desktop, and
 * a second palette is how the two stop agreeing.
 *
 * `MobilePill` carries the shell's own size and shape: `m-label` sets 13/550
 * against Badge's `text-xs font-semibold` (it wins because the mobile type
 * classes are unlayered), and `rounded-full` against its `rounded-md`. Both
 * are decisions about this shell, not about badges in general, which is why
 * they live here and not in the primitive.
 *
 * Colour is never the only channel: each mark carries a label or an
 * accessible name alongside it.
 */
function MobilePill({
  className,
  style,
  sharedPart,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  /** Names this pill as a part of the card→hero morph (lib/shared-card.ts). */
  sharedPart?: "value";
  children: ReactNode;
}) {
  return (
    <Badge
      variant="secondary"
      style={style}
      // Spread rather than written inline: BadgeProps doesn't declare data-*,
      // and JSX only permits arbitrary data attributes on intrinsic elements.
      {...(sharedPart ? { "data-shared-part": sharedPart } : {})}
      // Passed last so tailwind-merge drops Badge's own bg/text/border in
      // favour of the semantic classes the caller hands in.
      className={cn("m-label gap-1.5 rounded-full px-2.5 py-1", className)}
    >
      {children}
    </Badge>
  );
}

/**
 * `m-tint-shift` on all three: these levels move as a RESULT of something the
 * reader just did — dispositioning an alert, ticking a gate — and a pill that
 * teleports from amber to green reads as a different pill appearing rather than
 * as this one changing its mind. Colour only; the shade values themselves still
 * come from lib/semantic-colors.ts and are unchanged.
 */
export function HealthDot({ health, className }: { health: Health; className?: string }) {
  return (
    <span
      className={cn(
        "m-tint-shift inline-block h-2 w-2 shrink-0 rounded-full",
        HEALTH_CLASS[health].dot,
        className,
      )}
      role="img"
      aria-label={HEALTH_LABEL[health]}
    />
  );
}

/**
 * The phone's equivalent of the roster's StatusBadge: a decided deal has no
 * risk of not closing left to report, so it shows its outcome colour instead of
 * a health colour. Kept beside HealthDot rather than folded into it so nothing
 * named "health" renders an outcome.
 */
export function StatusDot({
  health,
  stage,
  className,
}: {
  health: Health;
  stage: string | null | undefined;
  className?: string;
}) {
  const outcome = terminalOutcome(stage);
  if (!outcome) return <HealthDot health={health} className={className} />;
  return (
    <span
      className={cn(
        "m-tint-shift inline-block h-2 w-2 shrink-0 rounded-full",
        OUTCOME_CLASS[outcome].dot,
        className,
      )}
      role="img"
      aria-label={OUTCOME_LABEL[outcome]}
    />
  );
}

export function HealthPill({ health }: { health: Health }) {
  const c = HEALTH_CLASS[health];
  return (
    <MobilePill className={cn("m-tint-shift border-transparent", c.bg, c.text)}>
      <span className={cn("m-tint-shift h-1.5 w-1.5 rounded-full", c.dot)} aria-hidden="true" />
      {HEALTH_LABEL[health]}
    </MobilePill>
  );
}

export function RiskPill({ level, score }: { level: RiskLevel; score?: number | null }) {
  const c = RISK_LEVEL_CLASS[level];
  return (
    <MobilePill className={cn("m-tint-shift", c.bg, c.text, c.border)}>
      {RISK_LEVEL_SHORT_LABEL[level]}
      {score != null ? <span className="opacity-80">{score}</span> : null}
    </MobilePill>
  );
}

/**
 * The outcome of an archived deal — Closed-Won or Closed-Lost.
 *
 * Takes `style` and `sharedPart` because this is the one pill that travels:
 * it is the part of an archive card that morphs into the detail screen's
 * hero badge.
 */
export function OutcomePill({
  className,
  style,
  sharedPart,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  sharedPart?: "value";
  children: ReactNode;
}) {
  return (
    <MobilePill className={cn("border-transparent", className)} style={style} sharedPart={sharedPart}>
      {children}
    </MobilePill>
  );
}

/** A neutral metadata chip — stage, pricing model, a count. */
export function MetaChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("m-caption border-border px-1.5 py-0.5", className)}
    >
      {children}
    </Badge>
  );
}

/**
 * Velocity relative to the stage benchmark. NO_DATE renders nothing rather
 * than an em dash: on a card, a mark that means "no signal" is just noise
 * competing with the marks that do mean something.
 *
 * Not a pill — it sits inline in a metadata row, where a filled chip would
 * outrank the stage chip next to it.
 */
export function VelocityMark({ bucket, deltaDays }: { bucket: VelocityBucket; deltaDays: number | null }) {
  if (bucket === "NO_DATE") return null;
  const tone =
    bucket === "STALLED"
      ? TONE_STALLED
      : bucket === "SLOW"
        ? TONE_SLIPPING
        : bucket === "FAST"
          ? TONE_AHEAD
          : "m-muted";
  return (
    <span className={cn("inline-flex items-center gap-1", tone)}>
      {VELOCITY_LABEL[bucket]}
      {deltaDays != null ? (
        <span className="opacity-80">
          {deltaDays > 0 ? "+" : ""}
          {deltaDays}d
        </span>
      ) : null}
    </span>
  );
}
