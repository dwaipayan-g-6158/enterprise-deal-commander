import { useGetSharedRiskCard } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ShieldAlert, Activity, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
            <Badge variant={card.healthStatus === 'RED' ? 'destructive' : card.healthStatus === 'YELLOW' ? 'default' : 'secondary'} className={`text-sm px-3 py-1 ${card.healthStatus === 'YELLOW' ? 'bg-amber-500 text-white' : card.healthStatus === 'GREEN' ? 'bg-emerald-500 text-white' : ''}`}>
              {card.healthStatus}
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
                  <div key={i} className={`p-4 rounded-md border-l-4 bg-card ${alert.severity === 'RED' ? 'border-l-destructive bg-destructive/5' : 'border-l-amber-500 bg-amber-500/5'}`}>
                    <div className="flex gap-3">
                      {alert.severity === 'RED' ? <ShieldAlert className="w-5 h-5 text-destructive shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
                      <div>
                        <p className="font-semibold text-sm">{alert.message}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{alert.code}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-md border bg-emerald-500/5 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-600">No critical risk patterns detected.</span>
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