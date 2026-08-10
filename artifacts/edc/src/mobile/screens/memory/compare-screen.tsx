import { useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { useCompareDealMemory, type DealMemory } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { compactCurrency, formatDate, humanizeCode } from "@/lib/format";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";
import { normalizeOutcome, OUTCOME_LABEL } from "@/mobile/lib/outcome";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { adoptCompare, decodeCompare, MIN_COMPARE } from "@/mobile/screens/memory/compare-selection";

interface Row {
  key: keyof DealMemory | "outcome";
  label: string;
  /** Which end of the range reads as the good one, if either does. */
  best?: "max" | "min";
  format?: (value: unknown) => string;
}

/**
 * The attributes worth putting side by side.
 *
 * Not every field on the record — a comparison of twenty rows is a spreadsheet,
 * and the reason to compare two archived deals is almost always the same four
 * questions: what did it close at, how long did it take, how far did validation
 * get, and what got in the way.
 */
const ROWS: Row[] = [
  { key: "outcome", label: "Outcome" },
  {
    key: "finalTcv",
    label: "Final value",
    best: "max",
    format: (v) => (v == null ? "—" : compactCurrency(Number(v))),
  },
  { key: "totalDaysActive", label: "Days active", best: "min" },
  { key: "totalGatesCompleted", label: "Gates cleared", best: "max" },
  { key: "totalBlockersEncountered", label: "Blockers hit", best: "min" },
  {
    key: "pricingModel",
    label: "Pricing",
    format: (v) => (typeof v === "string" ? humanizeCode(v) : "—"),
  },
  { key: "servicesTier", label: "Services tier" },
  {
    key: "competitorsFaced",
    label: "Competitors",
    format: (v) => (Array.isArray(v) && v.length > 0 ? v.join(", ") : "—"),
  },
  {
    key: "archivedAt",
    label: "Archived",
    format: (v) => formatDate(typeof v === "string" ? v : null, "—"),
  },
];

/**
 * Two to four archived deals, side by side.
 *
 * ## A full screen with a sticky label rail, not a sheet
 *
 * The desktop version is a right-hand sheet holding a wide table. At 358px that
 * table is unreadable at any zoom — which is why this is a screen of its own,
 * with the attribute names pinned in a narrow left column and the deals paging
 * horizontally beside them. Scrolling to the fourth deal never loses which row
 * you are reading, which is the single thing that makes a comparison work on a
 * phone.
 *
 * ## The URL carries the ids
 *
 * So a comparison is shareable and the back gesture undoes it, and so opening a
 * shared one ticks the right cards back on the archive.
 */
export function CompareScreen() {
  const search = useSearch();
  const ids = useMemo(
    () => decodeCompare(new URLSearchParams(search).get("ids")),
    [search],
  );

  // Adopt into the store so backing out to the archive shows the same selection
  // ticked. Guarded inside adoptCompare against re-emitting an identical list,
  // which is what stops this looping.
  useEffect(() => {
    adoptCompare(ids);
  }, [ids]);

  const enabled = ids.length >= MIN_COMPARE;
  const query = useCompareDealMemory(
    { ids: ids.join(",") } as never,
    { query: { enabled } } as never,
  );
  const rows = (query.data?.data ?? []) as DealMemory[];

  return (
    <>
      <MNavBar
        title="Compare"
        subtitle={enabled ? `${ids.length} deals` : undefined}
        backHref="/memory"
        backLabel="Back to memory"
      />

      {!enabled ? (
        <EmptyState
          title="Pick at least two"
          body="Select records in the archive and tap Compare."
        />
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load the comparison"
          body="One of these records may have been removed. Go back and try again."
        />
      ) : query.isLoading ? (
        <div className="space-y-3 p-4">
          <Shimmer className="h-48 rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing to compare"
          body="These records could not be found in the archive."
        />
      ) : (
        <ComparisonTable rows={rows} />
      )}
    </>
  );
}

function ComparisonTable({ rows }: { rows: DealMemory[] }) {
  return (
    // The whole grid scrolls sideways; the first column is sticky inside it, so
    // the row labels stay put while the deals page past.
    <div className="overflow-x-auto overscroll-x-contain px-4 pb-6 pt-3">
      <table className="w-max border-collapse">
        <caption className="sr-only">Archived deals compared</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="m-label m-muted sticky left-0 z-10 w-28 bg-background pb-2 pr-3 text-left align-bottom"
            >
              Attribute
            </th>
            {rows.map((row) => (
              <th key={row.id} scope="col" className="w-40 pb-2 pr-4 text-left align-bottom">
                <span className="m-caption m-muted block truncate">{row.accountName}</span>
                <span className="m-headline block truncate">{row.dealName}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((definition) => {
            const values = rows.map((row) => (row as unknown as Record<string, unknown>)[definition.key]);
            const best = bestIndex(values, definition.best);
            return (
              <tr key={String(definition.key)} className="border-t border-border">
                <th
                  scope="row"
                  className="m-caption m-muted sticky left-0 z-10 bg-background py-2.5 pr-3 text-left"
                >
                  {definition.label}
                </th>
                {rows.map((row, i) => (
                  <td key={row.id} className="py-2.5 pr-4 align-top">
                    {definition.key === "outcome" ? (
                      <OutcomeCell value={row.outcome} />
                    ) : (
                      <span
                        className={cn(
                          "m-num",
                          // One rung per element — the rungs are unlayered, so
                          // `m-body` alongside `m-headline` is two author rules
                          // fighting over the same properties.
                          //
                          // Only the leader is marked, and only when there IS a
                          // better end. Marking a loser as well would put two
                          // colours on a four-column row and stop either meaning
                          // anything at a glance.
                          best === i ? "m-headline text-primary" : "m-body",
                        )}
                      >
                        {definition.format
                          ? definition.format(values[i])
                          : String(values[i] ?? "—")}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeCell({ value }: { value: string }) {
  const outcome = normalizeOutcome(value);
  return (
    <span
      className={cn(
        "m-label inline-block rounded-full px-2.5 py-1",
        OUTCOME_CLASS[outcome].bg,
        OUTCOME_CLASS[outcome].text,
      )}
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

/**
 * Which column leads on a row, or -1 when the row has no better end.
 *
 * Ties are deliberately unmarked: highlighting three identical figures as "best"
 * tells the reader nothing and makes the one genuinely leading row harder to
 * spot.
 */
function bestIndex(values: unknown[], best: Row["best"]): number {
  if (!best) return -1;
  const numeric = values.map((v) => (v == null ? NaN : Number(v)));
  const usable = numeric.filter((n) => Number.isFinite(n));
  if (usable.length < 2) return -1;

  const target = best === "max" ? Math.max(...usable) : Math.min(...usable);
  if (usable.filter((n) => n === target).length > 1) return -1;
  return numeric.findIndex((n) => n === target);
}
