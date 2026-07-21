import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  useSetDisposition,
  useClearDisposition,
  useLaunchIntervention,
  useListInterventionChecklists,
  type Alert,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useCockpitInvalidate } from "./use-invalidate";
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  ChevronDown,
  Info,
  Shield,
  Check,
  Clock,
  ShieldOff,
  Zap,
  RotateCcw,
} from "lucide-react";
import { type DealRisk } from "./risk/risk-model";
import { RiskScoreCard } from "./risk/risk-score-card";

function AlertCard({ dealId, alert, isManaged = false }: { dealId: string; alert: Alert; isManaged?: boolean }) {
  const { toast } = useToast();
  const invalidate = useCockpitInvalidate(dealId);
  const setDisposition = useSetDisposition();
  const clearDisposition = useClearDisposition();
  const launchIntervention = useLaunchIntervention();
  const { data: checklists } = useListInterventionChecklists();

  const [rationale, setRationale] = useState("");
  const [showAccept, setShowAccept] = useState(false);
  const [checklistId, setChecklistId] = useState<string>("");

  if (process.env.NODE_ENV !== "production" && isManaged && !alert.disposition) {
    console.error(
      `[AlertCard] isManaged=true but disposition is null for pattern "${alert.code}". Engine filter invariant broken.`,
    );
  }

  const relevantChecklists = checklists?.data.filter((c) => c.triggerPatternCode === alert.code) ?? [];

  const apply = async (
    disposition: "acknowledge" | "accept" | "snooze",
    extra?: { rationale?: string; snooze_until_field_change?: string },
  ) => {
    try {
      await setDisposition.mutateAsync({
        dealId,
        patternCode: alert.code,
        data: { disposition, ...extra },
      });
      await invalidate();
      toast({ title: "Disposition recorded", description: `${alert.code} marked as ${disposition}.` });
      setShowAccept(false);
      setRationale("");
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: "Action failed", description: msg ?? "Could not record disposition.", variant: "destructive" });
    }
  };

  const clear = async () => {
    try {
      await clearDisposition.mutateAsync({ dealId, patternCode: alert.code });
      await invalidate();
      toast({ title: "Disposition cleared", description: `${alert.code} returned to active.` });
    } catch {
      toast({ title: "Action failed", description: "Could not clear disposition.", variant: "destructive" });
    }
  };

  const launch = async () => {
    if (!checklistId) return;
    try {
      await launchIntervention.mutateAsync({
        dealId,
        data: { pattern_code: alert.code, checklist_id: Number(checklistId) },
      });
      await invalidate();
      toast({ title: "Intervention launched", description: "Playbook attached to this pattern." });
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: "Launch failed", description: msg ?? "Could not launch intervention.", variant: "destructive" });
    }
  };

  const isRed = alert.severity === "RED";
  const codeColorCls = isRed
    ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
    : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400";

  return (
    <Card className={cn("border-l-4", isRed ? "border-l-destructive" : "border-l-amber-500")}>
      <CardContent className="p-4 space-y-3">
        {/* Header: icon + code badge + severity + disposition */}
        <div className="flex gap-3">
          {isRed ? (
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <code className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium border", codeColorCls)}>
                {alert.code}
              </code>
              <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", codeColorCls)}>
                {alert.severity}
              </span>
              {alert.disposition && (
                <Badge variant="outline" className="capitalize text-[10px] h-5 py-0">
                  {alert.disposition.state}
                </Badge>
              )}
            </div>
            <p className="text-sm leading-snug">{alert.message}</p>
            {alert.intervention && (
              <p className="flex items-center gap-1 text-xs text-primary mt-0.5">
                <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
                {alert.intervention.name}
              </p>
            )}
          </div>
        </div>

        {/* Why this fired */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Info className="h-3 w-3" /> Why this fired
            <ChevronDown className="h-3 w-3" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 text-xs space-y-2">
            {alert.explanation.inputs.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Inputs</p>
                {alert.explanation.inputs.map((i, idx) => (
                  <div key={idx} className="flex justify-between py-0.5">
                    <span>{i.label}</span>
                    <span className="font-mono text-muted-foreground">{String(i.value ?? "")}</span>
                  </div>
                ))}
              </div>
            )}
            {alert.explanation.thresholdsUsed.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground mb-1">Thresholds</p>
                {alert.explanation.thresholdsUsed.map((t, idx) => (
                  <div key={idx} className="flex justify-between py-0.5">
                    <span className="font-mono">{t.key}</span>
                    <span className="font-mono">
                      {String(t.value ?? "")} <span className="text-muted-foreground">({t.source})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Clears when:</span> {alert.explanation.clearsWhen}
            </p>
          </CollapsibleContent>
        </Collapsible>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {isManaged || alert.disposition ? (
            <Button size="sm" variant="outline" onClick={clear} disabled={clearDisposition.isPending} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Clear Disposition
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => apply("acknowledge")} disabled={setDisposition.isPending} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> Acknowledge
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => apply("snooze", { snooze_until_field_change: "any" })}
                disabled={setDisposition.isPending}
                className="gap-1.5"
              >
                <Clock className="h-3.5 w-3.5" /> Snooze
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAccept((s) => !s)}
                className={cn(
                  "gap-1.5",
                  isRed
                    ? "border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive"
                    : "border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/5 hover:border-amber-500",
                )}
              >
                <ShieldOff className="h-3.5 w-3.5" /> Accept Risk
              </Button>
            </>
          )}
        </div>

        {showAccept && !alert.disposition && (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <Label className="text-xs">Rationale (required, min 10 chars)</Label>
            <Textarea
              rows={2}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why is accepting this risk justified?"
            />
            <Button
              size="sm"
              disabled={rationale.trim().length < 10 || setDisposition.isPending}
              onClick={() => apply("accept", { rationale: rationale.trim() })}
            >
              Confirm Accept
            </Button>
          </div>
        )}

        {relevantChecklists.length > 0 && !alert.intervention && (
          <div className="flex gap-2 items-center pt-1">
            <Select value={checklistId} onValueChange={setChecklistId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select playbook" />
              </SelectTrigger>
              <SelectContent>
                {relevantChecklists.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="secondary" onClick={launch} disabled={!checklistId || launchIntervention.isPending}>
              Launch
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RiskGovernance({ dealId, alerts, managedAlerts = [], risk }: { dealId: string; alerts: Alert[]; managedAlerts?: Alert[]; risk?: DealRisk | null }) {
  const [managedOpen, setManagedOpen] = useState(false);

  if (!risk && alerts.length === 0 && managedAlerts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center">
          <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
          <p>Nothing critical right now. Enjoy the calm.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {risk ? <RiskScoreCard risk={risk} /> : null}
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">All clear — nothing to flag.</p>
      ) : (
        alerts.map((alert) => (
          <AlertCard key={alert.code} dealId={dealId} alert={alert} />
        ))
      )}

      {managedAlerts.length > 0 && (
        <Collapsible open={managedOpen} onOpenChange={setManagedOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
              <span className="flex items-center gap-2 text-xs font-medium">
                <Shield className="h-3.5 w-3.5" />
                Managed risks
                <span className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-semibold min-w-[18px] h-[18px] px-1.5 tabular-nums border border-border">
                  {managedAlerts.length}
                </span>
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${managedOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-3 opacity-65">
              {managedAlerts.map((alert) => (
                <AlertCard key={alert.code} dealId={dealId} alert={alert} isManaged />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
