import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDecisions,
  useCreateDecision,
  useUpdateDecision,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Check } from "lucide-react";

const statusColor: Record<string, string> = {
  Pending: "bg-amber-500 text-white",
  "In Progress": "bg-blue-500 text-white",
  Completed: "bg-emerald-500 text-white",
  Overridden: "bg-muted text-muted-foreground",
};

export function DecisionsPanel({ dealId }: { dealId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListDecisions(dealId);
  const create = useCreateDecision();
  const update = useUpdateDecision();
  const [form, setForm] = useState({ decision_text: "", owner: "", due_date: "" });

  const decisions = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const add = async () => {
    if (!form.decision_text.trim() || !form.owner.trim()) return;
    try {
      await create.mutateAsync({
        dealId,
        data: { decision_text: form.decision_text, owner: form.owner, due_date: form.due_date || null } as never,
      });
      await invalidate();
      setForm({ decision_text: "", owner: "", due_date: "" });
      toast({ title: "Decision logged" });
    } catch {
      toast({ title: "Failed to log decision", variant: "destructive" });
    }
  };

  const complete = async (id: string) => {
    await update.mutateAsync({ dealId, id, data: { status: "Completed" } as never });
    await invalidate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Decision Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {decisions.length === 0 && <p className="text-sm text-muted-foreground">No decisions logged yet. Add the first one below.</p>}
        {decisions.map((d) => (
          <div key={d.id} className="rounded-md border p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Badge className={statusColor[d.status] ?? ""}>{d.status}</Badge>
              <span className="text-xs text-muted-foreground">
                {d.decidedAt?.slice(0, 10)}{d.dueDate ? ` · due ${d.dueDate}` : ""}
              </span>
            </div>
            <p className="text-sm font-medium">{d.decisionText}</p>
            <p className="text-xs text-muted-foreground">Owner: {d.owner}</p>
            {d.status !== "Completed" && (
              <Button size="sm" variant="outline" onClick={() => complete(d.id)}>
                <Check className="h-4 w-4 mr-1" /> Mark complete
              </Button>
            )}
          </div>
        ))}
        <div className="rounded-md border border-dashed p-3 space-y-2">
          <Textarea
            placeholder="Decision..."
            rows={2}
            value={form.decision_text}
            onChange={(e) => setForm({ ...form, decision_text: e.target.value })}
          />
          <div className="flex gap-2">
            <Input placeholder="Owner" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            <Button onClick={add} disabled={create.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Log
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
