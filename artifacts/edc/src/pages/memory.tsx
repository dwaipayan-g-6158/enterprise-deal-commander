import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchTab } from "@/components/memory/search-tab";
import { HealthDashboard } from "@/components/memory/health-dashboard";
import { ComparisonSheet } from "@/components/memory/comparison-sheet";
import { CompetitorsTab } from "@/components/memory/competitors-tab";
import { PricingTab } from "@/components/memory/pricing-tab";
import { AdvisorTab } from "@/components/memory/advisor-tab";

const TABS = [
  { id: "search", label: "Search" },
  { id: "health", label: "Health" },
  { id: "competitors", label: "Competitors" },
  { id: "pricing", label: "Pricing" },
  { id: "ask", label: "Ask Advisor" },
];

export default function Memory() {
  const [tab, setTab] = useState("search");
  const [selected, setSelected] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]));

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold">Deal Memory</h1>
        <p className="text-muted-foreground">Institutional knowledge base — searchable archive of closed deals.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {tab === "search" && (
        <SearchTab selected={selected} onToggleSelect={toggleSelect} onCompare={() => setCompareOpen(true)} />
      )}
      {tab === "health" && <HealthDashboard />}
      {tab === "competitors" && <CompetitorsTab />}
      {tab === "pricing" && <PricingTab />}
      {tab === "ask" && <AdvisorTab />}
      <ComparisonSheet ids={selected} open={compareOpen} onOpenChange={setCompareOpen} />
    </div>
  );
}
