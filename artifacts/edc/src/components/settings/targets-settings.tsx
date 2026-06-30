import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListPipelineTargets, useUpsertPipelineTarget } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { Target } from "lucide-react";

interface PipelineTargetRow {
  id: string;
  periodStart: string;
  targetValue: number;
}

function quarterStart(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0, 10);
}

export function TargetsSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListPipelineTargets();
  const upsert = useUpsertPipelineTarget();

  const [period, setPeriod] = useState(quarterStart());
  const [value, setValue] = useState("");

  const targets = (list.data?.data ?? []) as PipelineTargetRow[];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const save = async () => {
    if (!value) return;
    try {
      await upsert.mutateAsync({ data: { periodStart: period, targetValue: Number(value) } });
      await invalidate();
      setValue("");
      toast({ title: "Target saved", description: "Pipeline target updated." });
    } catch {
      toast({ title: "Failed to save target", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-md">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Quarterly Pipeline Targets</CardTitle>
            <CardDescription>
              Set the qualified-pipeline target per quarter. Drives coverage ratios and pipeline health.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Quarter start</label>
            <DatePicker value={period} onChange={setPeriod} placeholder="Quarter start" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Target (USD)</label>
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="5000000"
            />
          </div>
          <Button disabled={!value || upsert.isPending} onClick={save}>
            {upsert.isPending ? "Saving..." : "Save"}
          </Button>
        </div>

        <div className="space-y-1">
          {targets.length === 0 && (
            <p className="text-sm text-muted-foreground">No targets set yet. Add one above.</p>
          )}
          {targets.map((t) => (
            <div
              key={t.id}
              className="flex justify-between text-sm tabular-nums border-b border-border py-1.5"
            >
              <span>{t.periodStart}</span>
              <span className="font-mono">${Number(t.targetValue).toLocaleString("en-US")}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
