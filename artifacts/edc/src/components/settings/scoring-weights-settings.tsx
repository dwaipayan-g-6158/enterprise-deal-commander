import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListScoringWeights,
  useUpdateScoringWeights,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SlidersHorizontal, Save } from "lucide-react";

interface WeightRow {
  featureId: string;
  weight: number; // fraction of 1.0
}

// Friendly labels for the predictive-score factors.
const FACTOR_LABELS: Record<string, string> = {
  gate_momentum: "Technical gate progress",
  stage_velocity: "Stage velocity vs benchmark",
  services_attachment: "Services attachment",
  executive_alignment: "Executive alignment",
  blocker_load: "Blocker load",
  deal_size_confidence: "Deal-size confidence",
  close_pressure: "Close-date pressure",
  historical_win_rate: "Historical win rate",
  playbook_adherence: "Playbook adherence",
};

export function ScoringWeightsSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListScoringWeights();
  const update = useUpdateScoringWeights();

  const rows = (list.data?.data ?? []) as WeightRow[];
  // Local edits held as percentage strings (fraction × 100) for a friendlier UI.
  const [pct, setPct] = useState<Record<string, string>>({});

  useEffect(() => {
    if (rows.length > 0) {
      const init: Record<string, string> = {};
      for (const r of rows) init[r.featureId] = (r.weight * 100).toFixed(0);
      setPct(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data]);

  const total = Object.values(pct).reduce((a, b) => a + (Number(b) || 0), 0);
  const sumOk = Math.round(total) === 100;
  const dirty = rows.some((r) => pct[r.featureId] !== (r.weight * 100).toFixed(0));

  const save = async () => {
    try {
      const weights = Object.entries(pct).map(([feature_id, v]) => ({
        feature_id,
        weight: (Number(v) || 0) / 100,
      }));
      await update.mutateAsync({ data: { weights } });
      await qc.invalidateQueries({ queryKey: list.queryKey });
      toast({
        title: "Scoring weights updated",
        description: "Deals will re-score with the new factor weights.",
      });
    } catch {
      toast({ title: "Failed to update weights", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-md">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Predictive Score Weights</CardTitle>
            <CardDescription>
              Tune how much each factor contributes to a deal's predictive score. Weights
              should total 100%.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant={sumOk ? "secondary" : "destructive"}>
            Total: {Math.round(total)}%{sumOk ? "" : " (should be 100%)"}
          </Badge>
          <Button disabled={!dirty || update.isPending} onClick={save} className="gap-2">
            <Save className="w-4 h-4" />
            {update.isPending ? "Applying..." : "Apply Weights"}
          </Button>
        </div>

        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No scoring weights configured.</p>
        )}

        {rows.map((r) => (
          <div
            key={r.featureId}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-4 border rounded-lg bg-muted/20"
          >
            <div className="md:col-span-2">
              <p className="font-medium text-sm">{FACTOR_LABELS[r.featureId] ?? r.featureId}</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{r.featureId}</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={pct[r.featureId] ?? ""}
                onChange={(e) => setPct((p) => ({ ...p, [r.featureId]: e.target.value }))}
                className="font-mono"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
