import { useState } from "react";
import { useSearchDealMemory, useGetMemoryFacets } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { MemoryResultCard } from "./memory-result-card";
import { useSavedMemorySearches } from "@/hooks/use-saved-memory-searches";

interface FacetBucket { value: string; count: number }
interface FacetsPayload {
  outcomes: FacetBucket[];
  pricingModels: FacetBucket[];
  servicesTiers: FacetBucket[];
  competitors: FacetBucket[];
  total: number;
}

export function SearchTab({
  selected,
  onToggleSelect,
  onCompare,
}: {
  selected: string[];
  onToggleSelect: (id: string) => void;
  onCompare: () => void;
}) {
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("all");
  const [competitor, setCompetitor] = useState("all");
  const [pricingModel, setPricingModel] = useState("all");

  const { saved, save, remove, history, recordQuery } = useSavedMemorySearches();
  const facetsQuery = useGetMemoryFacets();
  const facets = facetsQuery.data?.data as FacetsPayload | undefined;

  const params: Record<string, string> = {};
  if (q.trim()) params.q = q.trim();
  if (outcome !== "all") params.outcome = outcome;
  if (competitor !== "all") params.competitor = competitor;
  if (pricingModel !== "all") params.pricingModel = pricingModel;
  const { data, isLoading } = useSearchDealMemory(params as never);
  const results = data?.data ?? [];

  const runSearch = () => recordQuery(q);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filters</p>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Outcome</label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="Won">Won</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Competitor</label>
            <Select value={competitor} onValueChange={setCompetitor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any competitor</SelectItem>
                {(facets?.competitors ?? []).map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.value} ({c.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Pricing model</label>
            <Select value={pricingModel} onValueChange={setPricingModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any model</SelectItem>
                {(facets?.pricingModels ?? []).map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.value} ({p.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(competitor !== "all" || pricingModel !== "all" || outcome !== "all") && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => { setOutcome("all"); setCompetitor("all"); setPricingModel("all"); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear filters
            </Button>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saved searches</p>
          {saved.length === 0 && <p className="text-xs text-muted-foreground">None yet — save your current filters below.</p>}
          {saved.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                className="hover:underline truncate text-left"
                onClick={() => { setQ(s.q); setOutcome(s.outcome); setCompetitor(s.competitor); setPricingModel(s.pricingModel); }}
              >
                {s.label}
              </button>
              <button type="button" onClick={() => remove(s.id)} aria-label="Remove saved search">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              const label = q.trim() || `${outcome}/${competitor}/${pricingModel}`;
              save({ label, q, outcome, competitor, pricingModel, servicesTier: "all" });
            }}
          >
            Save current search
          </Button>
          {history.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">Recent</p>
              <div className="flex flex-wrap gap-1">
                {history.map((h) => (
                  <Badge key={h} variant="outline" className="cursor-pointer" onClick={() => setQ(h)}>{h}</Badge>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search account, deal, lessons, narrative…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={runSearch}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
          </div>
          {selected.length > 0 && (
            <Button onClick={onCompare} disabled={selected.length < 2}>
              Compare ({selected.length})
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {isLoading ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"}${facets ? ` of ${facets.total} archived deals` : ""}`}
        </p>

        {!isLoading && results.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No archived deals yet. Deals are archived here automatically when they reach Closed-Won or Closed-Lost.
          </p>
        )}

        <div className="space-y-3">
          {results.map((m) => (
            <MemoryResultCard
              key={m.id}
              memory={m}
              selected={selected.includes(m.id)}
              onToggleSelect={() => onToggleSelect(m.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
