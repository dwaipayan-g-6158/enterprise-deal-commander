import { Link } from "wouter";
import { AlertTriangle, ArrowRight, ShieldAlert, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { shortDate } from "@/components/dashboard/widgets/_shared";
import { HealthBadge, ScoreCell, VelocityCell, LastActivityCell } from "./cells";
import { useDealPreview } from "./hooks/use-deal-preview";
import type { RosterRow } from "./model/roster-types";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

const SEV_DOT: Record<string, string> = {
  RED: "bg-red-500",
  YELLOW: "bg-amber-500",
  GREEN: "bg-emerald-500",
};

// Shared detail body for the preview panel and inline row expansion. The header
// + instant stats come from the already-loaded row; the deep sections fetch
// lazily via useDealPreview (cache shared between panel and expansion).
export function PreviewContent({
  row,
  variant = "panel",
}: {
  row: RosterRow;
  variant?: "panel" | "inline";
}) {
  const { deal, intelligence, isLoading } = useDealPreview(row.id);

  const alerts = intelligence?.governance.alerts ?? [];
  const blockerCount = intelligence?.governance.activeBlockerCount ?? 0;
  const unmanaged = intelligence?.governance.unmanagedAlertCount ?? 0;

  return (
    <div className={cn(variant === "panel" ? "space-y-5" : "grid gap-5 md:grid-cols-3")}>
      {/* Instant header + stats (no fetch needed) */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground">{row.accountName}</div>
            <div className="font-semibold leading-tight">{row.dealName}</div>
          </div>
          <HealthBadge health={row.healthStatus} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="TCV">
            <span className="font-mono">{formatCurrency(row.calculatedTCV ?? 0, row.dealCurrency)}</span>
          </Stat>
          <Stat label="Stage">{row.salesStage}</Stat>
          <Stat label="Score">
            <ScoreCell score={row.score} delta={row.scoreDelta} />
          </Stat>
          <Stat label="Gates">{row.gatesPct}%</Stat>
          <Stat label="Velocity">
            <VelocityCell bucket={row.velocity} delta={row.deltaDays} />
          </Stat>
          <Stat label="Close">{shortDate(row.expectedCloseDate) ?? "—"}</Stat>
          <Stat label="Last activity">
            <LastActivityCell days={row.daysSinceLastActivity} />
          </Stat>
        </div>
      </div>

      {/* Governance / risk */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            {isLoading ? <Skeleton className="h-4 w-6" /> : <span className="font-medium">{unmanaged}</span>} unmanaged
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Ban className="h-4 w-4 text-red-500" />
            {isLoading ? <Skeleton className="h-4 w-6" /> : <span className="font-medium">{blockerCount}</span>} blockers
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : alerts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active risk alerts.</p>
        ) : (
          <ul className="space-y-1.5">
            {alerts.slice(0, variant === "panel" ? 5 : 3).map((a) => (
              <li key={a.code} className="flex items-start gap-2 text-xs">
                <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", SEV_DOT[a.severity] ?? "bg-muted")} />
                <span className="text-muted-foreground">{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Strategic note + next step */}
      <div className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            {deal?.managerStrategicBlueprint && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Strategic blueprint</div>
                <p className="text-xs leading-relaxed line-clamp-4">{deal.managerStrategicBlueprint}</p>
              </div>
            )}
            {intelligence?.recommendations?.[0] && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                <span>{intelligence.recommendations[0].rationale}</span>
              </div>
            )}
          </>
        )}
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/deals/${row.id}`}>
            Open cockpit <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
