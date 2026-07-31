import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { money } from "@/lib/format";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";

// The server (`ts_headline`) wraps matched search terms in literal
// <mark>...</mark> around otherwise-unescaped, user-entered narrative text.
// Never hand that string to dangerouslySetInnerHTML — split on the marker
// tags and render each half as plain React text (auto-escaped); only the
// marked segments become real <mark> elements. This is safe even if a
// narrative happens to contain literal "<mark>" text, because everything
// still passes through React as a text child, never as raw HTML.
function renderHighlightedSnippet(snippet: string) {
  return snippet.split(/(<mark>.*?<\/mark>)/g).map((part, i) => {
    const match = /^<mark>([\s\S]*)<\/mark>$/.exec(part);
    if (!match) return part;
    return (
      <mark key={i} className="bg-amber-500/20 text-amber-600 rounded-sm px-0.5">
        {match[1]}
      </mark>
    );
  });
}

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
          <Badge className={m.outcome === "Won" ? OUTCOME_CLASS.won.badge : OUTCOME_CLASS.lost.badge}>
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
          <p className="text-muted-foreground">{renderHighlightedSnippet(m.snippet)}</p>
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
