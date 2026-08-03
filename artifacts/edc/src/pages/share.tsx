import { useGetSharedRiskCard } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ShieldAlert, Activity, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HEALTH_BADGE_CLASS, HEALTH_CLASS, HEALTH_LABEL, type Health } from "@/lib/semantic-colors";

/** Alert severity uses the health scale — RED/YELLOW are the same two states. */
const sevClass = (severity: string) =>
  severity === "RED" ? HEALTH_CLASS.RED : HEALTH_CLASS.YELLOW;

export default function Share() {
  const params = useParams();
  const token = params.token as string;
  const { data: response, isLoading, isError } = useGetSharedRiskCard(token);
  
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center p-4">Loading shared briefing...</div>;
  if (isError || !response?.data) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-destructive/10 border-destructive/20">
        <CardContent className="p-8 text-center text-destructive">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-sm opacity-80">This link has expired or is invalid.</p>
        </CardContent>
      </Card>
    </div>
  );

  const card = response.data;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex justify-center items-start">
      <Card className="w-full max-w-2xl border-border/50 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="bg-muted p-4 border-b flex justify-between items-center rounded-t-lg">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm tracking-widest text-primary">EDC BAT-SIGNAL</span>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">RESTRICTED DISTRIBUTION</Badge>
        </div>

        <CardHeader className="pb-4">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-bold mb-1">{card.dealName}</CardTitle>
              <p className="text-muted-foreground">{card.accountName}</p>
            </div>
            <Badge variant={card.healthStatus === 'RED' ? 'destructive' : card.healthStatus === 'YELLOW' ? 'default' : 'secondary'} className={`text-sm px-3 py-1 ${card.healthStatus === 'YELLOW' ? HEALTH_BADGE_CLASS.YELLOW : card.healthStatus === 'GREEN' ? HEALTH_BADGE_CLASS.GREEN : ''}`}>
              {HEALTH_LABEL[card.healthStatus as Health] ?? card.healthStatus}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-8">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Contract Value</p>
              <p className="text-xl font-bold font-mono">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: card.reportingCurrency, maximumFractionDigits: 0 }).format(card.normalizedTCV)}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Sales Stage</p>
              <p className="text-xl font-bold">{card.salesStage}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Risk Profile</h3>
            {card.alerts.length > 0 ? (
              <div className="space-y-3">
                {card.alerts.map((alert, i) => (
                  // Severity rides the health palette (its print counterpart in
                  // briefing-report.tsx carries the same two hexes by hand).
                  <div key={i} className={`p-4 rounded-md border-l-4 bg-card ${sevClass(alert.severity).borderL} ${sevClass(alert.severity).bg}`}>
                    <div className="flex gap-3">
                      {alert.severity === 'RED'
                        ? <ShieldAlert className={`w-5 h-5 shrink-0 ${HEALTH_CLASS.RED.text}`} />
                        : <AlertTriangle className={`w-5 h-5 shrink-0 ${HEALTH_CLASS.YELLOW.text}`} />}
                      <div>
                        <p className="font-semibold text-sm">{alert.message}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{alert.code}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // An all-clear is a health statement, not a risk tier: it matches the
              // briefing's own "No active risk patterns" line (screen and print),
              // which has always used the health-GREEN colour.
              <div className={`p-4 rounded-md border flex items-center gap-3 ${HEALTH_CLASS.GREEN.bg}`}>
                <CheckCircle className={`w-5 h-5 ${HEALTH_CLASS.GREEN.text}`} />
                <span className={`text-sm font-medium ${HEALTH_CLASS.GREEN.text}`}>No critical risk patterns detected.</span>
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Technical Validation</span>
              <span className="font-mono">{card.progressPercentage}%</span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${card.progressPercentage}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Current Milestone: <span className="font-medium text-foreground">{card.currentMilestone}</span></p>
          </div>

          {card.strategicAsk && (
            <div className="p-4 rounded-lg border-2 border-primary/20 bg-primary/5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Strategic Ask / Override</h3>
              <p className="text-sm leading-relaxed">{card.strategicAsk}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}