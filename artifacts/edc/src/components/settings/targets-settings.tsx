import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListPipelineTargets, useUpsertPipelineTarget } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { Target } from "lucide-react";
import { AdminOnly } from "@/components/auth/write-gate";
import { useCanWrite } from "@/lib/auth/role-context";
import { quarterStartISO, todayUTCISO } from "@/lib/format";

interface PipelineTargetRow {
  id: string;
  periodStart: string;
  targetValue: number;
}

// quarterStartISO/todayUTCISO live in lib/format.ts (unit-tested there) and
// share their flooring math with the server's routes/v2/analytics.ts
// activeQuarterStart() via @workspace/engine's quarterStartUTC — see
// format.ts's "Quarter-start (UTC)" section for the full reasoning on why
// this one feature is UTC-based while the rest of the app's date handling is
// local-calendar.

export function TargetsSettings() {
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const qc = useQueryClient();
  const list = useListPipelineTargets();
  const upsert = useUpsertPipelineTarget();

  const [period, setPeriod] = useState(quarterStartISO(todayUTCISO()));
  const [value, setValue] = useState("");

  const targets = (list.data?.data ?? []) as PipelineTargetRow[];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const save = async () => {
    if (!value) return;
    try {
      await upsert.mutateAsync({
        data: {
          // Sent explicitly rather than relying on the PUT route's default —
          // see task-4-brief.md — and re-snapped defensively even though
          // `period` is already quarter-granular via the DatePicker's
          // onChange below, so a future caller of setPeriod() can't sneak an
          // off-quarter date past this save.
          periodType: "quarter",
          periodStart: quarterStartISO(period),
          targetValue: Number(value),
        },
      });
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
        <AdminOnly>
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed p-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Quarter</label>
              <DatePicker
                value={period}
                onChange={(v) => setPeriod(quarterStartISO(v))}
                placeholder="Pick any date in the quarter"
              />
              <p className="text-[11px] text-muted-foreground mt-1 max-w-[16rem]">
                Any date you pick snaps to that quarter's start — targets are
                per-quarter, not per-day.
              </p>
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
        </AdminOnly>

        <div className="space-y-1">
          {targets.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {canWrite ? "No targets set yet. Add one above." : "No targets set yet."}
            </p>
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
