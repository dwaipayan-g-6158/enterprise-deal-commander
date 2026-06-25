import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDealCompetitors,
  useListCompetitors,
  useAddDealCompetitor,
  useUpdateDealCompetitor,
  useDeleteDealCompetitor,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Swords } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";

const STATUSES = ["Active", "Displaced", "Lost To", "Won Against"];
const statusColor: Record<string, string> = {
  Active: "bg-amber-500 text-white",
  Displaced: "bg-muted text-muted-foreground",
  "Won Against": "bg-emerald-500 text-white",
  "Lost To": "bg-destructive text-white",
};

export function CompetitivePanel({ dealId }: { dealId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListDealCompetitors(dealId);
  const lookup = useListCompetitors();
  const add = useAddDealCompetitor();
  const update = useUpdateDealCompetitor();
  const del = useDeleteDealCompetitor();
  const [selected, setSelected] = useState<string>("");

  const competitors = list.data?.data ?? [];
  const catalog = lookup.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const addCompetitor = async () => {
    if (!selected) return;
    try {
      await add.mutateAsync({ dealId, data: { competitor_id: Number(selected), status: "Active" } as never });
      await invalidate();
      setSelected("");
      toast({ title: "Competitor added" });
    } catch {
      toast({ title: "Failed (already tracked?)", variant: "destructive" });
    }
  };

  const setStatus = async (id: string, competitorId: number, status: string) => {
    await update.mutateAsync({ dealId, id, data: { competitor_id: competitorId, status } as never });
    await invalidate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Competitive Landscape</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {competitors.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Swords className="h-5 w-5" /></EmptyMedia>
              <EmptyTitle>No competitors tracked</EmptyTitle>
              <EmptyDescription>Add a competitor below to track win/loss outcomes for this deal.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {competitors.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-md border p-3">
            <span className="flex-1 font-medium">{c.competitorName ?? `#${c.competitorId}`}</span>
            <Select value={c.status} onValueChange={(v) => setStatus(c.id, c.competitorId, v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Badge className={statusColor[c.status] ?? ""}>{c.status}</Badge>
            <Button variant="ghost" size="icon" onClick={async () => { await del.mutateAsync({ dealId, id: c.id }); await invalidate(); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Add competitor..." /></SelectTrigger>
            <SelectContent>
              {catalog.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={addCompetitor} disabled={!selected || add.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
