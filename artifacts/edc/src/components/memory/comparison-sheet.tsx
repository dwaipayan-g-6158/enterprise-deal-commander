import { useCompareDealMemory } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/format";

const ROWS: { label: string; key: string; format?: (v: unknown) => string; best?: "max" | "min" }[] = [
  { label: "Outcome", key: "outcome" },
  { label: "Final TCV", key: "finalTcv", format: money, best: "max" },
  { label: "Days Active", key: "totalDaysActive", best: "min" },
  { label: "Gates Completed", key: "totalGatesCompleted", best: "max" },
  { label: "Blockers", key: "totalBlockersEncountered", best: "min" },
  { label: "Pricing Model", key: "pricingModel" },
  { label: "Services Tier", key: "servicesTier" },
];

export function ComparisonSheet({
  ids,
  open,
  onOpenChange,
}: {
  ids: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data } = useCompareDealMemory({ ids: ids.join(",") } as never);
  const rows = data?.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>Compare {rows.length} Deals</SheetTitle>
        </SheetHeader>
        <div className="overflow-x-auto py-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 border-b text-muted-foreground">Attribute</th>
                {rows.map((r) => (
                  <th key={r.id} className="text-left p-2 border-b font-medium">{r.dealName}<br /><span className="text-xs text-muted-foreground font-normal">{r.accountName}</span></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const values = rows.map((r) => (r as unknown as Record<string, unknown>)[row.key]);
                const numeric = values.map((v) => Number(v));
                const best = row.best === "max" ? Math.max(...numeric) : row.best === "min" ? Math.min(...numeric) : null;
                return (
                  <tr key={row.key}>
                    <td className="p-2 border-b text-muted-foreground">{row.label}</td>
                    {rows.map((r, i) => {
                      const raw = (r as unknown as Record<string, unknown>)[row.key];
                      const isBest = best != null && numeric[i] === best;
                      const isWorst = best != null && row.best === "max" ? numeric[i] === Math.min(...numeric) : row.best === "min" ? numeric[i] === Math.max(...numeric) : false;
                      return (
                        <td key={r.id} className={`p-2 border-b ${isBest ? "text-emerald-600 font-medium" : isWorst ? "text-destructive" : ""}`}>
                          {row.key === "outcome" ? (
                            <Badge className={raw === "Won" ? "bg-emerald-500 text-white" : "bg-destructive text-white"}>{String(raw)}</Badge>
                          ) : row.format ? (
                            row.format(raw)
                          ) : (
                            String(raw ?? "—")
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}
