import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStakeholders,
  useCreateStakeholder,
  useDeleteStakeholder,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, ShieldAlert, Users } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { InfoTooltip } from "@/components/ui/info-tooltip";

const ROLE_INFO: { name: string; description: string }[] = [
  { name: "Economic Buyer", description: "Controls the budget and gives final financial sign-off on the purchase." },
  { name: "Technical Evaluator", description: "The person hands-on with testing, PoC, integrations. Often Presales, Security Engineer, or IT Admin." },
  { name: "Champion", description: "Internal advocate who actively sells your solution on your behalf and drives momentum." },
  { name: "End User", description: "Day-to-day user of the product whose experience shapes adoption and renewal." },
  { name: "Blocker", description: "Resists or can veto the deal — must be neutralized or won over." },
  { name: "Influencer", description: "Shapes opinions internally, often from a technical or business angle. Could be a trusted architect or manager." },
  { name: "Legal", description: "Reviews contract terms, liability, and data-protection clauses before signature." },
  { name: "Procurement/Commercial Contact", description: "Handles contract negotiation, pricing approval, or vendor onboarding." },
  { name: "Compliance/Security Contact", description: "Ensures the solution meets audit, risk, and governance standards." },
  { name: "IT Operations Contact", description: "Important if deployment, maintenance, or integration needs are involved." },
];
const ROLES = ROLE_INFO.map((r) => r.name);
const SENTIMENTS = ["Champion", "Supportive", "Neutral", "Skeptical", "Hostile"];
const INFLUENCE = ["High", "Medium", "Low"];

const sentimentColor: Record<string, string> = {
  Champion: "bg-emerald-500 text-white",
  Supportive: "bg-emerald-400/80 text-white",
  Neutral: "bg-muted text-muted-foreground",
  Skeptical: "bg-amber-500 text-white",
  Hostile: "bg-destructive text-white",
};

export function StakeholdersPanel({ dealId }: { dealId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListStakeholders(dealId);
  const create = useCreateStakeholder();
  const del = useDeleteStakeholder();

  const [form, setForm] = useState({
    name: "",
    title: "",
    role_type: "Influencer",
    influence_level: "Medium",
    sentiment: "Neutral",
    is_decision_maker: false,
  });

  const stakeholders = list.data?.data ?? [];
  const champions = stakeholders.filter((s) => s.sentiment === "Champion").length;
  const coverage = stakeholders.length ? Math.round((champions / stakeholders.length) * 100) : 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const add = async () => {
    if (!form.name.trim()) return;
    try {
      await create.mutateAsync({ dealId, data: form as never });
      await invalidate();
      setForm({ ...form, name: "", title: "" });
      toast({ title: "Stakeholder added" });
    } catch {
      toast({ title: "Couldn't add the stakeholder", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    await del.mutateAsync({ dealId, id });
    await invalidate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Stakeholder Influence Map</span>
          <Badge variant={coverage >= 40 ? "secondary" : "destructive"}>
            {champions}/{stakeholders.length} champions ({coverage}%)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {stakeholders.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Users className="h-5 w-5" /></EmptyMedia>
              <EmptyTitle>No stakeholders mapped yet</EmptyTitle>
              <EmptyDescription>Add a stakeholder below to start building the influence map for this deal.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {stakeholders.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{s.name}</span>
                {s.isDecisionMaker && (
                  <Badge variant="outline" className="text-xs">
                    <ShieldAlert className="h-3 w-3 mr-1" /> Decision Maker
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {s.title ?? "—"} · {s.roleType} · {s.influenceLevel} influence
              </p>
            </div>
            <Badge className={sentimentColor[s.sentiment] ?? ""}>{s.sentiment}</Badge>
            <Button variant="ghost" size="icon" onClick={() => remove(s.id)} aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="rounded-md border border-dashed p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                Role
                <InfoTooltip>
                  <ul className="space-y-1">
                    {ROLE_INFO.map((r) => (
                      <li key={r.name}>
                        <span className="font-medium">{r.name}</span> — {r.description}
                      </li>
                    ))}
                  </ul>
                </InfoTooltip>
              </label>
              <Select value={form.role_type} onValueChange={(v) => setForm({ ...form, role_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Influence</label>
              <Select value={form.influence_level} onValueChange={(v) => setForm({ ...form, influence_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INFLUENCE.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Sentiment</label>
              <Select value={form.sentiment} onValueChange={(v) => setForm({ ...form, sentiment: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SENTIMENTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_decision_maker}
                onCheckedChange={(c) => setForm({ ...form, is_decision_maker: c === true })}
              />
              Decision maker
            </label>
            <Button size="sm" onClick={add} disabled={create.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
