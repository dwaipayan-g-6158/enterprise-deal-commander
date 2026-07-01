import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { money } from "@/lib/format";

type MemoryResult = {
  id: string;
  dealId: string;
  dealName: string;
  accountName: string;
  outcome: string;
  finalTcv?: unknown;
  totalDaysActive?: number | null;
  totalGatesCompleted?: number | null;
  competitorsFaced?: string[] | null;
  winLossNarrative?: string | null;
  keyLessons?: string[] | null;
  tags?: string[] | null;
  snippet?: string | null;
};

export function MemoryResultCard({
  memory: m,
  selected,
  onToggleSelect,
}: {
  memory: MemoryResult;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label="Select for comparison" />
            <Link href={`/memory/${m.id}`} className="hover:underline truncate">
              {m.dealName}
            </Link>
            <span className="text-muted-foreground font-normal">· {m.accountName}</span>
          </span>
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
        {m.snippet ? (
          <p
            className="text-muted-foreground [&_mark]:bg-amber-500/20 [&_mark]:text-amber-600 [&_mark]:rounded-sm [&_mark]:px-0.5"
            dangerouslySetInnerHTML={{ __html: m.snippet }}
          />
        ) : (
          m.winLossNarrative && <p>{m.winLossNarrative}</p>
        )}
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
  );
}
