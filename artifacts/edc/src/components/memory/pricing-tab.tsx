import { useState } from "react";
import { useGetPricingBenchmarks, useGetMemoryFacets, useGetPlaybookEffectiveness } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/lib/format";

interface Percentiles { p25: number; median: number; p75: number; p90: number }
interface PricingBenchmarks { sampleSize: number; tcv: Percentiles; cycleDays: Percentiles }
interface FacetsPayload { pricingModels: { value: string; count: number }[]; servicesTiers: { value: string; count: number }[] }
interface PlaybookEffectiveness {
  withPlaybookCount: number;
  withoutPlaybookCount: number;
  withPlaybookWinRatePct: number | null;
  withoutPlaybookWinRatePct: number | null;
}

function PercentileRow({ label, p, format }: { label: string; p: Percentiles; format: (n: number) => string }) {
  return (
    <div className="grid grid-cols-5 gap-2 text-sm py-2 border-b last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-right">{format(p.p25)}</span>
      <span className="font-mono text-right font-medium">{format(p.median)}</span>
      <span className="font-mono text-right">{format(p.p75)}</span>
      <span className="font-mono text-right">{format(p.p90)}</span>
    </div>
  );
}

export function PricingTab() {
  const [pricingModel, setPricingModel] = useState("all");
  const [servicesTier, setServicesTier] = useState("all");
  const [outcome, setOutcome] = useState("Won");

  const facetsQuery = useGetMemoryFacets();
  const facets = facetsQuery.data?.data as FacetsPayload | undefined;

  const params: Record<string, string> = { outcome };
  if (pricingModel !== "all") params.pricingModel = pricingModel;
  if (servicesTier !== "all") params.servicesTier = servicesTier;
  const { data } = useGetPricingBenchmarks(params as never);
  const bench = data?.data as PricingBenchmarks | undefined;

  const { data: effData } = useGetPlaybookEffectiveness();
  const eff = effData?.data as PlaybookEffectiveness | undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-lg">Pricing Benchmark</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Won">Won</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pricingModel} onValueChange={setPricingModel}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Any pricing model" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any pricing model</SelectItem>
                {(facets?.pricingModels ?? []).map((p) => <SelectItem key={p.value} value={p.value}>{p.value}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={servicesTier} onValueChange={setServicesTier}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Any services tier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any services tier</SelectItem>
                {(facets?.servicesTiers ?? []).map((s) => <SelectItem key={s.value} value={s.value}>{s.value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!bench || bench.sampleSize === 0 ? (
            <p className="text-sm text-muted-foreground">No archived deals match these filters.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Sample size: {bench.sampleSize} archived deal{bench.sampleSize === 1 ? "" : "s"}</p>
              <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b">
                <span></span><span className="text-right">P25</span><span className="text-right">Median</span><span className="text-right">P75</span><span className="text-right">P90</span>
              </div>
              <PercentileRow label="Total Contract Value" p={bench.tcv} format={money} />
              <PercentileRow label="Cycle Time (days)" p={bench.cycleDays} format={(n) => String(n)} />
            </>
          )}
        </CardContent>
      </Card>

      {eff && (eff.withPlaybookCount > 0 || eff.withoutPlaybookCount > 0) && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Playbook Effectiveness</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">With a playbook ({eff.withPlaybookCount} deals)</p>
              <p className="text-2xl font-bold font-mono">{eff.withPlaybookWinRatePct ?? "—"}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">Without a playbook ({eff.withoutPlaybookCount} deals)</p>
              <p className="text-2xl font-bold font-mono">{eff.withoutPlaybookWinRatePct ?? "—"}%</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
