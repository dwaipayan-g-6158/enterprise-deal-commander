import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLUMNS } from "@/components/roster/model/roster-columns";
import type { ColumnId, GroupBy, SortSpec } from "@/components/roster/model/roster-types";
import { MSheet } from "@/mobile/ui/m-sheet";
import { haptic } from "@/mobile/lib/haptics";

/**
 * The sort keys worth having on a phone, in the order they get reached for.
 *
 * A subset of the thirteen sortable columns rather than all of them. The ones
 * left out — account manager, technical lead, account name — sort a list nobody
 * scans that way on a phone; they are filters here, not orders, and they are in
 * the filter sheet where they do more.
 *
 * Labels come from `COLUMNS` so the two shells cannot disagree about what a
 * column is called.
 */
const SORT_KEYS: ColumnId[] = [
  "calculatedTCV",
  "score",
  "expectedCloseDate",
  "healthStatus",
  "riskLevel",
  "velocity",
  "gatesPct",
  "lastActivity",
  "dealName",
];

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: "none", label: "None" },
  { id: "salesStage", label: "Stage" },
  { id: "healthStatus", label: "Status" },
  { id: "accountManager", label: "Owner" },
];

/**
 * Order and grouping.
 *
 * Single-key sort only. The desktop table supports a multi-key sort because it
 * has column headers to express one; a phone has this sheet, and a UI for
 * "then by" on a sheet is a UI nobody would use to solve a problem nobody has
 * on a list of thirty cards.
 *
 * Grouping is what survived the Kanban board. The board existed on desktop
 * chiefly to host drag-to-move-stage — a write that now lives on the deal's own
 * Stage screen, where the guardrail has room to explain itself — and what was
 * genuinely useful about it was seeing the pipeline banded by stage with
 * subtotals. That is a group header on a list, and it costs one column.
 */
export function SortSheet({
  open,
  onOpenChange,
  sort,
  group,
  onSort,
  onGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sort: SortSpec[];
  group: GroupBy;
  onSort: (sort: SortSpec[]) => void;
  onGroup: (group: GroupBy) => void;
}) {
  const active = sort[0];

  return (
    <MSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Sort & group"
      description="Choose the order of the list and whether it is banded."
    >
      <div className="space-y-5 pt-1">
        <div>
          <p className="m-label m-muted mb-2">Sort by</p>
          <ul className="m-card overflow-hidden">
            {SORT_KEYS.map((key, i) => {
              const isActive = active?.key === key;
              return (
                <li key={key} className={cn(i > 0 && "border-t border-border")}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      // Tapping the active key flips its direction; tapping a new
                      // one adopts that column's natural direction. Value and
                      // score read high-first; a close date reads soonest-first.
                      onSort([
                        isActive
                          ? { key, dir: active.dir === "desc" ? "asc" : "desc" }
                          : { key, dir: naturalDirection(key) },
                      ]);
                    }}
                    aria-pressed={isActive}
                    className="m-tap m-press flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="m-headline min-w-0 flex-1 truncate">
                      {COLUMNS[key]?.label ?? key}
                    </span>
                    {isActive ? (
                      <>
                        <span className="m-caption m-muted">
                          {active.dir === "desc" ? "High first" : "Low first"}
                        </span>
                        {active.dir === "desc" ? (
                          <ArrowDownWideNarrow className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        ) : (
                          <ArrowUpNarrowWide className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        )}
                      </>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="m-caption m-muted mt-2">Tap the current key again to reverse it.</p>
        </div>

        <div>
          <p className="m-label m-muted mb-2">Group by</p>
          <div role="radiogroup" aria-label="Group by" className="flex flex-wrap gap-2">
            {GROUPS.map((option) => {
              const isOn = option.id === group;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isOn}
                  onClick={() => {
                    haptic();
                    onGroup(option.id);
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
        </div>
      </div>
    </MSheet>
  );
}

/**
 * The direction a column is first read in.
 *
 * Getting this wrong is a small thing that feels broken: tapping "Value" and
 * being shown the smallest deal first reads as the sort having failed.
 */
function naturalDirection(key: ColumnId): SortSpec["dir"] {
  switch (key) {
    case "expectedCloseDate":
    case "dealName":
    case "accountName":
      return "asc";
    default:
      return "desc";
  }
}
