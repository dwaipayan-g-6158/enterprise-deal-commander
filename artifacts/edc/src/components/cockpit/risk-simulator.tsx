import { useEffect, useMemo, useState } from "react";
import {
  useListPipelineStages,
  useListPricingModels,
  useListServicesTiers,
  type Deal,
  type Intelligence,
} from "@workspace/api-client-react";
import {
  useEngineContext,
  recomputeIntelligence,
  type EngineOverrides,
} from "./engine-recompute";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldAlert, AlertTriangle, RotateCcw, ArrowRight, Sparkles } from "lucide-react";
import { formatCurrency } from "./use-invalidate";

interface SimState {
  sales_stage: string;
  product_revenue: number;
  services_revenue: number;
  services_tier: string;
  pricing_model: string;
  contract_term_years: number;
  expected_close_date: string;
  gates: Record<string, boolean>;
}

function HealthBadge({ status }: { status: "RED" | "YELLOW" | "GREEN" }) {
  return (
    <Badge
      variant={status === "RED" ? "destructive" : status === "YELLOW" ? "default" : "secondary"}
      className={
        status === "YELLOW"
          ? "bg-amber-500 text-white"
          : status === "GREEN"
            ? "bg-emerald-500 text-white"
            : ""
      }
    >
      {status}
    </Badge>
  );
}

export function RiskSimulator({
  deal,
  intel,
  open,
  onOpenChange,
}: {
  deal: Deal;
  intel: Intelligence;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const ctx = useEngineContext(deal, intel);
  const { data: stages } = useListPipelineStages();
  const { data: models } = useListPricingModels();
  const { data: tiers } = useListServicesTiers();

  const initial = useMemo<SimState>(
    () => ({
      sales_stage: deal.salesStage,
      product_revenue: deal.productRevenue,
      services_revenue: deal.servicesRevenue,
      services_tier: deal.servicesTier ?? intel.financials.servicesTier,
      pricing_model: deal.pricingModel ?? intel.financials.pricingModel,
      contract_term_years: deal.contractTermYears ?? 1,
      expected_close_date: deal.expectedCloseDate?.slice(0, 10) ?? "",
      gates: Object.fromEntries(
        intel.technicalTrack.gates.map((g) => [g.gateCode, g.isCompleted]),
      ),
    }),
    [deal, intel],
  );

  const [sim, setSim] = useState<SimState>(initial);

  useEffect(() => {
    if (open) setSim(initial);
  }, [open, initial]);

  const toOverrides = (s: SimState): EngineOverrides => ({
    salesStage: s.sales_stage,
    productRevenue: s.product_revenue,
    servicesRevenue: s.services_revenue,
    servicesTier: s.services_tier,
    pricingModel: s.pricing_model,
    termYears: s.contract_term_years,
    expectedCloseDate: s.expected_close_date || null,
    gates: s.gates,
  });

  const baseline = useMemo(
    () => recomputeIntelligence(deal, intel, toOverrides(initial), ctx),
    [deal, intel, initial, ctx],
  );
  const result = useMemo(
    () => recomputeIntelligence(deal, intel, toOverrides(sim), ctx),
    [deal, intel, sim, ctx],
  );

  const baseCodes = new Set(baseline.governance.alerts.map((a) => a.code));
  const simCodes = new Set(result.governance.alerts.map((a) => a.code));
  const added = result.governance.alerts.filter((a) => !baseCodes.has(a.code));
  const removed = baseline.governance.alerts.filter((a) => !simCodes.has(a.code));

  const set = <K extends keyof SimState>(key: K, value: SimState[K]) =>
    setSim((p) => ({ ...p, [key]: value }));

  const isDirty = JSON.stringify(sim) !== JSON.stringify(initial);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Risk Simulator
          </DialogTitle>
          <DialogDescription>
            Adjust deal levers to see how the intelligence engine reclassifies risk. Nothing is
            saved — this runs the identical engine in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Sales Stage</Label>
              <Select value={sim.sales_stage} onValueChange={(v) => set("sales_stage", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages?.data.map((s) => (
                    <SelectItem key={s.id} value={s.stageName}>
                      {s.stageName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Product Revenue</Label>
                <Input
                  type="number"
                  value={sim.product_revenue}
                  onChange={(e) => set("product_revenue", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Services Revenue</Label>
                <Input
                  type="number"
                  value={sim.services_revenue}
                  onChange={(e) => set("services_revenue", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Pricing Model</Label>
                <Select value={sim.pricing_model} onValueChange={(v) => set("pricing_model", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models?.data.map((m) => (
                      <SelectItem key={m.id} value={m.modelName}>
                        {m.modelName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Services Tier</Label>
                <Select value={sim.services_tier} onValueChange={(v) => set("services_tier", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers?.data.map((t) => (
                      <SelectItem key={t.id} value={t.tierName}>
                        {t.tierName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Term (yrs)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={sim.contract_term_years}
                  onChange={(e) => set("contract_term_years", Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Expected Close</Label>
                <Input
                  type="date"
                  value={sim.expected_close_date}
                  onChange={(e) => set("expected_close_date", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Technical Gates</Label>
              <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                {intel.technicalTrack.gates.map((g) => (
                  <div key={g.gateCode} className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm">{g.label}</span>
                    <Switch
                      checked={sim.gates[g.gateCode] ?? g.isCompleted}
                      onCheckedChange={(v) =>
                        set("gates", { ...sim.gates, [g.gateCode]: v })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSim(initial)}
              disabled={!isDirty}
            >
              <RotateCcw className="h-4 w-4 mr-2" /> Reset to current
            </Button>
          </div>

          {/* Results */}
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Health</span>
                <div className="flex items-center gap-2">
                  <HealthBadge status={baseline.governance.healthStatus} />
                  {result.governance.healthStatus !== baseline.governance.healthStatus && (
                    <>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <HealthBadge status={result.governance.healthStatus} />
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Normalized TCV</span>
                <span className="font-mono text-sm">
                  {formatCurrency(
                    result.financials.normalizedTCV,
                    result.financials.reportingCurrency,
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Technical Progress</span>
                <span className="font-mono text-sm">
                  {result.technicalTrack.progressPercentage}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Risk Patterns</span>
                <span className="font-mono text-sm">
                  {baseline.governance.alerts.length} → {result.governance.alerts.length}
                </span>
              </div>
            </div>

            {added.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-destructive font-medium">
                  New risks ({added.length})
                </p>
                {added.map((a) => (
                  <div key={a.code} className="flex items-start gap-2 text-sm">
                    {a.severity === "RED" ? (
                      <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            )}

            {removed.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-emerald-500 font-medium">
                  Cleared ({removed.length})
                </p>
                {removed.map((a) => (
                  <div
                    key={a.code}
                    className="flex items-start gap-2 text-sm text-muted-foreground line-through"
                  >
                    <span>{a.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Simulated posture ({result.governance.alerts.length})
              </p>
              {result.governance.alerts.length === 0 ? (
                <p className="text-sm text-emerald-500">All clear in this simulation.</p>
              ) : (
                result.governance.alerts.map((a) => (
                  <div key={a.code} className="flex items-start gap-2 text-sm">
                    {a.severity === "RED" ? (
                      <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    )}
                    <span>{a.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
