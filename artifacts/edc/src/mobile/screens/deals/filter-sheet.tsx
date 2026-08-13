import { useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactCurrency } from "@/lib/format";
import { HEALTH_SHORT_LABEL, type Health } from "@/lib/semantic-colors";
import { VELOCITY_LABEL } from "@/components/roster/model/velocity";
import type {
  CloseDatePreset,
  DealClosure,
  RosterFilters,
  RosterRow,
  VelocityBucket,
} from "@/components/roster/model/roster-types";
import { MSheet } from "@/mobile/ui/m-sheet";
import { haptic } from "@/mobile/lib/haptics";

const HEALTHS: Health[] = ["RED", "YELLOW", "GREEN"];

/**
 * NO_DATE gets a written-out label rather than `VELOCITY_LABEL`'s em dash.
 *
 * An em dash is the right mark on a card — it says "no signal" without competing
 * with the marks that do mean something — but a filter chip reading "—" is a
 * chip nobody can guess the meaning of, and guessing is the only way to find out
 * what it does.
 */
const VELOCITIES: { id: VelocityBucket; label: string }[] = [
  { id: "STALLED", label: VELOCITY_LABEL.STALLED },
  { id: "SLOW", label: VELOCITY_LABEL.SLOW },
  { id: "NORMAL", label: VELOCITY_LABEL.NORMAL },
  { id: "FAST", label: VELOCITY_LABEL.FAST },
  { id: "NO_DATE", label: "No benchmark" },
];

const CLOSE_PRESETS: { id: CloseDatePreset; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "overdue", label: "Overdue" },
  { id: "30d", label: "30 days" },
  { id: "60d", label: "60 days" },
  { id: "90d", label: "90 days" },
  { id: "quarter", label: "This quarter" },
];

const CLOSURES: { id: DealClosure; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Decided" },
  { id: "all", label: "Both" },
];

/**
 * Every filter the roster supports, as a sheet.
 *
 * ## The options come from the rows, not from a lookup
 *
 * Stages, account managers and technical leads are derived from the deals
 * actually loaded. A filter offering a name with no deals behind it is a filter
 * whose only outcome is an empty list, and on a phone that costs a tap, a scroll
 * and a trip back. The desktop panel can afford to list everything because it
 * shows counts beside each; this shows only what will do something.
 *
 * ## Numeric ranges are shown but not edited
 *
 * TCV and score ranges have no control here — two-thumb sliders are a poor touch
 * target and a poor way to say "over two million". But a link from a laptop can
 * carry them, and a badge counting a filter the reader cannot see or remove is
 * the kind of thing that makes an app feel broken. So a range that IS set
 * renders as a row with a Clear on it.
 */
export function FilterSheet({
  open,
  onOpenChange,
  filters,
  rows,
  currency,
  onChange,
  onClear,
  matchedCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: RosterFilters;
  /** The loaded deals, for deriving which options can do anything. */
  rows: RosterRow[];
  currency: string;
  onChange: (patch: Partial<RosterFilters>) => void;
  onClear: () => void;
  matchedCount: number;
}) {
  const options = useMemo(() => {
    const stages = new Set<string>();
    const managers = new Set<string>();
    const leads = new Set<string>();
    for (const row of rows) {
      if (row.salesStage) stages.add(row.salesStage);
      if (row.accountManager) managers.add(row.accountManager);
      if (row.technicalLead) leads.add(row.technicalLead);
    }
    return {
      // Pipeline order, not alphabetical: a stage list sorted A-Z reads as a
      // random order to anyone who knows the pipeline.
      stages: [...stages].sort(
        (a, b) => stageOrder(rows, a) - stageOrder(rows, b),
      ),
      managers: [...managers].sort(),
      leads: [...leads].sort(),
    };
  }, [rows]);

  const hasTcvRange = filters.tcvMin != null || filters.tcvMax != null;
  const hasScoreRange = filters.scoreMin != null || filters.scoreMax != null;

  return (
    <MSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filter deals"
      description="Narrow the list. Every choice is written to the address, so the back gesture undoes it."
      snapPoints={[0.6, 0.95]}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="m-label m-press m-tap flex-1 rounded-full border border-border py-3"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="m-label m-press m-tap flex-1 rounded-full bg-primary py-3 text-primary-foreground"
          >
            Show {matchedCount}
          </button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        <ChipGroup
          label="Status"
          options={HEALTHS.map((h) => ({ id: h, label: HEALTH_SHORT_LABEL[h] }))}
          selected={filters.health}
          onToggle={(id) => onChange({ health: toggle(filters.health, id as Health) })}
        />

        <ChipGroup
          label="Pace"
          options={VELOCITIES}
          selected={filters.velocity}
          onToggle={(id) => onChange({ velocity: toggle(filters.velocity, id as VelocityBucket) })}
        />

        {options.stages.length > 0 ? (
          <ChipGroup
            label="Stage"
            options={options.stages.map((s) => ({ id: s, label: s }))}
            selected={filters.stage}
            onToggle={(id) => onChange({ stage: toggle(filters.stage, id) })}
          />
        ) : null}

        <ChipGroup
          label="Closing"
          single
          options={CLOSE_PRESETS}
          selected={[filters.closePreset]}
          onToggle={(id) => onChange({ closePreset: id as CloseDatePreset })}
        />

        <ChipGroup
          label="Decided deals"
          single
          options={CLOSURES}
          selected={[filters.closure]}
          onToggle={(id) => onChange({ closure: id as DealClosure })}
        />

        {options.managers.length > 1 ? (
          <ChipGroup
            label="Account manager"
            options={options.managers.map((m) => ({ id: m, label: m }))}
            selected={filters.accountManager}
            onToggle={(id) => onChange({ accountManager: toggle(filters.accountManager, id) })}
          />
        ) : null}

        {options.leads.length > 1 ? (
          <ChipGroup
            label="Technical lead"
            options={options.leads.map((l) => ({ id: l, label: l }))}
            selected={filters.technicalLead}
            onToggle={(id) => onChange({ technicalLead: toggle(filters.technicalLead, id) })}
          />
        ) : null}

        <ChipGroup
          label="Competition"
          single
          options={[
            { id: "any", label: "Any" },
            { id: "yes", label: "Contested" },
            { id: "no", label: "Uncontested" },
          ]}
          selected={[filters.hasCompetitors == null ? "any" : filters.hasCompetitors ? "yes" : "no"]}
          onToggle={(id) =>
            onChange({ hasCompetitors: id === "any" ? null : id === "yes" })
          }
        />

        <ChipGroup
          label="Commit"
          single
          options={[
            { id: "any", label: "Any" },
            { id: "yes", label: "Committed" },
            { id: "no", label: "Not committed" },
          ]}
          selected={[filters.committed == null ? "any" : filters.committed ? "yes" : "no"]}
          onToggle={(id) => onChange({ committed: id === "any" ? null : id === "yes" })}
        />

        {hasTcvRange ? (
          <CarriedRange
            label="Value"
            value={rangeText(filters.tcvMin, filters.tcvMax, (n) => compactCurrency(n, currency))}
            onClear={() => onChange({ tcvMin: null, tcvMax: null })}
          />
        ) : null}

        {hasScoreRange ? (
          <CarriedRange
            label="Score"
            value={rangeText(filters.scoreMin, filters.scoreMax, (n) => String(n))}
            onClear={() => onChange({ scoreMin: null, scoreMax: null })}
          />
        ) : null}
      </div>
    </MSheet>
  );
}

interface ChipOption {
  id: string;
  label: string;
}

/**
 * A labelled group of filter chips.
 *
 * Multi-select groups are checkboxes and single-select groups are radios,
 * declared as such — the two behave differently under a screen reader, and a
 * group of buttons that happen to look selected tells it nothing at all.
 */
function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  single = false,
}: {
  label: string;
  options: ChipOption[];
  selected: string[];
  onToggle: (id: string) => void;
  single?: boolean;
}) {
  return (
    <fieldset>
      <legend className="m-label m-muted mb-2">{label}</legend>
      <div role={single ? "radiogroup" : undefined} aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isOn = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role={single ? "radio" : "checkbox"}
              aria-checked={isOn}
              onClick={() => {
                haptic();
                onToggle(option.id);
              }}
              className={cn(
                "m-label m-press m-tap inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2.5",
                isOn
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {isOn ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A range this sheet cannot edit but must not hide. */
function CarriedRange({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
      <div className="min-w-0">
        <p className="m-label m-muted">{label}</p>
        <p className="m-body m-num truncate">{value}</p>
      </div>
      <button type="button" onClick={onClear} className="m-label m-press m-tap shrink-0 text-primary">
        Clear
      </button>
    </div>
  );
}

function toggle<T extends string>(current: T[], id: T): T[] {
  return current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
}

function rangeText(
  min: number | null,
  max: number | null,
  format: (n: number) => string,
): string {
  if (min != null && max != null) return `${format(min)} – ${format(max)}`;
  if (min != null) return `${format(min)} and above`;
  return `up to ${format(max!)}`;
}

/** The pipeline position of a stage, read off any row that is in it. */
function stageOrder(rows: RosterRow[], stage: string): number {
  return rows.find((r) => r.salesStage === stage)?.salesStageId ?? 99;
}
