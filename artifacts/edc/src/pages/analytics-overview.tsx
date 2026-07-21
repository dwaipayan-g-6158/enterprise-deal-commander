import {
  useGetVelocityAnalytics,
  useGetPipelineSimulation,
  useGetWinLossAnalytics,
  useGetCompetitiveAnalytics,
  useGetPipelineAnalytics,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, TrendingUp, Swords, Gauge } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { ForecastFan } from "@/components/cockpit/charts/forecast-fan";
import { WinLossDonut } from "@/components/cockpit/charts/winloss-donut";
import { useLocation } from "wouter";
import { VelocityTriageTable } from "@/components/cockpit/velocity-triage";
import { money } from "@/lib/format";

interface VelocityDeal {
  id: string;
  dealName: string;
  accountName: string;
  stage: string;
  daysInStage: number;
  benchmarkDays: number;
  deltaDays: number;
  velocity: string;
}
interface CompetitorRow {
  name: string;
  encounters: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
}

export function AnalyticsOverview() {
  const velocity = useGetVelocityAnalytics();
  const sim = useGetPipelineSimulation();
  const winLoss = useGetWinLossAnalytics();
  const competitive = useGetCompetitiveAnalytics();
  const pipeline = useGetPipelineAnalytics();
  const [, navigate] = useLocation();

  const vDeals = ((velocity.data?.data as { deals?: VelocityDeal[] })?.deals ?? []) as VelocityDeal[];
  const simData = sim.data?.data as
    | { percentiles: Record<string, number>; weightedPipeline: number; mean: number }
    | undefined;
  const wl = winLoss.data?.data as
    | { won: number; lost: number; winRatePct: number | null; byTcvRange: { range: string; total: number; wins: number; winRatePct: number | null }[] }
    | undefined;
  const comps = ((competitive.data?.data as { competitors?: CompetitorRow[] })?.competitors ?? []) as CompetitorRow[];
  const pipe = pipeline.data?.data as { totalTcv: number; activeDeals: number } | undefined;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pipeline Analytics</h1>
          <p className="text-muted-foreground">
            {pipe ? `${money(pipe.totalTcv)} across ${pipe.activeDeals} active deals` : "Crunching the pipeline…"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/api/v2/reports/pipeline" target="_blank" rel="noreferrer">
              <FileText className="h-4 w-4 mr-2" /> Board Report
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/api/v2/export/deals?format=csv">
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-6">
        {/* Monte Carlo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Probabilistic Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            {simData ? (
              <div className="space-y-3">
                <ForecastFan
                  forecast={{
                    p10: simData.percentiles["p10"],
                    p25: simData.percentiles["p25"],
                    p50: simData.percentiles["p50"],
                    p75: simData.percentiles["p75"],
                    p90: simData.percentiles["p90"],
                  }}
                />
                <div className="grid grid-cols-5 gap-2 text-center">
                  {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => (
                    <div key={p} className="rounded-md border p-2">
                      <p className="text-xs uppercase text-muted-foreground">{p}</p>
                      <p className="font-mono text-sm font-semibold">{money(simData.percentiles[p])}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Weighted pipeline (traditional): <span className="font-mono">{money(simData.weightedPipeline)}</span>.
                  Use <b>P50</b> ({money(simData.percentiles.p50)}) for planning, <b>P25</b> for conservative budgeting.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Computing simulation…</p>
            )}
          </CardContent>
        </Card>

        {/* Win/Loss */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Win / Loss</CardTitle>
          </CardHeader>
          <CardContent>
            {wl && wl.won + wl.lost > 0 ? (
              <div className="space-y-3">
                <WinLossDonut won={wl.won} lost={wl.lost} />
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold">{wl.winRatePct}%</span>
                  <span className="text-sm text-muted-foreground">{wl.won} won · {wl.lost} lost</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {wl.byTcvRange.map((r) => (
                      <tr key={r.range} className="border-t">
                        <td className="py-1">{r.range}</td>
                        <td className="py-1 text-right text-muted-foreground">{r.total} deals</td>
                        <td className="py-1 text-right font-mono">{r.winRatePct == null ? "—" : `${r.winRatePct}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><TrendingUp className="h-5 w-5" /></EmptyMedia>
                  <EmptyTitle>No closed deals yet</EmptyTitle>
                  <EmptyDescription>Win/loss populates automatically as deals reach Closed-Won or Closed-Lost.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Velocity triage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Velocity — Most Overdue First</CardTitle>
        </CardHeader>
        <CardContent>
          {vDeals.length > 0 ? (
            <VelocityTriageTable
              deals={vDeals}
              onSelect={(dealId) => navigate(`/deals/${dealId}`)}
            />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Gauge className="h-5 w-5" /></EmptyMedia>
                <EmptyTitle>No active deals to track</EmptyTitle>
                <EmptyDescription>
                  Velocity ranks open deals by how far past their stage benchmark they've run.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      {/* Competitive */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Competitive Win Rates</CardTitle>
        </CardHeader>
        <CardContent>
          {comps.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Swords className="h-5 w-5" /></EmptyMedia>
                <EmptyTitle>No competitor encounters yet</EmptyTitle>
                <EmptyDescription>Log competitors on a deal's Competitive tab to see win rates here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-muted-foreground border-b">
                  <th className="text-left py-2">Competitor</th>
                  <th className="text-right py-2">Encounters</th>
                  <th className="text-right py-2">Wins</th>
                  <th className="text-right py-2">Losses</th>
                  <th className="text-right py-2">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {comps.map((c) => (
                  <tr key={c.name} className="border-b">
                    <td className="py-2">{c.name}</td>
                    <td className="py-2 text-right font-mono">{c.encounters}</td>
                    <td className="py-2 text-right font-mono">{c.wins}</td>
                    <td className="py-2 text-right font-mono">{c.losses}</td>
                    <td className="py-2 text-right font-mono">{c.winRatePct == null ? "—" : `${c.winRatePct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
