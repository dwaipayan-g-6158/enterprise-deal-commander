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

interface PipelineTargetRow {
  id: string;
  periodStart: string;
  targetValue: number;
}

// Snaps a "YYYY-MM-DD" date-only string to the start of its calendar quarter
// ("2026-08-17" -> "2026-07-01"). Pure string/number surgery on the parsed
// year/month — never routes through `Date`, so there's no local-vs-UTC
// timezone step to get wrong (see lib/format.ts's header comment on why a
// date-only string is never handed to the `Date` constructor).
//
// This must land on the exact same quarter boundary as the server's
// activeQuarterStart() (routes/v2/analytics.ts), which floors
// `Math.floor(utcMonth / 3) * 3` against the UTC calendar date. The two used
// to disagree: this file previously built a `Date` from LOCAL parts and read
// it back with local getters, which names a different calendar day than the
// UTC one near a quarter boundary in any positive-offset timezone (e.g.
// IST — local midnight on the 1st of a quarter is still the last UTC day of
// the prior quarter). Since pipeline_targets.period_start is stored as a
// bare, timezone-less date-only string, UTC is the one frame both sides can
// agree on without a "whose local time?" ambiguity — a literal shared helper
// isn't possible across the browser/Node boundary, so this formula is
// intentionally duplicated (not imported) on both sides; keep them in sync
// if it ever changes.
function quarterStartISO(dateOnlyISO: string): string {
  const [yStr, moStr] = dateOnlyISO.slice(0, 10).split("-");
  const month0 = Number(moStr) - 1; // 0-indexed, matches Math.floor(.../3) below
  const qMonth0 = Math.floor(month0 / 3) * 3;
  return `${yStr}-${String(qMonth0 + 1).padStart(2, "0")}-01`;
}

// "Today" as the UTC calendar date, matching the server's activeQuarterStart()
// (which derives the active quarter from the UTC calendar date too). Using
// the browser's LOCAL calendar date here would reintroduce the disagreement
// quarterStartISO's comment describes, so this deliberately does not use a
// local-calendar helper like toLocalISODate(new Date()).
function todayUTCISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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
