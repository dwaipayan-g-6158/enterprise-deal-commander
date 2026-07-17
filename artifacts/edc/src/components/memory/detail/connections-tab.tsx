import { useGetSimilarDeals, useGetPlaybookJourney } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { money } from "@/lib/format";

interface MemoryDetail {
  id: string;
  dealId: string;
  competitorsFaced?: string[] | null;
}

interface JourneyEntry {
  playbookId: string;
  playbookName: string;
  applicableStage: string | null;
  assignmentId: string | null;
  status: "not_started" | "active" | "completed";
}

export function ConnectionsTab({ memory: m }: { memory: MemoryDetail }) {
  const { data: similarData } = useGetSimilarDeals(m.dealId);
  const { data: journeyData } = useGetPlaybookJourney(m.dealId);
  const similar = (similarData?.data ?? []).filter((s) => s.id !== m.id);
  const journey = (journeyData?.data as { journey: JourneyEntry[] } | undefined)?.journey ?? [];
  const playbooksUsed = journey.filter((e) => e.assignmentId);

  return (
    <div className="space-y-4">
      {m.competitorsFaced && m.competitorsFaced.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Competitors Faced</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {m.competitorsFaced.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">Playbooks Used</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {playbooksUsed.length > 0 ? (
            playbooksUsed.map((p) => (
              <p key={p.playbookId} className="text-sm">
                {p.playbookName}
                {p.applicableStage && <span className="text-muted-foreground"> ({p.applicableStage})</span>}
                {" — "}
                <span className="text-muted-foreground">{p.status === "completed" ? "Completed" : "In progress"}</span>
              </p>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No playbook was assigned to this deal.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Similar Archived Deals</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {similar.length === 0 && <p className="text-sm text-muted-foreground">No similar deals found.</p>}
          {similar.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <Link href={`/memory/${s.id}`} className="hover:underline">{s.dealName} · {s.accountName}</Link>
              <span className="flex items-center gap-2">
                <Badge className={s.outcome === "Won" ? "bg-emerald-500 text-white" : "bg-destructive text-white"}>{s.outcome}</Badge>
                <span className="font-mono text-muted-foreground">{money(s.finalTcv)}</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
