import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useListNotificationRules,
  useCreateNotificationRule,
  useDeleteNotificationRule,
  useListCustomPatterns,
  useCreateCustomPattern,
  useDeleteCustomPattern,
  useTestCustomPattern,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, FlaskConical } from "lucide-react";

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

export function WebhooksSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListWebhooks();
  const create = useCreateWebhook();
  const del = useDeleteWebhook();
  const [form, setForm] = useState({ webhook_name: "", target_url: "", events: [] as string[] });

  const webhooks = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const add = async () => {
    if (!form.webhook_name || !form.target_url || form.events.length === 0) return;
    try {
      await create.mutateAsync({ data: form as never });
      await invalidate();
      setForm({ webhook_name: "", target_url: "", events: [] });
      toast({ title: "Webhook created" });
    } catch {
      toast({ title: "Failed to create webhook", variant: "destructive" });
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
            {!w.isActive && <Badge variant="destructive">disabled</Badge>}
            <Button variant="ghost" size="icon" onClick={async () => { await del.mutateAsync({ id: w.id }); await invalidate(); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
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
      </CardContent>
    </Card>
  );
}

const TRIGGER_EVENTS = ["health_changed", "stage_changed", "blocker_created"];

export function NotificationSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListNotificationRules();
  const create = useCreateNotificationRule();
  const del = useDeleteNotificationRule();
  const [form, setForm] = useState({ rule_name: "", trigger_event: "health_changed", channel: "in_app" });

  const rules = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const add = async () => {
    if (!form.rule_name) return;
    try {
      await create.mutateAsync({ data: form as never });
      await invalidate();
      setForm({ rule_name: "", trigger_event: "health_changed", channel: "in_app" });
      toast({ title: "Rule created" });
    } catch {
      toast({ title: "Failed to create rule", variant: "destructive" });
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
            <Button variant="ghost" size="icon" onClick={async () => { await del.mutateAsync({ id: r.id }); await invalidate(); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
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
      </CardContent>
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

  const patterns = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const body = () => ({
    ...form,
    conditions: conds.map((c, i) => ({ ...c, sort_order: i })),
  });

  const runTest = async () => {
    try {
      const res = await test.mutateAsync({ data: body() as never });
      const d = (res?.data ?? {}) as { matchCount?: number };
      setTestResult(`Matches ${d.matchCount ?? 0} active deal(s)`);
    } catch {
      setTestResult("Test failed");
    }
  };

  const save = async () => {
    if (!form.pattern_name || !form.alert_message_template) return;
    try {
      await create.mutateAsync({ data: body() as never });
      await invalidate();
      setForm({ pattern_name: "", severity: "YELLOW", weight: 50, alert_message_template: "" });
      setConds([{ field_path: FIELD_PATHS[0], operator: "gt", comparison_value: "" }]);
      setTestResult("");
      toast({ title: "Custom pattern saved" });
    } catch {
      toast({ title: "Failed to save pattern", variant: "destructive" });
    }
  };

  const setCond = (i: number, patch: Partial<Cond>) =>
    setConds((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

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
            <Button variant="ghost" size="icon" onClick={async () => { await del.mutateAsync({ id: p.id }); await invalidate(); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="rounded-md border border-dashed p-3 space-y-3">
          <div className="flex gap-2 flex-wrap items-end">
            <Input className="flex-1 min-w-40" placeholder="Pattern name" value={form.pattern_name} onChange={(e) => setForm({ ...form, pattern_name: e.target.value })} />
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="RED">RED</SelectItem><SelectItem value="YELLOW">YELLOW</SelectItem></SelectContent>
            </Select>
            <Input type="number" className="w-24" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
          </div>

          {conds.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Select value={c.field_path} onValueChange={(v) => setCond(i, { field_path: v })}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>{FIELD_PATHS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={c.operator} onValueChange={(v) => setCond(i, { operator: v })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATORS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="w-28" placeholder="value" value={c.comparison_value} onChange={(e) => setCond(i, { comparison_value: e.target.value })} />
              <Button variant="ghost" size="icon" onClick={() => setConds((cs) => cs.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setConds((cs) => [...cs, { field_path: FIELD_PATHS[0], operator: "gt", comparison_value: "" }])}>
            <Plus className="h-4 w-4 mr-1" /> Add condition
          </Button>

          <Textarea
            placeholder="Alert message — supports {{dealName}}, {{financials.calculatedTCV}}"
            rows={2}
            value={form.alert_message_template}
            onChange={(e) => setForm({ ...form, alert_message_template: e.target.value })}
          />

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={runTest} disabled={test.isPending}>
              <FlaskConical className="h-4 w-4 mr-1" /> Test against current deals
            </Button>
            {testResult && <span className="text-sm text-muted-foreground">{testResult}</span>}
            <Button size="sm" className="ml-auto" onClick={save} disabled={create.isPending}>Save pattern</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
