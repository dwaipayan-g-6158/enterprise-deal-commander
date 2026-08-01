import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSettingsChangeLog,
  useGetSettingsChange,
  getGetSettingsChangeQueryKey,
  useRollbackSettingsChange,
  useExportSettingsConfig,
  getExportSettingsConfigQueryKey,
  getListEngineThresholdsQueryKey,
  type SettingsChangeLogEntry,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AdminOnly, ReadOnlyNotice } from "@/components/auth/write-gate";
import { useCanWrite } from "@/lib/auth/role-context";
import { relativeTime, formatDateTime, humanizeCode } from "@/lib/format";
import { serverMessage } from "@/lib/server-message";
import { canRollback, formatChangeValue, buildExportFilename } from "./change-log-model";
import { History, Download, Undo2 } from "lucide-react";

// Every `module` string any route currently passes to logSettingsChange()
// (grepped across artifacts/api-server/src/routes + lib/settings-audit.ts):
// lookups.ts (competitors, compliance_drivers, team_members,
// engine_thresholds, fx_rates), users.ts (users), v2/config.ts
// (custom_risk_patterns, pipeline_targets, scoring_model_weights),
// v2/crud.ts (webhooks, notification_rules), settings-audit.ts itself
// (rollback/import reuse whatever module the original row had). Not
// exhaustive by contract — a future route can add a new module string at
// any time, and "All modules" always covers it — this just seeds the
// filter with the values known to exist today instead of starting empty.
const KNOWN_MODULES = [
  "engine_thresholds",
  "scoring_model_weights",
  "pipeline_targets",
  "team_members",
  "custom_risk_patterns",
  "webhooks",
  "notification_rules",
  "users",
  "competitors",
  "compliance_drivers",
  "fx_rates",
];

export function ChangeLogSettings() {
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const qc = useQueryClient();

  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<SettingsChangeLogEntry | null>(null);

  const list = useListSettingsChangeLog(
    moduleFilter === "all" ? { limit: 100 } : { module: moduleFilter, limit: 100 },
  );
  const entries = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  // Only fetched once a row is actually clicked — `enabled` gates the
  // request on a truthy id, same shape as the generated hook's own
  // `enabled: !!(id)` default for a required path param, just re-applied
  // here since selectedId starts null.
  const detail = useGetSettingsChange(selectedId ?? "", {
    query: { enabled: selectedId !== null, queryKey: getGetSettingsChangeQueryKey(selectedId ?? "") },
  });
  const selected = selectedId !== null ? detail.data?.data : undefined;

  const rollback = useRollbackSettingsChange();

  // Export is read-only (a GET), so it's fetched on demand via refetch()
  // rather than on mount — `enabled: false` keeps it inert until the button
  // is clicked, matching the codebase's existing on-demand-refetch pattern
  // used for retry buttons (e.g. pages/deals.tsx, portfolio.tsx).
  const exportConfig = useExportSettingsConfig({
    query: { enabled: false, queryKey: getExportSettingsConfigQueryKey() },
  });

  const runExport = async () => {
    try {
      const result = await exportConfig.refetch();
      if (result.error) throw result.error;
      const payload = result.data?.data ?? {};
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = buildExportFilename(new Date().toISOString());
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      toast({ title: "Config exported", description: "Current engine thresholds and scoring weights saved as JSON." });
    } catch (err) {
      toast({ title: "Could not export config", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  const confirmRollback = async () => {
    if (!rollbackTarget) return;
    try {
      await rollback.mutateAsync({ id: rollbackTarget.id });
      await invalidate();
      // Rollback is only supported for engine_thresholds today, and it writes
      // to the same table the Thresholds tab reads via useListEngineThresholds
      // (pages/settings.tsx). That hook lives in the page component (never
      // unmounted by switching tabs) and refetchOnWindowFocus is disabled
      // app-wide, so without this the Thresholds tab would keep showing the
      // pre-rollback value until a full page reload — inviting an admin to
      // "fix" what looks like a failed rollback by re-applying the value they
      // just rolled back away from.
      await qc.invalidateQueries({ queryKey: getListEngineThresholdsQueryKey() });
      setRollbackTarget(null);
      toast({ title: "Rolled back", description: `${rollbackTarget.settingKey} restored to its previous value.` });
    } catch (err) {
      toast({ title: "Rollback failed", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <History className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle>Change Log</CardTitle>
            <CardDescription>
              Every settings change, who made it, and when. Anyone can browse and export;
              only an admin can roll back an engine threshold change.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={runExport} disabled={exportConfig.isFetching}>
            <Download className="mr-1 h-4 w-4" />
            {exportConfig.isFetching ? "Exporting…" : "Export config"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!canWrite && (
          <ReadOnlyNotice>
            You can see the full change history and export the current config, but only an
            admin can roll back a change.
          </ReadOnlyNotice>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Module</span>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {KNOWN_MODULES.map((m) => (
                <SelectItem key={m} value={m}>{humanizeCode(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Module</TableHead>
              <TableHead>Setting</TableHead>
              <TableHead>Change</TableHead>
              <TableHead className="w-32">Actor</TableHead>
              <TableHead className="w-28">When</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const eligible = canRollback(entry.module, entry.action);
              return (
                <TableRow
                  key={entry.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(entry.id)}
                >
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase">{humanizeCode(entry.module)}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="font-mono text-xs">{entry.settingKey}</p>
                    <p className="text-[10px] uppercase text-muted-foreground">{entry.action}</p>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={`${formatChangeValue(entry.oldValue)} → ${formatChangeValue(entry.newValue)}`}
                    >
                      <span className="line-through">{formatChangeValue(entry.oldValue)}</span>
                      {" → "}
                      <span className="text-foreground">{formatChangeValue(entry.newValue)}</span>
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{entry.actor}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{relativeTime(entry.changedAt)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {eligible ? (
                      <AdminOnly>
                        <Button size="sm" variant="outline" onClick={() => setRollbackTarget(entry)}>
                          <Undo2 className="mr-1 h-3 w-3" /> Rollback
                        </Button>
                      </AdminOnly>
                    ) : (
                      // Still gated by AdminOnly — a reader never sees a
                      // rollback control at all, eligible or not. An admin
                      // sees a disabled button explaining why, rather than
                      // a live one that's guaranteed to 409 (the server only
                      // supports rolling back an engine_thresholds update —
                      // see canRollback's doc comment).
                      <AdminOnly>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          title={`Rollback isn't supported for "${humanizeCode(entry.module)}" ${entry.action} entries — only engine threshold updates can be rolled back today.`}
                        >
                          <Undo2 className="mr-1 h-3 w-3" /> Rollback
                        </Button>
                      </AdminOnly>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {entries.length === 0 && !list.isLoading && (
          <p className="text-sm text-muted-foreground">
            No changes recorded{moduleFilter !== "all" ? " for this module" : ""} yet.
          </p>
        )}
      </CardContent>

      {/* --- Row detail --- */}
      <Dialog open={selectedId !== null} onOpenChange={(v) => !v && setSelectedId(null)}>
        <DialogContent animation="spotlight">
          <DialogHeader>
            <DialogTitle>Change detail</DialogTitle>
            <DialogDescription>
              {selected ? `${humanizeCode(selected.module)} — ${selected.settingKey}` : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Action</p>
                  <p className="font-medium">{selected.action}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Actor</p>
                  <p className="font-medium">{selected.actor}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Changed</p>
                  <p className="font-medium">{formatDateTime(selected.changedAt, "—")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entity</p>
                  <p className="font-mono text-xs">{selected.entityId ?? "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Old value</p>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-xs">
                  {formatChangeValue(selected.oldValue)}
                </pre>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">New value</p>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-xs">
                  {formatChangeValue(selected.newValue)}
                </pre>
              </div>
              {selected.reason && (
                <div>
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p>{selected.reason}</p>
                </div>
              )}
              {selected.rollbackOf && (
                <p className="text-xs text-muted-foreground">Rollback of change {selected.rollbackOf}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* --- Rollback confirm --- */}
      <AlertDialog open={rollbackTarget !== null} onOpenChange={(v) => !v && setRollbackTarget(null)}>
        <AlertDialogContent animation="spotlight">
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back this change?</AlertDialogTitle>
            <AlertDialogDescription>
              {rollbackTarget && (
                <>
                  This restores <span className="font-mono">{rollbackTarget.settingKey}</span> to{" "}
                  {formatChangeValue(rollbackTarget.oldValue)}, undoing the change to{" "}
                  {formatChangeValue(rollbackTarget.newValue)}. It writes to production
                  immediately — to undo it again you'd need another rollback.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRollback} disabled={rollback.isPending}>
              {rollback.isPending ? "Rolling back…" : "Roll back"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
