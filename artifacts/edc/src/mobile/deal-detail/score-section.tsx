import { humanizeCode } from "@/lib/format";
import type { DealScore } from "@workspace/api-client-react";
import { CollapsibleSection } from "@/mobile/components/collapsible-section";

/**
 * The predictive close score and the factors behind it.
 *
 * `breakdown` is typed as an open record in the API contract, so each row is
 * read defensively — a factor the server adds later renders as an unlabelled
 * contribution rather than crashing the screen.
 */
interface BreakdownRow {
  label: string;
  contribution: number;
}

function readBreakdown(items: Record<string, unknown>[]): BreakdownRow[] {
  return items
    .map((item) => {
      const rawLabel = item.factor ?? item.name ?? item.label;
      const rawValue = item.contribution ?? item.weightedScore ?? item.value;
      return {
        label: typeof rawLabel === "string" ? humanizeCode(rawLabel) : "Other",
        contribution: typeof rawValue === "number" ? rawValue : 0,
      };
    })
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

export function ScoreSection({ score }: { score: DealScore }) {
  const rows = readBreakdown(score.breakdown as Record<string, unknown>[]).slice(0, 5);
  const peak = Math.max(...rows.map((r) => Math.abs(r.contribution)), 1);

  const verdict = (
    <>
      <p className="m-title">
        {score.score}
        <span className="m-caption m-muted ml-1">/ 100</span>
      </p>
      <p className="m-caption m-muted mt-1">{humanizeCode(score.confidence)} confidence</p>
    </>
  );

  return (
    <CollapsibleSection anchorId="score" label="Predictive score" verdict={verdict}>
      {rows.length > 0 ? (
        <>
          <p className="m-label mb-3">What moves it</p>
          <ul className="space-y-2.5">
            {/* Keyed by position, not label: readBreakdown falls back to
                "Other" for any factor the server sends without a string
                label, and two of those collide. The order is a deterministic
                sort of the same payload, so the index is stable. */}
            {rows.map((row, i) => (
              <li key={i}>
                <div className="m-caption flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="m-muted shrink-0">{row.contribution.toFixed(1)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      row.contribution >= 0
                        ? "h-full rounded-full bg-emerald-500"
                        : "h-full rounded-full bg-orange-500"
                    }
                    style={{ width: `${(Math.abs(row.contribution) / peak) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : undefined}
    </CollapsibleSection>
  );
}
