import { useState } from "react";
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
} from "lucide-react";

function AlertCard({ dealId, alert }: { dealId: string; alert: Alert }) {
  const { toast } = useToast();
  const invalidate = useCockpitInvalidate(dealId);
  const setDisposition = useSetDisposition();
  const clearDisposition = useClearDisposition();
  const launchIntervention = useLaunchIntervention();
  const { data: checklists } = useListInterventionChecklists();

  const [rationale, setRationale] = useState("");
  const [showAccept, setShowAccept] = useState(false);
  const [checklistId, setChecklistId] = useState<string>("");

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

  return (
    <Card className={`border-l-4 ${isRed ? "border-l-destructive" : "border-l-amber-500"}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-3">
          {isRed ? (
            <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-sm">{alert.message}</h4>
              {alert.disposition && (
                <Badge variant="outline" className="capitalize shrink-0">
                  {alert.disposition.state}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{alert.code}</p>
            {alert.intervention && (
              <p className="text-xs text-primary mt-1">Intervention: {alert.intervention.name}</p>
            )}
          </div>
        </div>

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Info className="h-3 w-3" /> Why this fired
            <ChevronDown className="h-3 w-3" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 text-xs space-y-2">
            {alert.explanation.inputs.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground">Inputs</p>
                {alert.explanation.inputs.map((i, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{i.label}</span>
                    <span className="font-mono">{String(i.value ?? "")}</span>
                  </div>
                ))}
              </div>
            )}
            {alert.explanation.thresholdsUsed.length > 0 && (
              <div>
                <p className="font-medium text-muted-foreground">Thresholds</p>
                {alert.explanation.thresholdsUsed.map((t, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="font-mono">{t.key}</span>
                    <span className="font-mono">
                      {String(t.value ?? "")} <span className="text-muted-foreground">({t.source})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted-foreground">
              <span className="font-medium">Clears when:</span> {alert.explanation.clearsWhen}
            </p>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex flex-wrap gap-2 pt-1">
          {alert.disposition ? (
            <Button size="sm" variant="outline" onClick={clear} disabled={clearDisposition.isPending}>
              Clear Disposition
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => apply("acknowledge")} disabled={setDisposition.isPending}>
                Acknowledge
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => apply("snooze", { snooze_until_field_change: "any" })}
                disabled={setDisposition.isPending}
              >
                Snooze
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAccept((s) => !s)}>
                Accept Risk
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

export function RiskGovernance({ dealId, alerts }: { dealId: string; alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center">
          <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
          <p>No active risk patterns detected.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {alerts.map((alert) => (
        <AlertCard key={alert.code} dealId={dealId} alert={alert} />
      ))}
    </div>
  );
}
