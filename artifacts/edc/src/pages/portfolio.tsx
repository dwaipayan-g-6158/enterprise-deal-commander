import { useGetPortfolioAnalysis, useGetProductMix } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";
import { PersonalityLine } from "@/components/personality-line";
import { ProductMixSection } from "@/components/cockpit/product-mix-section";
import { PortfolioSummaryCards } from "@/components/cockpit/portfolio-summary-cards";
import { PortfolioRiskHeatmap } from "@/components/cockpit/portfolio-risk-heatmap";
import { formatNum } from "@/lib/format";

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
  const { data: response, isLoading } = useGetPortfolioAnalysis();
  // ProductMixSection (rendered below) fires this same query on mount, which
  // serialises it behind portfolio-analysis and gives the loaded page a second
  // "Loading product mix…" flash plus a large reflow. Subscribing here starts
  // it in parallel from first paint; React Query dedupes by key, so the child
  // gets the settled entry for free.
  const { isLoading: isLoadingMix } = useGetProductMix();
  const data = response?.data;

  if (isLoading || isLoadingMix) return <PortfolioSkeleton />;
  if (!data)
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-300">
        No portfolio analysis to show yet.
      </div>
    );

  const renderCorrelations = (correlations: any[]) => {
    if (!correlations || correlations.length === 0) return <span className="text-muted-foreground text-xs">Nothing stands out</span>;
    return (
      <div className="flex flex-wrap gap-2">
        {correlations.map(corr => (
          <Badge key={corr.code} variant="outline" className="text-xs bg-muted/50 flex gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span className="font-mono">{corr.code}</span>
            <span className="text-muted-foreground">({formatNum(corr.share * 100)}%, {corr.lift > 0 ? '+' : ''}{formatNum(corr.lift)}x)</span>
          </Badge>
        ))}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Portfolio Risk Analysis</h1>
        <p className="text-muted-foreground mt-2">Correlation of risk patterns across team members and products</p>
      </div>

      {data.summary && <PortfolioSummaryCards summary={data.summary} />}

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
                  <TableHead>Avg Cycle</TableHead>
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
                  <TableHead>Avg Cycle</TableHead>
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
                  <TableHead>Stalled Share</TableHead>
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