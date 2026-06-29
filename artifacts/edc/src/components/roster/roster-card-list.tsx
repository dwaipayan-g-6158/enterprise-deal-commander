import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { HealthBadge, RiskCell, ScoreCell, VelocityCell, CloseDateCell, HEALTH_BORDER, RISK_BORDER, TerminalStageBadge } from "./cells";
import type { Health, RosterRow } from "./model/roster-types";

// Card view used at mobile + tablet widths (the table would force horizontal
// scroll there). One card per deal with the key triage signals; tapping the
// card opens the cockpit. Touch targets stay >= 44px tall.
export function RosterCardList({ rows }: { rows: RosterRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((deal) => (
        <Link
          key={deal.id}
          href={`/deals/${deal.id}`}
          className={cn(
            "block rounded-lg border p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            deal.riskLevel ? RISK_BORDER[deal.riskLevel] : HEALTH_BORDER[deal.healthStatus as Health],
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold">{deal.accountName}</span>
            <HealthBadge health={deal.healthStatus} />
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <p className="text-sm text-muted-foreground">{deal.dealName}</p>
            <TerminalStageBadge stage={deal.salesStage} />
          </div>
          <p className="text-xl font-bold font-mono mt-1 tabular-nums">
            {formatCurrency(deal.calculatedTCV ?? 0, deal.dealCurrency)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{deal.salesStage}</span>
            <span className="inline-flex items-center gap-1">
              Risk <RiskCell score={deal.riskScore} level={deal.riskLevel} />
            </span>
            <span className="inline-flex items-center gap-1">
              Score <ScoreCell score={deal.score} />
            </span>
            <span className="inline-flex items-center gap-1">
              <VelocityCell bucket={deal.velocity} delta={deal.deltaDays} />
            </span>
            <span className="inline-flex items-center gap-1">
              Close <CloseDateCell iso={deal.expectedCloseDate} />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
