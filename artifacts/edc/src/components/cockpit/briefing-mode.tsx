import { useMemo, useRef, useState } from "react";
import { useGetSnapshot, type Deal, type Intelligence } from "@workspace/api-client-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { X, CheckCircle, AlertTriangle, ShieldAlert, Printer, ImageDown, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "./use-invalidate";
import { useEngineContext, recomputeIntelligence } from "./engine-recompute";

export function BriefingMode({
  deal,
  intel,
  onClose,
}: {
  deal: Deal;
  intel: Intelligence;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const isHistorical = date !== today;
  const { data: snapshot } = useGetSnapshot(deal.id, { date });
  const contentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const ctx = useEngineContext(deal, intel);

  const asOf = useMemo(() => {
    if (!isHistorical || !snapshot?.data) return null;
    const gates: Record<string, boolean> = {};
    for (const g of snapshot.data.gates) gates[g.gateCode] = g.isCompleted;
    return recomputeIntelligence(deal, intel, { gates }, ctx);
  }, [isHistorical, snapshot, deal, intel, ctx]);

  const progressPercentage = asOf?.technicalTrack.progressPercentage ?? intel.technicalTrack.progressPercentage;
  const alerts = asOf?.governance.alerts ?? intel.governance.alerts;

  const handlePrint = () => window.print();

  const handlePng = async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(contentRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: bg,
      });
      const link = document.createElement("a");
      link.download = `briefing-${deal.dealName.replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast({ title: "Could not export image", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const health = asOf?.governance.healthStatus ?? deal.healthStatus;
  const healthColor =
    health === "RED" ? "text-destructive" : health === "YELLOW" ? "text-amber-500" : "text-emerald-500";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto print:static print:overflow-visible">
      <div className="max-w-5xl mx-auto px-8 py-6 flex items-center gap-2 flex-wrap print:hidden">
        <div className="flex items-center gap-2 mr-auto">
          <History className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto h-9"
          />
          {isHistorical && (
            <Button variant="ghost" size="sm" onClick={() => setDate(today)}>
              Today
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" /> Print / PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handlePng} disabled={exporting}>
          <ImageDown className="h-4 w-4 mr-2" /> {exporting ? "Exporting..." : "PNG"}
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div ref={contentRef} className="max-w-5xl mx-auto px-8 pb-12 pt-6 bg-background">
        <div className="mb-12">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
              Executive Briefing
            </p>
            <h1 className="text-5xl font-bold tracking-tight">{deal.dealName}</h1>
            <p className="text-2xl text-muted-foreground mt-2">{deal.accountName}</p>
          </div>
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
            <p className="text-4xl font-bold font-mono">{progressPercentage}%</p>
          </div>
        </div>

        {isHistorical && (
          <div className="mb-12 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Showing technical validation and risk posture reconstructed as of{" "}
            {new Date(date).toLocaleDateString()}. Deal economics and sales stage reflect current values.
          </div>
        )}

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
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle className="h-5 w-5" />
              <span className="text-lg">No active risk patterns.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => (
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
