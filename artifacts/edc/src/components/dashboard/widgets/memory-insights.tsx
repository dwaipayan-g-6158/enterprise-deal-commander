import { useState } from "react";
import { useGetMemoryInsights } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Library, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

interface Insight {
  text: string;
  matchedDeals: { id: string; dealName: string }[];
}
interface MemoryInsightsData {
  insights: Insight[];
  archivedCount: number;
}

// Widget 13 — Deal Memory Insights. Deterministic pattern matching of archived
// deals against the current pipeline; every insight traces to matched deals.
export function MemoryInsights() {
  const { data, isLoading } = useGetMemoryInsights();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(true);
  const d = data?.data as MemoryInsightsData | undefined;
  const insights = d?.insights ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Library className="h-4 w-4 text-primary" /> Deal Memory Insights
        </CardTitle>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/memory")}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            Browse memory <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Expand"}
            className="text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {(d?.archivedCount ?? 0) < 3
                ? "Insights appear once a few deals have been archived to memory."
                : "No archived-deal patterns currently match your active pipeline."}
            </p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                Based on {d?.archivedCount ?? 0} archived deals:
              </p>
              <ul className="space-y-3">
                {insights.map((ins, i) => (
                  <li key={i} className="border-l-2 border-primary/40 pl-3">
                    <p className="text-sm">{ins.text}</p>
                    {ins.matchedDeals.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {ins.matchedDeals.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => navigate(`/deals/${m.id}`)}
                            className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs transition-colors hover:border-primary/50 hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {m.dealName}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
