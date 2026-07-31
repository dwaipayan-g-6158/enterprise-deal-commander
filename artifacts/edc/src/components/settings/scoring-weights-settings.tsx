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
import { AdminOnly } from "@/components/auth/write-gate";
import { useCanWrite } from "@/lib/auth/role-context";
import { serverMessage } from "@/lib/server-message";

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
  const canWrite = useCanWrite();
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
  const dirty = rows.some((r) => pct[r.featureId] !== (r.weight * 100).toFixed(0));

  // Clamp a raw input value into the valid 0-100 percentage range. The Input's
  // min/max HTML attributes never fire here (no <form>, Apply is a click
  // handler), so out-of-range values must be clamped in JS before they land in
  // state — otherwise a negative or absurd percentage would be sent to the API.
  const clampPct = (raw: string): string => {
    if (raw === "") return raw;
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return String(Math.max(0, Math.min(100, n)));
  };

  const save = async () => {
    try {
      const weights = Object.entries(pct).map(([feature_id, v]) => ({
        feature_id,
        weight: (Number(v) || 0) / 100,
      }));
      const result = await update.mutateAsync({ data: { weights } });
      await qc.invalidateQueries({ queryKey: list.queryKey });
      const rescored = Number(result.data.rescored);
      const count = Number.isFinite(rescored) ? rescored : 0;
      toast({
        title: "Scoring weights updated",
        description: `${count} deal${count === 1 ? "" : "s"} re-scored with the new factor weights.`,
      });
    } catch (err) {
      toast({ title: "Failed to update weights", description: serverMessage(err, ""), variant: "destructive" });
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
              Tune how much each factor contributes to a deal's predictive score. Weights are
              relative to each other and are normalized automatically, so the total doesn't
              need to be exactly 100%.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" title="Weights are relative to each other and get normalized automatically — the total doesn't need to be 100%.">
            Total: {Math.round(total)}% (normalized automatically)
          </Badge>
          <AdminOnly>
            <Button disabled={!dirty || update.isPending} onClick={save} className="gap-2">
              <Save className="w-4 h-4" />
              {update.isPending ? "Applying..." : "Apply Weights"}
            </Button>
          </AdminOnly>
        </div>

        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing to tune yet — scoring factors will show up here once they're configured.</p>
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
                onChange={(e) =>
                  setPct((p) => ({ ...p, [r.featureId]: clampPct(e.target.value) }))
                }
                className="font-mono"
                disabled={!canWrite}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
