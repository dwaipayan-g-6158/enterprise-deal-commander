import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetPricingSchedule, useUpdatePricingSchedule } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { Plus, Trash2 } from "lucide-react";

interface Row {
  year_number: number;
  product_revenue: number;
  services_revenue: number;
  discount_pct: number;
}

export function PricingPanel({ dealId, currency }: { dealId: string; currency: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useGetPricingSchedule(dealId);
  const update = useUpdatePricingSchedule();
  const [rows, setRows] = useState<Row[]>([]);

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
      toast({ title: "Pricing schedule saved", description: `Ramp TCV ${formatCurrency(localTcv, currency)}` });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Multi-Year Pricing</span>
          <span className="font-mono text-base">{formatCurrency(rows.length ? localTcv : ramp, currency)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[3rem_1fr_1fr_4rem_2rem] gap-2 text-xs uppercase text-muted-foreground">
          <span>Year</span><span>Product</span><span>Services</span><span>Disc%</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[3rem_1fr_1fr_4rem_2rem] gap-2 items-center">
            <span className="font-mono text-sm">Y{r.year_number}</span>
            <Input type="number" value={r.product_revenue} onChange={(e) => setRow(i, { product_revenue: Number(e.target.value) })} />
            <Input type="number" value={r.services_revenue} onChange={(e) => setRow(i, { services_revenue: Number(e.target.value) })} />
            <Input type="number" value={r.discount_pct} onChange={(e) => setRow(i, { discount_pct: Number(e.target.value) })} />
            <Button variant="ghost" size="icon" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
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
    </Card>
  );
}
