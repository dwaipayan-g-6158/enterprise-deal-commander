import { useGetPortfolioAnalysis, useGetProductMix } from "@workspace/api-client-react";
import type { AlertCorrelation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { PersonalityLine } from "@/components/personality-line";
import { ProductMixSection } from "@/components/cockpit/product-mix-section";
import { PortfolioSummaryCards } from "@/components/cockpit/portfolio-summary-cards";
import { PortfolioRiskHeatmap } from "@/components/cockpit/portfolio-risk-heatmap";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatNum } from "@/lib/format";
import { liftPresentation, splitCorrelations } from "@/components/cockpit/portfolio-presentation";

// Geometry-matched loading state. Every height below is derived from the real
// page's own primitives (Card + CardContent p-4 space-y-1, text-3xl, etc.) so
// the swap to real content causes no reflow. The heatmap card's real height is
// data-dependent (187 + 44 * rows); this is tuned for the common 4-row case.
function PortfolioSkeleton() {
  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8" aria-busy="true">
      <span role="status" className="sr-only">Loading portfolio analysis…</span>

      {/* h-9 + mt-2 + h-6 mirrors the real h1 + subtitle block exactly. The h-6
          box is load-bearing: PersonalityLine renders null under Focus Mode,
          and without a reserved slot the header would be 24px shorter then. */}
      <div>
        <Skeleton className="h-9 w-72" />
        <div className="mt-2 h-6">
          <PersonalityLine className="text-base italic leading-6 text-muted-foreground" />
        </div>
      </div>

      {/* Grid classes copied verbatim from portfolio-summary-cards.tsx — the
          sm:/@4xl: mix is intentional there; don't "fix" it here or the
          skeleton and real grid disagree in the 640-950px band. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 @4xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-[30px] w-20" />
              <Skeleton className="h-4 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
          <div className="space-y-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-[34rem] max-w-full" />
          </div>
          <Skeleton className="h-[30px] w-[11.5rem] shrink-0 rounded-md" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-5 w-full" />
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <Skeleton className="h-[29px] w-full" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[320px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function Portfolio() {
  const { data: response, isLoading, isError, refetch } = useGetPortfolioAnalysis();
  // ProductMixSection (rendered below) fires this same query on mount, which
  // serialises it behind portfolio-analysis and gives the loaded page a second
  // "Loading product mix…" flash plus a large reflow. Subscribing here starts
  // it in parallel from first paint; React Query dedupes by key, so the child
  // gets the settled entry for free.
  // Only isLoading is taken from the mix query — its own isError is
  // deliberately NOT checked here. portfolioAnalysis is this page's spine
  // (summary cards, heatmap, all three correlation tables); productMix is a
  // DIFFERENT endpoint feeding only 2 of 7 cards, and ProductMixSection owns
  // its own error/retry state (see Part 2) so a mix failure degrades just
  // that section instead of blanking a page whose other 5 cards loaded fine.
  // If a future edit adds an `isErrorMix` check here, it re-introduces this
  // exact bug — don't.
  const { isLoading: isLoadingMix } = useGetProductMix();
  const data = response?.data;

  // Checked BEFORE the loading gate — deliberately the opposite order from
  // deals.tsx's isLoading-then-isError chain, because isLoadingMix belongs to
  // the OTHER query here: loading-first would hold the skeleton hostage on a
  // definitively failed portfolio-analysis fetch until the mix query happened
  // to also settle, instead of surfacing the error immediately.
  if (isError)
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-300">
        <Card className="py-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Couldn't load the portfolio analysis. Give it another try.
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  if (isLoading || isLoadingMix) return <PortfolioSkeleton />;
  if (!data)
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-300">
        No portfolio analysis to show yet.
      </div>
    );

  // Two historical bugs here: `any[]` typing (no compile-time safety against
  // drift from the generated AlertCorrelation shape), and unbounded badge
  // rendering (a group carrying many alert codes blows out the table cell) —
  // plus `corr.lift > 0 ? '+' : ''`, which is wrong because lift's baseline is
  // 1, not 0: an under-represented 0.5x lift still got a misleading "+". Both
  // are fixed by delegating to the shared portfolio-presentation helpers so
  // this table and the summary cards' cluster subtitle never disagree again.
  const renderCorrelations = (correlations: AlertCorrelation[]) => {
    if (!correlations || correlations.length === 0) return <span className="text-muted-foreground text-xs">Nothing stands out</span>;
    const { shown, hiddenCount, hiddenCodes } = splitCorrelations(correlations);
    return (
      <div className="flex flex-wrap gap-2">
        {shown.map((corr) => {
          const lift = liftPresentation(corr.lift);
          return (
            <Badge key={corr.code} variant="outline" className="text-xs bg-muted/50 flex gap-1">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span className="font-mono">{corr.code}</span>
              <span className="text-muted-foreground" title={lift.label}>
                ({formatNum(corr.share * 100)}%, {lift.text})
              </span>
            </Badge>
          );
        })}
        {hiddenCount > 0 && (
          <Badge
            variant="outline"
            className="text-xs font-mono text-muted-foreground"
            title={hiddenCodes.join(", ")}
          >
            +{hiddenCount}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Portfolio Risk Analysis</h1>
        <p className="text-muted-foreground mt-2">Correlation of risk patterns across team members and products</p>
      </div>

      {data.summary && (
        <PortfolioSummaryCards
          summary={data.summary}
          diversificationCellCount={data.riskMatrix?.byAccountManager.length ?? 0}
        />
      )}

      {data.riskMatrix && (
        <PortfolioRiskHeatmap
          matrix={data.riskMatrix}
          currency={data.summary?.reportingCurrency}
        />
      )}

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-8">
        <ProductMixSection />

        <Card>
          <CardHeader>
            <CardTitle>By Account Manager</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manager</TableHead>
                  <TableHead>Deals</TableHead>
                  {/* "Avg Cycle" was misleading: avgCycleTimeDays sums daysInStage
                      (time in the CURRENT pipeline stage), not end-to-end deal
                      cycle time. Relabelled to match what the field actually
                      measures — the cell rendering below is unchanged. */}
                  <TableHead>Avg Days in Stage</TableHead>
                  <TableHead>Risk Correlations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byAccountManager.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.accountManager}</TableCell>
                    <TableCell>{row.dealCount}</TableCell>
                    <TableCell>{formatNum(row.avgCycleTimeDays)} days</TableCell>
                    <TableCell>{renderCorrelations(row.alertCorrelations)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By Technical Lead</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Deals</TableHead>
                  <TableHead>Avg Days in Stage</TableHead>
                  <TableHead>Risk Correlations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byTechnicalLead.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.technicalLead}</TableCell>
                    <TableCell>{row.dealCount}</TableCell>
                    <TableCell>{formatNum(row.avgCycleTimeDays)} days</TableCell>
                    <TableCell>{renderCorrelations(row.alertCorrelations)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {/* The server filters "Unassigned" out of byTechnicalLead and computes
                noTechnicalLeadCycleTimeDays precisely so this footnote can exist — without
                it those deals vanish from this table with no trace, while the Risk
                Heatmap's Tech Lead axis still lists them under "Unassigned", so the two
                surfaces would otherwise contradict each other. null (not 0) means there
                are no unassigned deals → render nothing. Says "days in stage", not "cycle
                time", for the same reason the column header above was relabelled — same
                underlying field, same misnomer. */}
            {data.noTechnicalLeadCycleTimeDays != null && (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Deals with no technical lead assigned are excluded from this table. They
                average {formatNum(data.noTechnicalLeadCycleTimeDays)} days in stage, and
                do appear on the Risk Heatmap's Tech Lead axis under "Unassigned".
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>By Product</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Deals</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Share of Stalled Deals
                      <InfoTooltip>
                        The share of <em>all</em> stalled deals portfolio-wide that this product appears in — not
                        the share of this product's own deals that are stalled. A deal counts toward every
                        product it involves, so one stalled three-product deal makes all three products read 100%,
                        and the column can total well over 100%.
                      </InfoTooltip>
                    </span>
                  </TableHead>
                  <TableHead>Risk Correlations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byProduct.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell>{row.dealCount}</TableCell>
                    <TableCell>{formatNum(row.presentInStalledShare * 100)}%</TableCell>
                    <TableCell>{renderCorrelations(row.alertCorrelations)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}