import { useState } from "react";
import { useSearchDealMemory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

export default function Memory() {
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<string>("all");

  const params: { q?: string; outcome?: string } = {};
  if (q.trim()) params.q = q.trim();
  if (outcome !== "all") params.outcome = outcome;
  const { data, isLoading } = useSearchDealMemory(params);
  const results = data?.data ?? [];

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold">Deal Memory</h1>
        <p className="text-muted-foreground">Institutional knowledge base — searchable archive of closed deals.</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search account, deal, lessons, narrative…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="Won">Won</SelectItem>
            <SelectItem value="Lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Searching…</p>}
      {!isLoading && results.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No archived deals yet. Deals are archived here automatically when they reach Closed-Won or Closed-Lost.
        </p>
      )}

      <div className="space-y-3">
        {results.map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{m.dealName} <span className="text-muted-foreground font-normal">· {m.accountName}</span></span>
                <Badge className={m.outcome === "Won" ? "bg-emerald-500 text-white" : "bg-destructive text-white"}>
                  {m.outcome}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p className="text-muted-foreground">
                {money(m.finalTcv)} · {m.totalDaysActive ?? "—"} days active · {m.totalGatesCompleted ?? 0} gates
                {m.competitorsFaced?.length ? ` · vs ${m.competitorsFaced.join(", ")}` : ""}
              </p>
              {m.winLossNarrative && <p>{m.winLossNarrative}</p>}
              {m.keyLessons && m.keyLessons.length > 0 && (
                <ul className="list-disc pl-5 text-muted-foreground">
                  {m.keyLessons.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              )}
              {m.tags && m.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {m.tags.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
