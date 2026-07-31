import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useListNotificationRules,
  useCreateNotificationRule,
  useUpdateNotificationRule,
  useDeleteNotificationRule,
  useListCustomPatterns,
  useCreateCustomPattern,
  useUpdateCustomPattern,
  useDeleteCustomPattern,
  useTestCustomPattern,
  type Webhook,
  type NotificationRule,
  type CustomPattern,
} from "@workspace/api-client-react";
import { requiresComparisonValue, type CustomOperator } from "@workspace/engine";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, FlaskConical } from "lucide-react";
import { AdminOnly, ReadOnlyNotice } from "@/components/auth/write-gate";
import { useCanWrite } from "@/lib/auth/role-context";
import { serverMessage } from "@/lib/server-message";

const WEBHOOK_EVENTS = [
  "deal.created",
  "deal.updated",
  "deal.stage_changed",
  "deal.deleted",
  "gate.toggled",
  "health.changed",
  "blocker.created",
  "blocker.resolved",
];

// Must match the auto-disable threshold in
// artifacts/api-server/src/lib/subscribers/webhook-dispatcher.ts (bumps
// failureCount on exhausted retries, disables at 10 consecutive failures).
const WEBHOOK_AUTO_DISABLE_THRESHOLD = 10;

export function WebhooksSettings() {
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const qc = useQueryClient();
  const list = useListWebhooks();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const del = useDeleteWebhook();
  const [form, setForm] = useState({ webhook_name: "", target_url: "", events: [] as string[] });
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);

  const webhooks = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync({ id: deleteTarget.id });
      await invalidate();
      setDeleteTarget(null);
      toast({ title: "Webhook deleted" });
    } catch (err) {
      toast({ title: "Could not delete webhook", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  const add = async () => {
    if (!form.webhook_name.trim() || !form.target_url.trim()) {
      toast({ title: "Name and target URL are required", variant: "destructive" });
      return;
    }
    if (form.events.length === 0) {
      toast({ title: "Select at least one event", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ data: form as never });
      await invalidate();
      setForm({ webhook_name: "", target_url: "", events: [] });
      toast({ title: "Webhook created" });
    } catch (err) {
      toast({ title: "Failed to create webhook", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  // PUT /webhooks/:id takes the full resource (WebhookInput), not a partial
  // patch — send the row's existing fields back alongside the toggled flag.
  const toggleActive = async (w: Webhook, isActive: boolean) => {
    try {
      await update.mutateAsync({
        id: w.id,
        data: {
          webhook_name: w.webhookName,
          target_url: w.targetUrl,
          events: w.events,
          is_active: isActive,
        },
      });
      await invalidate();
      toast({ title: isActive ? "Webhook re-enabled" : "Webhook disabled" });
    } catch (err) {
      toast({ title: "Could not update webhook", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Webhooks</CardTitle>
        <CardDescription>POST signed event payloads to external systems.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {webhooks.map((w) => (
          <div key={w.id} className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex-1">
              <p className="font-medium">{w.webhookName}</p>
              <p className="text-xs text-muted-foreground font-mono">{w.targetUrl}</p>
              <div className="flex gap-1 flex-wrap mt-1">
                {w.events.map((e) => <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>)}
              </div>
            </div>
            {!w.isActive && (
              <div className="flex flex-col items-end gap-0.5">
                <Badge variant="destructive">disabled</Badge>
                {w.failureCount >= WEBHOOK_AUTO_DISABLE_THRESHOLD && (
                  <span className="text-[10px] text-muted-foreground">
                    Auto-disabled after {w.failureCount} failed deliveries
                  </span>
                )}
              </div>
            )}
            <AdminOnly>
              <Switch checked={w.isActive} onCheckedChange={(v) => toggleActive(w, v)} disabled={update.isPending} />
            </AdminOnly>
            <AdminOnly>
              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(w)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AdminOnly>
          </div>
        ))}
        <AdminOnly>
          <div className="rounded-md border border-dashed p-3 space-y-2">
            <Input placeholder="Name" value={form.webhook_name} onChange={(e) => setForm({ ...form, webhook_name: e.target.value })} />
            <Input placeholder="https://target.example.com/hook" value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={form.events.includes(ev)}
                    onCheckedChange={(c) =>
                      setForm((f) => ({ ...f, events: c ? [...f.events, ev] : f.events.filter((x) => x !== ev) }))
                    }
                  />
                  {ev}
                </label>
              ))}
            </div>
            <Button size="sm" onClick={add} disabled={create.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Add webhook
            </Button>
          </div>
        </AdminOnly>
        {!canWrite && webhooks.length === 0 && (
          <ReadOnlyNotice>No webhooks are configured.</ReadOnlyNotice>
        )}
      </CardContent>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent animation="spotlight">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.webhookName} will stop receiving event deliveries immediately.
              This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const TRIGGER_EVENTS = ["health_changed", "stage_changed", "blocker_created"];

export function NotificationSettings() {
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const qc = useQueryClient();
  const list = useListNotificationRules();
  const create = useCreateNotificationRule();
  const update = useUpdateNotificationRule();
  const del = useDeleteNotificationRule();
  const [form, setForm] = useState({ rule_name: "", trigger_event: "health_changed", channel: "in_app" });
  const [deleteTarget, setDeleteTarget] = useState<NotificationRule | null>(null);

  const rules = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync({ id: deleteTarget.id });
      await invalidate();
      setDeleteTarget(null);
      toast({ title: "Rule deleted" });
    } catch (err) {
      toast({ title: "Could not delete rule", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  const add = async () => {
    if (!form.rule_name.trim()) {
      toast({ title: "Rule name is required", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ data: form as never });
      await invalidate();
      setForm({ rule_name: "", trigger_event: "health_changed", channel: "in_app" });
      toast({ title: "Rule created" });
    } catch (err) {
      toast({ title: "Failed to create rule", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  // PUT /notification-rules/:id takes the full resource (NotificationRuleInput),
  // not a partial patch — send the row's existing fields back with the toggle.
  const toggleActive = async (r: NotificationRule, isActive: boolean) => {
    try {
      await update.mutateAsync({
        id: r.id,
        data: {
          rule_name: r.ruleName,
          trigger_event: r.triggerEvent,
          trigger_conditions: r.triggerConditions ?? null,
          channel: r.channel,
          is_active: isActive,
        },
      });
      await invalidate();
      toast({ title: isActive ? "Rule enabled" : "Rule disabled" });
    } catch (err) {
      toast({ title: "Could not update rule", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Smart Alert Rules</CardTitle>
        <CardDescription>Fire in-app / email notifications when deal events match.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex-1">
              <p className="font-medium">{r.ruleName}</p>
              <p className="text-xs text-muted-foreground">on {r.triggerEvent} → {r.channel}</p>
            </div>
            {!r.isActive && <Badge variant="outline">off</Badge>}
            <AdminOnly>
              <Switch checked={r.isActive} onCheckedChange={(v) => toggleActive(r, v)} disabled={update.isPending} />
            </AdminOnly>
            <AdminOnly>
              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AdminOnly>
          </div>
        ))}
        <AdminOnly>
          <div className="rounded-md border border-dashed p-3 flex gap-2 items-end flex-wrap">
            <Input className="flex-1 min-w-40" placeholder="Rule name" value={form.rule_name} onChange={(e) => setForm({ ...form, rule_name: e.target.value })} />
            <Select value={form.trigger_event} onValueChange={(v) => setForm({ ...form, trigger_event: v })}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{TRIGGER_EVENTS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in_app">in_app</SelectItem>
                <SelectItem value="email">email</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={add} disabled={create.isPending}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
        </AdminOnly>
        {!canWrite && rules.length === 0 && (
          <ReadOnlyNotice>No smart alert rules are configured.</ReadOnlyNotice>
        )}
      </CardContent>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent animation="spotlight">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.ruleName} will stop firing immediately. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const FIELD_PATHS = [
  "financials.calculatedTCV",
  "financials.productRevenue",
  "financials.servicesRevenue",
  "technicalTrack.progressPercentage",
  "governance.activeBlockerCount",
  "governance.highSeverityBlockerCount",
  "salesStage",
  "daysInStage",
];
const OPERATORS = ["gt", "lt", "gte", "lte", "eq", "neq", "contains", "not_contains", "is_null", "is_not_null"];

interface Cond {
  field_path: string;
  operator: string;
  comparison_value: string;
}

export function CustomPatternsSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListCustomPatterns();
  const create = useCreateCustomPattern();
  const update = useUpdateCustomPattern();
  const del = useDeleteCustomPattern();
  const test = useTestCustomPattern();
  const [form, setForm] = useState({
    pattern_name: "",
    severity: "YELLOW",
    weight: 50,
    alert_message_template: "",
  });
  const [conds, setConds] = useState<Cond[]>([{ field_path: FIELD_PATHS[0], operator: "gt", comparison_value: "" }]);
  const [testResult, setTestResult] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<CustomPattern | null>(null);

  const patterns = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync({ id: deleteTarget.id });
      await invalidate();
      setDeleteTarget(null);
      toast({ title: "Pattern deleted" });
    } catch (err) {
      toast({ title: "Could not delete pattern", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  const body = () => ({
    ...form,
    conditions: conds.map((c, i) => ({ ...c, sort_order: i })),
  });

  // A previously-run "Matches N deal(s)" result is only valid for the exact
  // form/conditions it was computed against — any further edit invalidates
  // it, so every setter that mutates `form` or `conds` also clears it.
  const updateForm = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setTestResult("");
  };

  const setCond = (i: number, patch: Partial<Cond>) => {
    setConds((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
    setTestResult("");
  };

  const addCondition = () => {
    setConds((cs) => [...cs, { field_path: FIELD_PATHS[0], operator: "gt", comparison_value: "" }]);
    setTestResult("");
  };

  // Guards against reaching zero conditions even if this were ever called
  // from somewhere other than the (disabled-at-length-1) row button — the
  // Zod `minItems: 1` on the API contract is the hard backstop either way.
  const removeCondition = (i: number) => {
    setConds((cs) => (cs.length <= 1 ? cs : cs.filter((_, idx) => idx !== i)));
    setTestResult("");
  };

  // A blank comparison_value is a dead/no-op condition for every operator
  // except is_null/is_not_null — see requiresComparisonValue's doc comment
  // in @workspace/engine for exactly why, operator by operator.
  const invalidConditions = conds.filter(
    (c) => requiresComparisonValue(c.operator as CustomOperator) && c.comparison_value.trim() === "",
  );
  const canSave =
    !!form.pattern_name && !!form.alert_message_template && conds.length > 0 && invalidConditions.length === 0;

  const runTest = async () => {
    try {
      const res = await test.mutateAsync({ data: body() as never });
      const d = (res?.data ?? {}) as { matchCount?: number };
      setTestResult(`Matches ${d.matchCount ?? 0} active deal(s)`);
    } catch (err) {
      setTestResult(serverMessage(err, "Test failed"));
    }
  };

  const save = async () => {
    if (!form.pattern_name.trim()) {
      toast({ title: "Pattern name is required", variant: "destructive" });
      return;
    }
    if (!form.alert_message_template.trim()) {
      toast({ title: "Alert message is required", variant: "destructive" });
      return;
    }
    // Per-value feedback already lives inline on each condition row (the red
    // border + title on the Input) and on the disabled Save button's own
    // tooltip — this is just the fallback for a caller that reaches here
    // some other way (e.g. a future keyboard submit).
    if (invalidConditions.length > 0) {
      toast({ title: "Fill in every required comparison value", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ data: body() as never });
      await invalidate();
      setForm({ pattern_name: "", severity: "YELLOW", weight: 50, alert_message_template: "" });
      setConds([{ field_path: FIELD_PATHS[0], operator: "gt", comparison_value: "" }]);
      setTestResult("");
      toast({ title: "Custom pattern saved" });
    } catch (err) {
      toast({ title: "Failed to save pattern", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  // PUT /custom-patterns/:id takes the full resource (CustomPatternInput,
  // conditions included, min 1) — send the row's existing fields back with
  // the toggle. The list response's `conditions` are camelCase
  // (fieldPath/comparisonValue/sortOrder); the input body needs snake_case.
  const toggleActive = async (p: CustomPattern, isActive: boolean) => {
    try {
      const conditions = (p.conditions ?? []).map((c) => {
        const cond = c as { fieldPath: string; operator: string; comparisonValue: string; sortOrder: number };
        return {
          field_path: cond.fieldPath,
          operator: cond.operator,
          comparison_value: cond.comparisonValue,
          sort_order: cond.sortOrder,
        };
      });
      await update.mutateAsync({
        id: p.id,
        data: {
          pattern_name: p.patternName,
          description: p.description ?? null,
          severity: p.severity,
          weight: p.weight,
          alert_message_template: p.alertMessageTemplate,
          is_active: isActive,
          conditions,
        } as never,
      });
      await invalidate();
      toast({ title: isActive ? "Pattern enabled" : "Pattern disabled" });
    } catch (err) {
      toast({ title: "Could not update pattern", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Risk Patterns</CardTitle>
        <CardDescription>Build rules that fire alongside the built-in engine patterns.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {patterns.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-md border p-3">
            <Badge className={p.severity === "RED" ? "bg-destructive text-white" : "bg-amber-500 text-white"}>{p.severity}</Badge>
            <div className="flex-1">
              <p className="font-medium">{p.patternName}</p>
              <p className="text-xs text-muted-foreground">weight {p.weight} · fired {p.triggerCount}×</p>
            </div>
            {!p.isActive && <Badge variant="outline">off</Badge>}
            <AdminOnly>
              <Switch checked={p.isActive} onCheckedChange={(v) => toggleActive(p, v)} disabled={update.isPending} />
            </AdminOnly>
            <AdminOnly>
              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </AdminOnly>
          </div>
        ))}

        <div className="rounded-md border border-dashed p-3 space-y-3">
          <div className="flex gap-2 flex-wrap items-end">
            <Input className="flex-1 min-w-40" placeholder="Pattern name" value={form.pattern_name} onChange={(e) => updateForm({ pattern_name: e.target.value })} />
            <Select value={form.severity} onValueChange={(v) => updateForm({ severity: v })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="RED">RED</SelectItem><SelectItem value="YELLOW">YELLOW</SelectItem></SelectContent>
            </Select>
            <Input type="number" className="w-24" value={form.weight} onChange={(e) => updateForm({ weight: Number(e.target.value) })} />
          </div>

          {conds.map((c, i) => {
            const needsValue = requiresComparisonValue(c.operator as CustomOperator);
            const missingValue = needsValue && c.comparison_value.trim() === "";
            const isLastCondition = conds.length === 1;
            return (
              <div key={i} className="flex gap-2 items-center">
                <Select value={c.field_path} onValueChange={(v) => setCond(i, { field_path: v })}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_PATHS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={c.operator} onValueChange={(v) => setCond(i, { operator: v })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
                {needsValue ? (
                  <Input
                    className={`w-28 ${missingValue ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    placeholder="value"
                    value={c.comparison_value}
                    onChange={(e) => setCond(i, { comparison_value: e.target.value })}
                    title={missingValue ? "A value is required for this operator." : undefined}
                  />
                ) : (
                  <span
                    className="w-28 text-xs text-muted-foreground italic text-center"
                    title="This operator checks presence only — no comparison value is used."
                  >
                    (no value needed)
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCondition(i)}
                  disabled={isLastCondition}
                  title={isLastCondition ? "A pattern needs at least one condition." : "Remove condition"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={addCondition}>
            <Plus className="h-4 w-4 mr-1" /> Add condition
          </Button>

          <Textarea
            placeholder="Alert message — supports {{dealName}}, {{financials.calculatedTCV}}"
            rows={2}
            value={form.alert_message_template}
            onChange={(e) => updateForm({ alert_message_template: e.target.value })}
          />

          <div className="flex items-center gap-2">
            {/* Test hits a read-only, in-memory endpoint (POST /v2/custom-patterns/test)
                that readers are explicitly allowed to call — same class as the Risk
                Simulator. Only persisting a pattern (Save) needs gating. */}
            <Button variant="outline" size="sm" onClick={runTest} disabled={test.isPending}>
              <FlaskConical className="h-4 w-4 mr-1" /> Test against current deals
            </Button>
            {testResult && <span className="text-sm text-muted-foreground">{testResult}</span>}
            <AdminOnly>
              <Button
                size="sm"
                className="ml-auto"
                onClick={save}
                disabled={create.isPending || !canSave}
                title={!canSave ? "Give the pattern a name, a message, and fill in every required comparison value." : undefined}
              >
                Save pattern
              </Button>
            </AdminOnly>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent animation="spotlight">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pattern?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.patternName} will stop firing immediately. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
