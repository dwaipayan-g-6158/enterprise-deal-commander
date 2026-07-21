import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CloseDatePreset, RosterFilters } from "./model/roster-types";
import type { FilterOption } from "./multi-select-filter";

const CLOSE_OPTIONS: { value: CloseDatePreset; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "overdue", label: "Overdue" },
  { value: "30d", label: "Next 30 days" },
  { value: "60d", label: "Next 60 days" },
  { value: "90d", label: "Next 90 days" },
  { value: "quarter", label: "This quarter" },
];

const COMPETITOR_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "yes", label: "Has competitor" },
  { value: "no", label: "No competitor" },
];

const COMMITTED_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "yes", label: "Committed" },
  { value: "no", label: "Not committed" },
];

export function countMoreFilters(f: RosterFilters): number {
  let n = 0;
  if (f.tcvMin != null || f.tcvMax != null) n++;
  if (f.scoreMin != null || f.scoreMax != null) n++;
  if (f.closePreset !== "any") n++;
  if (f.accountManager.length) n++;
  if (f.technicalLead.length) n++;
  if (f.hasCompetitors != null) n++;
  if (f.committed != null) n++;
  if (f.tags.length) n++;
  return n;
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function CheckboxList({
  options,
  selected,
  onChange,
}: {
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const set = new Set(selected);
  const toggle = (value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };
  if (options.length === 0) return <p className="text-xs text-muted-foreground">Nothing to filter by yet.</p>;
  return (
    <ScrollArea className="h-28 rounded-md border">
      <div className="p-2 space-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={set.has(o.value)} onCheckedChange={() => toggle(o.value)} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </ScrollArea>
  );
}

export function MoreFiltersPanel({
  filters,
  setFilters,
  amOptions,
  tlOptions,
  tagOptions,
}: {
  filters: RosterFilters;
  setFilters: (patch: Partial<RosterFilters>) => void;
  amOptions: FilterOption[];
  tlOptions: FilterOption[];
  tagOptions: FilterOption[];
}) {
  const count = countMoreFilters(filters);
  const competitorValue = filters.hasCompetitors == null ? "any" : filters.hasCompetitors ? "yes" : "no";
  const committedValue = filters.committed == null ? "any" : filters.committed ? "yes" : "no";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More
          {count > 0 && (
            <Badge variant="secondary" className="rounded-sm px-1 font-mono text-xs">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-4 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto"
        align="end"
      >
        <div className="space-y-2">
          <Label>TCV range (normalized)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Min"
              value={filters.tcvMin ?? ""}
              onChange={(e) => setFilters({ tcvMin: numOrNull(e.target.value) })}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Max"
              value={filters.tcvMax ?? ""}
              onChange={(e) => setFilters({ tcvMax: numOrNull(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Score range</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Min"
              value={filters.scoreMin ?? ""}
              onChange={(e) => setFilters({ scoreMin: numOrNull(e.target.value) })}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Max"
              value={filters.scoreMax ?? ""}
              onChange={(e) => setFilters({ scoreMax: numOrNull(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Close date</Label>
          <Select value={filters.closePreset} onValueChange={(v) => setFilters({ closePreset: v as CloseDatePreset })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLOSE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Competitor</Label>
          <Select
            value={competitorValue}
            onValueChange={(v) => setFilters({ hasCompetitors: v === "any" ? null : v === "yes" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPETITOR_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Committed</Label>
          <Select
            value={committedValue}
            onValueChange={(v) => setFilters({ committed: v === "any" ? null : v === "yes" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMITTED_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Account Manager</Label>
          <CheckboxList options={amOptions} selected={filters.accountManager} onChange={(v) => setFilters({ accountManager: v })} />
        </div>

        <div className="space-y-2">
          <Label>Technical Lead</Label>
          <CheckboxList options={tlOptions} selected={filters.technicalLead} onChange={(v) => setFilters({ technicalLead: v })} />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <CheckboxList options={tagOptions} selected={filters.tags} onChange={(v) => setFilters({ tags: v })} />
        </div>

        {count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() =>
              setFilters({
                tcvMin: null,
                tcvMax: null,
                scoreMin: null,
                scoreMax: null,
                closePreset: "any",
                accountManager: [],
                technicalLead: [],
                hasCompetitors: null,
                committed: null,
                tags: [],
              })
            }
          >
            Clear advanced filters
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
