import { useGetSnapshot, type Deal, type Intelligence } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, CheckCircle, AlertTriangle, ShieldAlert } from "lucide-react";
import { formatCurrency } from "./use-invalidate";

export function BriefingMode({
  deal,
  intel,
  onClose,
}: {
  deal: Deal;
  intel: Intelligence;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: snapshot } = useGetSnapshot(deal.id, { date: today });

  const health = deal.healthStatus;
  const healthColor =
    health === "RED" ? "text-destructive" : health === "YELLOW" ? "text-amber-500" : "text-emerald-500";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="flex justify-between items-start mb-12">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
              Executive Briefing
            </p>
            <h1 className="text-5xl font-bold tracking-tight">{deal.dealName}</h1>
            <p className="text-2xl text-muted-foreground mt-2">{deal.accountName}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-6 w-6" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-8 mb-12">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Normalized TCV</p>
            <p className="text-4xl font-bold font-mono">
              {formatCurrency(intel.financials.normalizedTCV, intel.financials.reportingCurrency)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Health Status</p>
            <p className={`text-4xl font-bold ${healthColor}`}>{health}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Technical Progress</p>
            <p className="text-4xl font-bold font-mono">{intel.technicalTrack.progressPercentage}%</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-12">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Sales Stage</p>
            <p className="text-xl">{intel.salesStage}</p>
            <p className="text-sm text-muted-foreground">{intel.daysInStage} days in stage</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Team</p>
            <p className="text-xl">{intel.team.accountManager}</p>
            <p className="text-sm text-muted-foreground">Technical: {intel.team.technicalLead}</p>
          </div>
        </div>

        {deal.managerStrategicBlueprint && (
          <div className="mb-12">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Strategic Blueprint</p>
            <p className="text-lg leading-relaxed">{deal.managerStrategicBlueprint}</p>
          </div>
        )}

        <div className="mb-12">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Risk Posture</p>
          {intel.governance.alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle className="h-5 w-5" />
              <span className="text-lg">No active risk patterns.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {intel.governance.alerts.map((a) => (
                <div key={a.code} className="flex items-start gap-3">
                  {a.severity === "RED" ? (
                    <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-lg">{a.message}</p>
                    {a.disposition && (
                      <Badge variant="outline" className="capitalize mt-1">
                        {a.disposition.state}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {deal.speakerNotes && (
          <div className="mb-12 border-t pt-8">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Speaker Notes</p>
            <p className="text-base leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {deal.speakerNotes}
            </p>
          </div>
        )}

        {snapshot?.data && (
          <p className="text-xs text-muted-foreground">
            Snapshot as of {new Date(snapshot.data.asOf).toLocaleString()}
            {snapshot.data.reconstructed ? " (reconstructed)" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
