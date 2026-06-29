import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_FILTERS, type RosterFilters } from "./model/roster-types";
import { VELOCITY_LABEL } from "./model/velocity";
import type { FilterOption } from "./multi-select-filter";

const CLOSE_LABEL: Record<string, string> = {
  overdue: "Overdue",
  "30d": "Closing ≤30d",
  "60d": "Closing ≤60d",
  "90d": "Closing ≤90d",
  quarter: "Closing this quarter",
};

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

function buildChips(
  f: RosterFilters,
  setFilters: (patch: Partial<RosterFilters>) => void,
  tagOptions: FilterOption[],
): Chip[] {
  const chips: Chip[] = [];
  const tagLabel = new Map(tagOptions.map((o) => [o.value, o.label]));
  const removeFrom = (key: keyof RosterFilters, value: string) => () =>
    setFilters({ [key]: (f[key] as string[]).filter((v) => v !== value) } as Partial<RosterFilters>);

  if (f.search.trim()) chips.push({ key: "q", label: `“${f.search.trim()}”`, onRemove: () => setFilters({ search: "" }) });
  f.stage.forEach((s) => chips.push({ key: `sg-${s}`, label: s, onRemove: removeFrom("stage", s) }));
  f.health.forEach((h) => chips.push({ key: `h-${h}`, label: h, onRemove: removeFrom("health", h) }));
  f.velocity.forEach((v) =>
    chips.push({ key: `v-${v}`, label: VELOCITY_LABEL[v] ?? v, onRemove: removeFrom("velocity", v) }),
  );
  if (f.tcvMin != null || f.tcvMax != null) {
    const lo = f.tcvMin != null ? `≥${f.tcvMin.toLocaleString()}` : "";
    const hi = f.tcvMax != null ? `≤${f.tcvMax.toLocaleString()}` : "";
    chips.push({ key: "tcv", label: `TCV ${[lo, hi].filter(Boolean).join(" ")}`, onRemove: () => setFilters({ tcvMin: null, tcvMax: null }) });
  }
  if (f.scoreMin != null || f.scoreMax != null) {
    const lo = f.scoreMin != null ? `≥${f.scoreMin}` : "";
    const hi = f.scoreMax != null ? `≤${f.scoreMax}` : "";
    chips.push({ key: "score", label: `Score ${[lo, hi].filter(Boolean).join(" ")}`, onRemove: () => setFilters({ scoreMin: null, scoreMax: null }) });
  }
  if (f.closePreset !== "any")
    chips.push({ key: "close", label: CLOSE_LABEL[f.closePreset] ?? f.closePreset, onRemove: () => setFilters({ closePreset: "any" }) });
  f.accountManager.forEach((a) => chips.push({ key: `am-${a}`, label: `AM: ${a}`, onRemove: removeFrom("accountManager", a) }));
  f.technicalLead.forEach((t) => chips.push({ key: `tl-${t}`, label: `TL: ${t}`, onRemove: removeFrom("technicalLead", t) }));
  f.tags.forEach((id) => chips.push({ key: `tag-${id}`, label: `Tag: ${tagLabel.get(id) ?? id}`, onRemove: removeFrom("tags", id) }));
  if (f.hasCompetitors != null)
    chips.push({ key: "cmp", label: f.hasCompetitors ? "Has competitor" : "No competitor", onRemove: () => setFilters({ hasCompetitors: null }) });
  return chips;
}

export function FilterChips({
  filters,
  setFilters,
  matchedCount,
  totalCount,
  tagOptions = [],
}: {
  filters: RosterFilters;
  setFilters: (patch: Partial<RosterFilters>) => void;
  matchedCount: number;
  totalCount: number;
  tagOptions?: FilterOption[];
}) {
  const chips = buildChips(filters, setFilters, tagOptions);
  if (chips.length === 0) return null;

  // Clear everything except the active/archived/deleted state selector.
  const clearAll = () => setFilters({ ...DEFAULT_FILTERS, state: filters.state });

  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
      <span className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{matchedCount}</span> of {totalCount}
      </span>
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary" className="gap-1 pr-1 font-normal">
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter ${chip.label}`}
            className="rounded-sm hover:bg-muted-foreground/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
        Clear all
      </Button>
    </div>
  );
}
