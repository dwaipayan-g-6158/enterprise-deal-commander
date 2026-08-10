import { useRef } from "react";
import { Link } from "wouter";
import { Lightbulb } from "lucide-react";
import { defaultStore } from "@/lib/storage";
import { buildInsights, type InsightBuilderInputs } from "@/lib/insights/insight-builder";
import { pickInsight } from "@/lib/insights/insight-history";
import { MobileCard } from "@/mobile/components/mobile-card";

/**
 * One observation, rotated.
 *
 * ## Exactly one, and that is the design
 *
 * The desktop dashboard renders the whole candidate list — the week-over-week
 * comparison, the stale-deal anomaly, and every deterministic memory pattern —
 * as a stack. On a phone that is a wall of hedged sentences between the reader
 * and the thing they opened the app for, and the honest observation is that
 * nobody reads the fourth one.
 *
 * So the builder still produces every candidate (it is pure and already tested)
 * and `pickInsight` chooses one, excluding anything shown in the last 48 hours
 * so opening the app twice in a morning does not repeat itself.
 *
 * ## Locked for the life of the mount
 *
 * `pickInsight` is random AND it writes to storage. Calling it during render on
 * every pass would rotate the card mid-read and fill the dedup history with
 * insights nobody saw. The ref holds the first pick made once the inputs are
 * present — the same lock the greeting uses, for the same reason.
 */
export function ReadBlock({ inputs }: { inputs: InsightBuilderInputs }) {
  const lockRef = useRef<ReturnType<typeof pickInsight> | null>(null);
  const hasInputs = inputs.vitalSigns != null || inputs.summary != null || inputs.memoryInsights != null;

  if (lockRef.current === null && hasInputs) {
    const now = new Date();
    lockRef.current = pickInsight(buildInsights(inputs, now), defaultStore, now);
  }

  const insight = lockRef.current;
  // No candidates is a real and common state — a fresh portfolio has no
  // baseline to compare against and nothing archived to match. A card that says
  // "no insights available" is worse than no card.
  if (!insight) return null;

  const body = (
    <div className="flex gap-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="m-headline text-pretty">{insight.text}</p>
        {insight.detail ? (
          <p className="m-caption m-muted mt-1 text-pretty">{insight.detail}</p>
        ) : null}
        {insight.supportingDeals && insight.supportingDeals.length > 0 ? (
          // The evidence, named. An observation the reader cannot check is an
          // assertion, and this one is derived from deterministic rules that
          // can always name the rows behind them.
          <p className="m-caption m-muted mt-1.5 truncate">
            {insight.supportingDeals
              .slice(0, 3)
              .map((d) => d.dealName)
              .join(" · ")}
            {insight.supportingDeals.length > 3 ? ` +${insight.supportingDeals.length - 3}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (!insight.navigateTo) return <MobileCard>{body}</MobileCard>;

  return (
    <Link href={insight.navigateTo} className="m-card m-press m-reveal block p-4">
      {body}
    </Link>
  );
}
