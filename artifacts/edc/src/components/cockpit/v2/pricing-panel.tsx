import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetPricingSchedule, useUpdatePricingSchedule } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { Plus, Trash2, Calculator, ChevronDown } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Multi-Year Pricing Schedule (the only TCV-affecting feature)        */
/* ------------------------------------------------------------------ */

interface Row {
  year_number: number;
  product_revenue: number;
  services_revenue: number;
  discount_pct: number;
}

/* ------------------------------------------------------------------ */
/* Commercial Worksheet (standalone, client-side only)                 */
/* ------------------------------------------------------------------ */

interface ServiceRow {
  id: string;
  label: string;
  hours: number;
  hourlyRate: number;
}

interface Worksheet {
  listPrice: number;
  discountPct: number;
  services: ServiceRow[];
  onboardingFee: number;
  supportPct: number;
  supportFlatOverride: number | null;
  trainingSessions: number;
  trainingCostPerSession: number;
}

const newServiceRow = (label = "Implementation", hourlyRate = 200): ServiceRow => ({
  id: crypto.randomUUID(),
  label,
  hours: 0,
  hourlyRate,
});

const defaultWorksheet = (): Worksheet => ({
  listPrice: 0,
  discountPct: 0,
  services: [newServiceRow()],
  onboardingFee: 0,
  supportPct: 18,
  supportFlatOverride: null,
  trainingSessions: 0,
  trainingCostPerSession: 0,
});

const storageKey = (dealId: string) => `edc.commercial.${dealId}`;

function loadWorksheet(dealId: string): Worksheet {
  if (typeof window === "undefined") return defaultWorksheet();
  try {
    const raw = window.localStorage.getItem(storageKey(dealId));
    if (!raw) return defaultWorksheet();
    const parsed = JSON.parse(raw) as Partial<Worksheet>;
    const base = defaultWorksheet();
    return {
      ...base,
      ...parsed,
      services:
        Array.isArray(parsed.services) && parsed.services.length
          ? parsed.services.map((s) => ({
              id: s.id ?? crypto.randomUUID(),
              label: s.label ?? "",
              hours: Number(s.hours) || 0,
              hourlyRate: Number(s.hourlyRate) || 0,
            }))
          : base.services,
    };
  } catch {
    return defaultWorksheet();
  }
}

/** Small labelled number input with stepper, used throughout the worksheet. */
function NumberField({
  label,
  value,
  onChange,
  step,
  min = 0,
  suffix,
  prefix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
  prefix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        ) : null}
        <Input
          type="number"
          min={min}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`font-mono ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""}`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A right-aligned monospace currency readout line. */
function MoneyLine({
  label,
  value,
  currency,
  emphasis,
  hint,
}: {
  label: string;
  value: number;
  currency: string;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={emphasis ? "font-medium" : "text-sm text-muted-foreground"}>
        {label}
        {hint ? <span className="ml-1 text-xs text-muted-foreground/70">{hint}</span> : null}
      </span>
      <span
        className={`font-mono tabular-nums ${
          emphasis ? "text-base font-semibold" : "text-sm"
        }`}
      >
        {formatCurrency(value, currency)}
      </span>
    </div>
  );
}

function WorksheetSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function PricingPanel({ dealId, currency }: { dealId: string; currency: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useGetPricingSchedule(dealId);
  const update = useUpdatePricingSchedule();
  const [rows, setRows] = useState<Row[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  useEffect(() => {
    const years = q.data?.data;
    if (years) {
      setRows(
        years.map((y) => ({
          year_number: y.yearNumber,
          product_revenue: y.productRevenue,
          services_revenue: y.servicesRevenue,
          discount_pct: y.discountPct ?? 0,
        })),
      );
    }
  }, [q.data?.data]);

  const ramp = q.data?.rampTCV ?? 0;
  const localTcv = rows.reduce(
    (s, r) => s + r.product_revenue * (1 - (r.discount_pct || 0) / 100) + r.services_revenue,
    0,
  );

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const addYear = () =>
    setRows((rs) => [
      ...rs,
      { year_number: rs.length + 1, product_revenue: 0, services_revenue: 0, discount_pct: 0 },
    ]);

  const save = async () => {
    try {
      await update.mutateAsync({ dealId, data: { years: rows } as never });
      await qc.invalidateQueries({ queryKey: q.queryKey });
      toast({
        title: "Pricing schedule saved",
        description: `Ramp TCV ${formatCurrency(localTcv, currency)}`,
      });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  };

  /* ---------------- Commercial Worksheet state ---------------- */

  const [ws, setWs] = useState<Worksheet>(() => loadWorksheet(dealId));

  // Reload worksheet when the deal changes.
  useEffect(() => {
    setWs(loadWorksheet(dealId));
  }, [dealId]);

  // Persist on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(dealId), JSON.stringify(ws));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [dealId, ws]);

  const patchWs = (patch: Partial<Worksheet>) => setWs((w) => ({ ...w, ...patch }));

  const setService = (id: string, patch: Partial<ServiceRow>) =>
    setWs((w) => ({
      ...w,
      services: w.services.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const addService = () =>
    setWs((w) => ({ ...w, services: [...w.services, newServiceRow("", 200)] }));

  const removeService = (id: string) =>
    setWs((w) => ({ ...w, services: w.services.filter((s) => s.id !== id) }));

  const calc = useMemo(() => {
    const netProduct = ws.listPrice * (1 - (ws.discountPct || 0) / 100);
    const servicesSubtotal = ws.services.reduce(
      (s, r) => s + (r.hours || 0) * (r.hourlyRate || 0),
      0,
    );
    const onboarding = ws.onboardingFee || 0;
    const support =
      ws.supportFlatOverride != null
        ? ws.supportFlatOverride
        : netProduct * ((ws.supportPct || 0) / 100);
    const training = (ws.trainingSessions || 0) * (ws.trainingCostPerSession || 0);
    const grandTotal = netProduct + servicesSubtotal + onboarding + support + training;
    // Effective discount vs list across the whole quote (only meaningful with a list price).
    const effectiveDiscountPct =
      ws.listPrice > 0 ? (1 - grandTotal / ws.listPrice) * 100 : null;
    return {
      netProduct,
      servicesSubtotal,
      onboarding,
      support,
      training,
      grandTotal,
      effectiveDiscountPct,
    };
  }, [ws]);

  return (
    <div className="space-y-6">
      {/* ============================ Commercial Worksheet ============================ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Commercial Worksheet
            </span>
            <span className="font-mono text-base tabular-nums">
              {formatCurrency(calc.grandTotal, currency)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 1. Product & discount */}
          <WorksheetSection
            title="Product & discount"
            description="List price less discount gives the net product price."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField
                label="List price"
                value={ws.listPrice}
                prefix="$"
                step={1000}
                onChange={(v) => patchWs({ listPrice: v })}
              />
              <NumberField
                label="Discount"
                value={ws.discountPct}
                suffix="%"
                step={1}
                onChange={(v) => patchWs({ discountPct: v })}
              />
            </div>
            <MoneyLine
              label="Net product price"
              value={calc.netProduct}
              currency={currency}
              emphasis
            />
          </WorksheetSection>

          {/* 2. Professional services (man-hours) */}
          <WorksheetSection
            title="Professional services"
            description="Man-hours per role × hourly rate."
          >
            <div className="hidden sm:grid grid-cols-[1fr_5rem_6rem_5.5rem_2rem] gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <span>Role</span>
              <span className="text-right">Hours</span>
              <span className="text-right">Rate / h</span>
              <span className="text-right">Subtotal</span>
              <span />
            </div>
            {ws.services.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[1fr_5rem_6rem_5.5rem_2rem] gap-2 items-center"
              >
                <Input
                  value={s.label}
                  placeholder="Role / task"
                  onChange={(e) => setService(s.id, { label: e.target.value })}
                />
                <Input
                  type="number"
                  min={0}
                  value={s.hours}
                  onChange={(e) => setService(s.id, { hours: Number(e.target.value) })}
                  className="font-mono text-right"
                />
                <Input
                  type="number"
                  min={0}
                  value={s.hourlyRate}
                  onChange={(e) => setService(s.id, { hourlyRate: Number(e.target.value) })}
                  className="font-mono text-right"
                />
                <span className="font-mono text-sm text-right tabular-nums">
                  {formatCurrency((s.hours || 0) * (s.hourlyRate || 0), currency)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeService(s.id)}
                  disabled={ws.services.length <= 1}
                  aria-label="Remove role"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 pt-1">
              <Button variant="outline" size="sm" onClick={addService}>
                <Plus className="h-4 w-4 mr-1" /> Add role
              </Button>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">Services subtotal</span>
                <span className="font-mono text-base font-semibold tabular-nums">
                  {formatCurrency(calc.servicesSubtotal, currency)}
                </span>
              </div>
            </div>
          </WorksheetSection>

          {/* 3. Onboarding fee */}
          <WorksheetSection
            title="Onboarding fee"
            description="Flat fee — match the Online / Onsite onboarding tier."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField
                label="Onboarding fee"
                value={ws.onboardingFee}
                prefix="$"
                step={500}
                onChange={(v) => patchWs({ onboardingFee: v })}
              />
              <div className="flex items-end">
                <MoneyLine
                  label="Onboarding"
                  value={calc.onboarding}
                  currency={currency}
                  emphasis
                />
              </div>
            </div>
          </WorksheetSection>

          {/* 4. Premium support */}
          <WorksheetSection
            title="Premium support"
            description="Percentage of net product price (flat override optional)."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField
                label="Support % of net product"
                value={ws.supportPct}
                suffix="%"
                step={1}
                onChange={(v) => patchWs({ supportPct: v })}
              />
              <NumberField
                label="Flat override (optional)"
                value={ws.supportFlatOverride ?? 0}
                prefix="$"
                step={500}
                onChange={(v) => patchWs({ supportFlatOverride: v > 0 ? v : null })}
              />
            </div>
            <MoneyLine
              label="Premium support"
              value={calc.support}
              currency={currency}
              emphasis
              hint={
                ws.supportFlatOverride != null
                  ? "(flat override)"
                  : `(${ws.supportPct || 0}% of net product)`
              }
            />
          </WorksheetSection>

          {/* 5. Training */}
          <WorksheetSection title="Training" description="Sessions × cost per session.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField
                label="Sessions"
                value={ws.trainingSessions}
                step={1}
                onChange={(v) => patchWs({ trainingSessions: v })}
              />
              <NumberField
                label="Cost per session"
                value={ws.trainingCostPerSession}
                prefix="$"
                step={100}
                onChange={(v) => patchWs({ trainingCostPerSession: v })}
              />
            </div>
            <MoneyLine
              label="Training"
              value={calc.training}
              currency={currency}
              emphasis
            />
          </WorksheetSection>

          {/* 6. Summary */}
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide">Summary</h4>
              {calc.effectiveDiscountPct != null ? (
                <Badge variant="secondary" className="font-mono">
                  Effective {calc.effectiveDiscountPct >= 0 ? "discount" : "uplift"}{" "}
                  {Math.abs(calc.effectiveDiscountPct).toFixed(1)}% vs list
                </Badge>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <MoneyLine label="Net product" value={calc.netProduct} currency={currency} />
              <MoneyLine
                label="Professional services"
                value={calc.servicesSubtotal}
                currency={currency}
              />
              <MoneyLine label="Onboarding" value={calc.onboarding} currency={currency} />
              <MoneyLine label="Premium support" value={calc.support} currency={currency} />
              <MoneyLine label="Training" value={calc.training} currency={currency} />
            </div>
            <div className="border-t pt-3 flex items-baseline justify-between">
              <span className="text-base font-bold">Grand total</span>
              <span className="font-mono text-2xl font-bold tabular-nums">
                {formatCurrency(calc.grandTotal, currency)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Worksheet — informational only; does not change the deal's stored TCV.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===================== Multi-Year Pricing Schedule (TCV) ===================== */}
      <Card>
        <Collapsible open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">Multi-Year Pricing Schedule</span>
                <Badge variant="outline" className="text-xs">
                  feeds TCV
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-base tabular-nums">
                  {formatCurrency(rows.length ? localTcv : ramp, currency)}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    scheduleOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-[3rem_1fr_1fr_4rem_2rem] gap-2 text-xs uppercase text-muted-foreground">
                <span>Year</span>
                <span>Product</span>
                <span>Services</span>
                <span>Disc%</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[3rem_1fr_1fr_4rem_2rem] gap-2 items-center"
                >
                  <span className="font-mono text-sm">Y{r.year_number}</span>
                  <Input
                    type="number"
                    value={r.product_revenue}
                    onChange={(e) => setRow(i, { product_revenue: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    value={r.services_revenue}
                    onChange={(e) => setRow(i, { services_revenue: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    value={r.discount_pct}
                    onChange={(e) => setRow(i, { discount_pct: Number(e.target.value) })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addYear}>
                  <Plus className="h-4 w-4 mr-1" /> Add year
                </Button>
                <Button size="sm" onClick={save} disabled={update.isPending}>
                  Save schedule
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
