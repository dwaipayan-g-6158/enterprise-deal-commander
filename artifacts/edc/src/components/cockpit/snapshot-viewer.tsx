import {
  useGetDealSnapshot,
  getGetDealSnapshotQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Circle, AlertCircle } from "lucide-react";
import { formatCurrency } from "./use-invalidate";

interface SnapshotDeal {
  dealName?: string;
  accountName?: string;
  salesStage?: string;
  dealCurrency?: string;
  productRevenue?: number;
  servicesRevenue?: number;
  calculatedTCV?: number;
  normalizedTCV?: number;
  healthStatus?: string;
  pricingModel?: string;
  contractTermYears?: number | null;
  accountManager?: string | null;
  technicalLead?: string | null;
  winProbabilityPct?: number | null;
  expectedCloseDate?: string | null;
}

interface SnapshotGate {
  gateCode: string;
  label: string;
  isCompleted: boolean;
  gateGroup: number;
}

interface SnapshotGovernance {
  healthStatus?: string;
  alerts?: { code: string; severity: string }[];
}

interface SnapshotPayload {
  deal?: SnapshotDeal;
  gates?: SnapshotGate[];
  governance?: SnapshotGovernance;
}

const HEALTH_BADGE: Record<string, string> = {
  GREEN: "bg-emerald-500 hover:bg-emerald-600 text-white",
  YELLOW: "bg-amber-500 hover:bg-amber-600 text-white",
  AMBER: "bg-amber-500 hover:bg-amber-600 text-white",
};

const SEVERITY_COLORS: Record<string, string> = {
  RED: "text-red-500",
  AMBER: "text-amber-500",
  YELLOW: "text-amber-500",
};

function healthBadgeClass(status: string | undefined) {
  if (!status) return "";
  return HEALTH_BADGE[status] ?? "";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b last:border-b-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  );
}

/**
 * Read-only point-in-time view of a single durable snapshot. Renders the deal's
 * full serialized state (economics, gates, governance summary) exactly as it was
 * captured into `edc_v2.deal_snapshots`. Opened from the History tab.
 */
export function SnapshotViewer({
  snapshotId,
  open,
  onOpenChange,
}: {
  snapshotId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError } = useGetDealSnapshot(snapshotId ?? "", {
    query: {
      enabled: open && !!snapshotId,
      queryKey: getGetDealSnapshotQueryKey(snapshotId ?? ""),
    },
  });

  const snapshot = data?.data;
  const payload = (snapshot?.payload ?? {}) as SnapshotPayload;
  const deal = payload.deal ?? {};
  const gates = payload.gates ?? [];
  const governance = payload.governance ?? {};
  const currency = deal.dealCurrency ?? "USD";

  const completedGates = gates.filter((g) => g.isCompleted).length;
  const alerts = governance.alerts ?? [];
  const health = snapshot?.healthStatus ?? deal.healthStatus;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Point-in-time snapshot</span>
            {health && (
              <Badge
                variant={health === "RED" ? "destructive" : "secondary"}
                className={healthBadgeClass(health)}
              >
                {health}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {snapshot
              ? `Captured ${new Date(snapshot.snapshotAt).toLocaleString()} · ${snapshot.reason}`
              : "Read-only view of this deal's state at the time of the snapshot."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : isError || !snapshot ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-muted-foreground">Could not load this snapshot.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold mb-2">Deal</h3>
                <div className="rounded-lg border px-4">
                  <Row label="Deal Name" value={deal.dealName ?? "—"} />
                  <Row label="Account" value={deal.accountName ?? "—"} />
                  <Row label="Sales Stage" value={deal.salesStage ?? snapshot.salesStage ?? "—"} />
                  <Row
                    label="Win Probability"
                    value={
                      deal.winProbabilityPct != null
                        ? `${deal.winProbabilityPct}%`
                        : "—"
                    }
                  />
                  <Row
                    label="Expected Close"
                    value={deal.expectedCloseDate ?? "—"}
                  />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Economics</h3>
                <div className="rounded-lg border px-4">
                  <Row
                    label="Product Revenue"
                    value={
                      <span className="font-mono">
                        {formatCurrency(deal.productRevenue ?? 0, currency)}
                      </span>
                    }
                  />
                  <Row
                    label="Services Revenue"
                    value={
                      <span className="font-mono">
                        {formatCurrency(deal.servicesRevenue ?? 0, currency)}
                      </span>
                    }
                  />
                  <Row
                    label="Total Contract Value"
                    value={
                      <span className="font-mono font-semibold">
                        {formatCurrency(deal.calculatedTCV ?? 0, currency)}
                      </span>
                    }
                  />
                  <Row
                    label="Normalized TCV"
                    value={
                      <span className="font-mono">
                        {formatCurrency(deal.normalizedTCV ?? 0, currency)}
                      </span>
                    }
                  />
                  <Row label="Pricing Model" value={deal.pricingModel ?? "—"} />
                  <Row
                    label="Term"
                    value={
                      deal.contractTermYears != null
                        ? `${deal.contractTermYears} Years`
                        : "—"
                    }
                  />
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Technical Gates</h3>
                  <span className="text-xs text-muted-foreground">
                    {completedGates}/{gates.length} complete
                  </span>
                </div>
                {gates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No gates captured in this snapshot.
                  </p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 rounded-lg border p-4">
                    {gates.map((g) => (
                      <div
                        key={g.gateCode}
                        className="flex items-center gap-2 text-sm py-0.5"
                      >
                        {g.isCompleted ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <span
                          className={
                            g.isCompleted ? "" : "text-muted-foreground"
                          }
                        >
                          {g.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Governance</h3>
                  <span className="text-xs text-muted-foreground">
                    {alerts.length} active alert{alerts.length === 1 ? "" : "s"}
                  </span>
                </div>
                {alerts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active risk alerts at this point in time.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {alerts.map((a) => (
                      <Badge
                        key={a.code}
                        variant="outline"
                        className={SEVERITY_COLORS[a.severity] ?? ""}
                      >
                        {a.code}
                        <span className="ml-1 opacity-60">{a.severity}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
