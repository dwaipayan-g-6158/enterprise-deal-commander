import { useListDeals } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/components/cockpit/use-invalidate";

const healthColor: Record<string, string> = {
  RED: "bg-destructive text-white",
  YELLOW: "bg-amber-500 text-white",
  GREEN: "bg-emerald-500 text-white",
};

/**
 * Mobile Companion (V2 F18) — a read-first, 4-data-points-per-card view scoped
 * to small screens. Reuses existing deal read endpoints. (Offline service-worker
 * support is deferred; see the V2 plan.)
 */
export default function MobileHome() {
  const [, navigate] = useLocation();
  const { data } = useListDeals({ state: "active" });
  const deals = [...(data?.data ?? [])].sort((a, b) => (b.calculatedTCV ?? 0) - (a.calculatedTCV ?? 0));
  const totalTcv = deals.reduce((s, d) => s + (d.calculatedTCV ?? 0), 0);
  const redCount = deals.filter((d) => d.healthStatus === "RED").length;

  return (
    <div className="mx-auto max-w-md p-4 space-y-3">
      <div className="sticky top-0 bg-background pb-2">
        <h1 className="text-xl font-bold">EDC</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline: <span className="font-mono">{formatCurrency(totalTcv, "USD")}</span> · {redCount} RED
        </p>
      </div>
      {deals.map((d) => (
        <button
          key={d.id}
          onClick={() => navigate(`/deals/${d.id}`)}
          className="w-full text-left rounded-lg border p-4 active:bg-muted"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold">{d.accountName}</span>
            <Badge className={healthColor[d.healthStatus] ?? ""}>{d.healthStatus}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{d.dealName}</p>
          <p className="text-2xl font-bold font-mono mt-1">
            {formatCurrency(d.calculatedTCV ?? 0, d.dealCurrency)}
          </p>
        </button>
      ))}
    </div>
  );
}
