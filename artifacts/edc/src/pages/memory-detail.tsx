import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetDealMemory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { HistoryPanel } from "@/components/cockpit/history-panel";
import { NarrativeTab } from "@/components/memory/detail/narrative-tab";
import { ConnectionsTab } from "@/components/memory/detail/connections-tab";

function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "narrative", label: "Narrative & Autopsy" },
  { id: "connections", label: "Connections" },
];

export default function MemoryDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState("overview");
  const { data, isLoading } = useGetDealMemory(id as string);
  const m = data?.data;

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!m) return <div className="p-8 text-destructive">Memory record not found</div>;

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Button variant="ghost" size="sm" onClick={() => navigate("/memory")}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Deal Memory
      </Button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{m.dealName}</h1>
          <p className="text-muted-foreground text-lg">{m.accountName}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={m.outcome === "Won" ? "bg-emerald-500 text-white" : "bg-destructive text-white"}>{m.outcome}</Badge>
          <span className="text-2xl font-bold font-mono tabular-nums">{money(m.finalTcv)}</span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      <div className="pt-2">
        {tab === "overview" && (
          <Card>
            <CardHeader><CardTitle className="text-lg">Deal Metrics</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Days Active</span>
                <span className="font-mono">{m.totalDaysActive ?? "—"}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Gates Completed</span>
                <span className="font-mono">{m.totalGatesCompleted ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Blockers Encountered</span>
                <span className="font-mono">{m.totalBlockersEncountered ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Pricing Model</span>
                <span>{m.pricingModel ?? "—"}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Services Tier</span>
                <span>{m.servicesTier ?? "—"}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground text-sm">Archived</span>
                <span className="font-mono">{new Date(m.archivedAt).toLocaleDateString()}</span>
              </div>
              {m.tags && m.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2">
                  {m.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {tab === "timeline" && <HistoryPanel dealId={m.dealId} />}
        {tab === "narrative" && <NarrativeTab memory={m} />}
        {tab === "connections" && <ConnectionsTab memory={m} />}
      </div>
    </div>
  );
}
