import { useMemo, useState } from "react";
import { Link } from "wouter";
import type { RiskMatrix, RiskCell, ProductMixDeal } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Grid3x3, ArrowUpRight } from "lucide-react";

type Axis = "accountManager" | "technicalLead";

function compactValue(n: number, currency: string): string {
  const sym = currency === "USD" ? "$" : `${currency} `;
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}K`;
  return `${sym}${Math.round(n)}`;
}

// riskScore bands mirror the PRD semantic ramp (and the Whitespace heatmap):
// emerald → amber → orange → rose. Tint stays low-opacity so it reads as data.
function riskBand(score: number): { cell: string; label: string } {
  if (score >= 81)
    return { cell: "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25", label: "Critical" };
  if (score >= 61)
    return { cell: "bg-orange-500/15 border-orange-500/30 text-orange-700 dark:text-orange-300 hover:bg-orange-500/25", label: "Elevated" };
  if (score >= 26)
    return { cell: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25", label: "Moderate" };
  return { cell: "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25", label: "Low" };
}

const SEP = "␟";
const cellKey = (person: string, product: string) => `${person}${SEP}${product}`;

/** Drill-down deal list (kept local to avoid coupling to ProductMixSection). */
function DealList({ deals, currency }: { deals: ProductMixDeal[]; currency: string }) {
  if (deals.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No deals.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {deals.map((d) => (
        <li key={d.id}>
          <Link
            href={`/deals/${d.id}`}
            className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium group-hover:underline">{d.dealName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {d.accountName} · {d.salesStage}
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {compactValue(d.tcv, currency)}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PortfolioRiskHeatmap({
  matrix,
  currency = "USD",
}: {
  matrix: RiskMatrix;
  currency?: string;
}) {
  const [axis, setAxis] = useState<Axis>("accountManager");
  const [selected, setSelected] = useState<string | null>(null);

  const cells = axis === "accountManager" ? matrix.byAccountManager : matrix.byTechnicalLead;
  const persons = axis === "accountManager" ? matrix.accountManagers : matrix.technicalLeads;
  const products = matrix.products;

  const cellMap = useMemo(() => {
    const m = new Map<string, RiskCell>();
    for (const c of cells) m.set(cellKey(c.person, c.product), c);
    return m;
  }, [cells]);

  // Reset the open drill-down when the axis changes (its key may not exist).
  const selectedCell = selected ? cellMap.get(selected) ?? null : null;

  const hasData = persons.length > 0 && products.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Grid3x3 className="h-4 w-4 text-muted-foreground" />
            Risk Heatmap
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Composite risk (0–100) at each {axis === "accountManager" ? "account manager" : "technical lead"} ×
            product intersection. Select a cell to inspect its deals.
          </p>
        </div>
        <div className="flex shrink-0 rounded-md border p-0.5 text-xs">
          {(["accountManager", "technicalLead"] as Axis[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAxis(a);
                setSelected(null);
              }}
              aria-pressed={axis === a}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                axis === a ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {a === "accountManager" ? "Acct Manager" : "Tech Lead"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasData ? (
          <p className="text-sm text-muted-foreground">
            Insufficient data to build a heatmap for this axis.
          </p>
        ) : (
          <TooltipProvider delayDuration={150}>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card" />
                    {products.map((p) => (
                      <th
                        key={p}
                        className="px-1 pb-1 text-left align-bottom text-xs font-medium text-muted-foreground"
                      >
                        <span className="block max-w-[5.5rem] truncate" title={p}>{p}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {persons.map((person) => (
                    <tr key={person}>
                      <th className="sticky left-0 z-10 bg-card pr-2 text-right text-xs font-medium">
                        <span className="block max-w-[8rem] truncate" title={person}>{person}</span>
                      </th>
                      {products.map((product) => {
                        const key = cellKey(person, product);
                        const cell = cellMap.get(key);
                        if (!cell) {
                          return (
                            <td key={product} className="p-0">
                              <div className="flex h-10 w-14 items-center justify-center rounded-md border border-dashed border-border/40 text-muted-foreground/30">
                                ·
                              </div>
                            </td>
                          );
                        }
                        const band = riskBand(cell.riskScore);
                        const isSelected = selected === key;
                        return (
                          <td key={product} className="p-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => setSelected(isSelected ? null : key)}
                                  className={cn(
                                    "flex h-10 w-14 flex-col items-center justify-center rounded-md border font-mono text-sm font-semibold tabular-nums transition-colors",
                                    band.cell,
                                    cell.lowConfidence && "opacity-50 border-dotted",
                                    isSelected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                                  )}
                                  aria-label={`${person}, ${product}: risk ${cell.riskScore}, ${cell.dealCount} deals${cell.lowConfidence ? ", low confidence" : ""}`}
                                >
                                  {cell.riskScore}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-popover border border-border text-popover-foreground shadow-lg p-3 max-w-xs">
                                <p className="font-medium">{person} × {product}</p>
                                <p className="mt-1 text-muted-foreground">
                                  {band.label} risk · {cell.dealCount} {cell.dealCount === 1 ? "deal" : "deals"} · {compactValue(cell.tcv, currency)}
                                </p>
                                {cell.topAlertCodes.length > 0 && (
                                  <p className="mt-1 font-mono text-muted-foreground">
                                    {cell.topAlertCodes.join(", ")}
                                  </p>
                                )}
                                {cell.lowConfidence && (
                                  <p className="mt-1 text-amber-500">Low confidence (&lt;3 deals)</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TooltipProvider>
        )}

        {selectedCell && (
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">
                {selectedCell.person} × {selectedCell.product}
              </span>
              <span className="text-xs text-muted-foreground">
                risk {selectedCell.riskScore} · {compactValue(selectedCell.tcv, currency)}
              </span>
            </div>
            <DealList deals={selectedCell.deals} currency={currency} />
          </div>
        )}

        {hasData && <HeatLegend />}
      </CardContent>
    </Card>
  );
}

function HeatLegend() {
  const items = [
    { label: "Low (0–25)", cls: "bg-emerald-500/40" },
    { label: "Moderate (26–60)", cls: "bg-amber-500/40" },
    { label: "Elevated (61–80)", cls: "bg-orange-500/40" },
    { label: "Critical (81–100)", cls: "bg-rose-500/40" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
      <span className="font-medium">Composite risk:</span>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", i.cls)} />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border border-dotted border-muted-foreground/60 opacity-50" />
        Low confidence (&lt;3 deals)
      </span>
    </div>
  );
}
