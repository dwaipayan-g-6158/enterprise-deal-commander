import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectFilter, type FilterOption } from "./multi-select-filter";
import { MoreFiltersPanel } from "./more-filters-panel";
import { ColumnCustomizer } from "./column-customizer";
import { DensityToggle } from "./density-toggle";
import { VELOCITY_FILTER_OPTIONS, VELOCITY_LABEL } from "./model/velocity";
import type {
  ColumnLayout,
  Density,
  DealState,
  GroupBy,
  Health,
  RosterFilters,
  VelocityBucket,
} from "./model/roster-types";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "salesStage", label: "Group: Stage" },
  { value: "healthStatus", label: "Group: Health" },
  { value: "accountManager", label: "Group: Account Mgr" },
];

const HEALTH_OPTIONS: FilterOption[] = [
  { value: "RED", label: "Red" },
  { value: "YELLOW", label: "Yellow" },
  { value: "GREEN", label: "Green" },
];

const VELOCITY_OPTIONS: FilterOption[] = VELOCITY_FILTER_OPTIONS.map((v) => ({ value: v, label: VELOCITY_LABEL[v] }));

export function RosterToolbar({
  filters,
  setFilters,
  density,
  setDensity,
  searchInput,
  onSearchInput,
  stageOptions,
  amOptions,
  tlOptions,
  tagOptions,
  group,
  setGroup,
  columnLayout,
  setColumnLayout,
}: {
  filters: RosterFilters;
  setFilters: (patch: Partial<RosterFilters>) => void;
  density: Density;
  setDensity: (d: Density) => void;
  searchInput: string;
  onSearchInput: (v: string) => void;
  stageOptions: FilterOption[];
  amOptions: FilterOption[];
  tlOptions: FilterOption[];
  tagOptions: FilterOption[];
  group: GroupBy;
  setGroup: (g: GroupBy) => void;
  columnLayout: ColumnLayout;
  setColumnLayout: (next: ColumnLayout) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search deals, accounts, or owners…"
          className={cn("pl-9", searchInput && "pr-9")}
          value={searchInput}
          onChange={(e) => onSearchInput(e.target.value)}
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => onSearchInput("")}
            aria-label="Clear search"
            title="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <MultiSelectFilter
        label="Stage"
        options={stageOptions}
        selected={filters.stage}
        onChange={(v) => setFilters({ stage: v })}
      />
      <MultiSelectFilter
        label="Health"
        options={HEALTH_OPTIONS}
        selected={filters.health}
        onChange={(v) => setFilters({ health: v as Health[] })}
        searchable={false}
      />
      <MultiSelectFilter
        label="Velocity"
        options={VELOCITY_OPTIONS}
        selected={filters.velocity}
        onChange={(v) => setFilters({ velocity: v as VelocityBucket[] })}
        searchable={false}
      />
      <MoreFiltersPanel filters={filters} setFilters={setFilters} amOptions={amOptions} tlOptions={tlOptions} tagOptions={tagOptions} />

      <Select value={group} onValueChange={(v) => setGroup(v as GroupBy)}>
        <SelectTrigger className="w-[150px]" aria-label="Group rows">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GROUP_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        <ColumnCustomizer layout={columnLayout} onChange={setColumnLayout} />
        <Select value={filters.state} onValueChange={(v) => setFilters({ state: v as DealState })}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
        <DensityToggle density={density} onChange={setDensity} />
      </div>
    </div>
  );
}
