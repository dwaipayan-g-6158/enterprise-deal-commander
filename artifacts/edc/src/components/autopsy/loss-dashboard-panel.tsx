import { useGetLossDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";

interface TopPattern {
  code: string;
  share: number;
}

interface CategoryComposition {
  category: string;
  count: number;
  value: number;
}

interface LossDashboardData {
  lossPulse: number | null;
  lossPulseComponents: {
    autopsyCompletenessPct: number;
    avgQualityScore: number | null;
    lossRatePct: number | null;
  };
  volume: { lossCount: number; lossValue: number };
  compositionByCategory: CategoryComposition[];
  topPatterns: TopPattern[];
}

function compactUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function pulseColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  if (score >= 40) return "text-orange-500";
  return "text-destructive";
}

const CATEGORY_LABELS: Record<string, string> = {
  price: "Price / Commercial",
  product: "Product / Technical",
  competitive: "Competitive",
  timing: "Timing",
  relationship: "Relationship",
  process: "Process / Execution",
  uncategorized: "Uncategorized (no autopsy)",
};

export function LossDashboardPanel() {
  const { data: response, isLoading } = useGetLossDashboard();
  const data = response?.data as LossDashboardData | undefined;

  if (isLoading || !data) {
    return <div className="p-8 text-center text-muted-foreground">Computing loss intelligence...</div>;
  }

  const maxCategoryValue = Math.max(1, ...data.compositionByCategory.map((c) => c.value));

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Loss Pulse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-4xl font-bold font-mono tabular-nums ${pulseColor(data.lossPulse)}`}>
              {data.lossPulse ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Autopsy completeness {data.lossPulseComponents.autopsyCompletenessPct}%
              {data.lossPulseComponents.avgQualityScore != null && ` · Avg quality ${data.lossPulseComponents.avgQualityScore}`}
              {data.lossPulseComponents.lossRatePct != null && ` · Loss rate ${data.lossPulseComponents.lossRatePct}%`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Loss Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold font-mono tabular-nums">{data.volume.lossCount}</p>
            <p className="text-xs text-muted-foreground mt-2">Total deals closed lost</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Loss Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold font-mono tabular-nums">{compactUSD(data.volume.lossValue)}</p>
            <p className="text-xs text-muted-foreground mt-2">Total ACV lost</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Loss Composition by Category</CardTitle>
          <p className="text-sm text-muted-foreground">
            Requires a completed autopsy to categorize — "Uncategorized" means the loss hasn't been analyzed yet.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.compositionByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No losses recorded yet. That's a healthy pipeline.</p>
          ) : (
            data.compositionByCategory.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{CATEGORY_LABELS[c.category] ?? c.category}</span>
                  <span className="font-mono text-muted-foreground">
                    {c.count} · {compactUSD(c.value)}
                  </span>
                </div>
                <Progress value={(c.value / maxCategoryValue) * 100} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Top Loss Patterns
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.topPatterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No risk patterns fired on any closed-lost deal.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pattern Code</TableHead>
                  <TableHead className="w-[200px]">Frequency in Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topPatterns.map((p) => (
                  <TableRow key={p.code}>
                    <TableCell className="font-mono text-sm font-medium">{p.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={p.share * 100} className="h-2 w-24" />
                        <span className="font-mono text-xs text-muted-foreground">{(p.share * 100).toFixed(0)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
