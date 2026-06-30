import { useGetPortfolioAnalysis } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { ProductMixSection } from "@/components/cockpit/product-mix-section";
import { PortfolioSummaryCards } from "@/components/cockpit/portfolio-summary-cards";
import { PortfolioRiskHeatmap } from "@/components/cockpit/portfolio-risk-heatmap";

export default function Portfolio() {
  const { data: response, isLoading } = useGetPortfolioAnalysis();
  const data = response?.data;

  if (isLoading) return <div className="p-8">Loading analysis...</div>;
  if (!data) return <div className="p-8">No analysis available.</div>;

  const renderCorrelations = (correlations: any[]) => {
    if (!correlations || correlations.length === 0) return <span className="text-muted-foreground text-xs">No significant correlations</span>;
    return (
      <div className="flex flex-wrap gap-2">
        {correlations.map(corr => (
          <Badge key={corr.code} variant="outline" className="text-xs bg-muted/50 flex gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            <span className="font-mono">{corr.code}</span>
            <span className="text-muted-foreground">({(corr.share * 100).toFixed(0)}%, {corr.lift > 0 ? '+' : ''}{corr.lift.toFixed(1)}x)</span>
          </Badge>
        ))}
      </div>
    );
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                    <TableCell>{row.avgCycleTimeDays} days</TableCell>
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
                    <TableCell>{row.avgCycleTimeDays} days</TableCell>
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
                    <TableCell>{(row.presentInStalledShare * 100).toFixed(0)}%</TableCell>
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