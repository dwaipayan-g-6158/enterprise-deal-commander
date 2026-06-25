import { useGetIntelligenceSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, TrendingUp, Clock, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { data: summaryWrapper, isLoading } = useGetIntelligenceSummary();
  const [, navigate] = useLocation();

  const summary = summaryWrapper?.data;

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-[200px]" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Portfolio Command Center</h1>
          <p className="text-muted-foreground mt-2">Continuous intelligence and risk monitoring</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate("/portfolio")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/portfolio"); } }}
          className="bg-card border-border shadow-sm cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total TCV</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: summary?.reportingCurrency || 'USD', maximumFractionDigits: 0 }).format(summary?.totalTCV || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across {summary?.totalDealsMonitored || 0} active deals</p>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate("/deals")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/deals"); } }}
          className="bg-card border-border shadow-sm cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Critical Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive font-mono">{summary?.criticalAlerts?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Requiring immediate disposition</p>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate("/deals")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/deals"); } }}
          className="bg-card border-border shadow-sm cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Stale Deals</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500 font-mono">{summary?.staleDeals?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Velocity warnings active</p>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate("/portfolio")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/portfolio"); } }}
          className="bg-card border-border shadow-sm cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Health Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mt-2">
               <div className="flex flex-col items-center">
                 <span className="text-xl font-bold text-emerald-500 font-mono">{summary?.dealsByHealth?.GREEN || 0}</span>
                 <span className="text-[10px] text-muted-foreground uppercase">Green</span>
               </div>
               <div className="flex flex-col items-center">
                 <span className="text-xl font-bold text-amber-500 font-mono">{summary?.dealsByHealth?.YELLOW || 0}</span>
                 <span className="text-[10px] text-muted-foreground uppercase">Yellow</span>
               </div>
               <div className="flex flex-col items-center">
                 <span className="text-xl font-bold text-red-500 font-mono">{summary?.dealsByHealth?.RED || 0}</span>
                 <span className="text-[10px] text-muted-foreground uppercase">Red</span>
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Action Required
            </CardTitle>
          </CardHeader>
          <CardContent>
             {summary?.criticalAlerts && summary.criticalAlerts.length > 0 ? (
               <div className="space-y-4">
                 {summary.criticalAlerts.slice(0, 5).map((alert) => (
                   <button
                     key={alert.dealId}
                     type="button"
                     onClick={() => alert.dealId && navigate(`/deals/${alert.dealId}`)}
                     aria-label={`View deal: ${alert.dealName}`}
                     className="w-full text-left flex justify-between items-start p-3 bg-card border border-border rounded-md cursor-pointer transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                   >
                     <div>
                       <p className="font-medium text-sm">{alert.dealName}</p>
                       <p className="text-xs text-muted-foreground mt-1">{alert.alert.message}</p>
                     </div>
                   </button>
                 ))}
               </div>
             ) : (
               <p className="text-muted-foreground text-sm">No critical alerts currently active.</p>
             )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {summary?.changesSinceLastReview && summary.changesSinceLastReview.dealsWithChanges > 0 ? (
              <div className="space-y-4">
                <p className="text-sm">{summary.changesSinceLastReview.dealsWithChanges} deals changed since last review.</p>
                {summary.changesSinceLastReview.topMovers.map(mover => (
                  <div key={mover.dealId} className="flex justify-between text-sm py-2 border-b last:border-0">
                    <span>{mover.dealName}</span>
                    <span className="font-mono text-muted-foreground">{mover.changeCount} changes</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Portfolio Health</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const g = summary?.dealsByHealth?.GREEN ?? 0;
            const y = summary?.dealsByHealth?.YELLOW ?? 0;
            const r = summary?.dealsByHealth?.RED ?? 0;
            const total = g + y + r || 1;
            return (
              <div className="space-y-2">
                <div
                  className="flex h-3 w-full overflow-hidden rounded-full"
                  role="img"
                  aria-label={`${g} green, ${y} yellow, ${r} red deals`}
                >
                  <div className="bg-emerald-500" style={{ width: `${(g / total) * 100}%` }} />
                  <div className="bg-amber-500" style={{ width: `${(y / total) * 100}%` }} />
                  <div className="bg-red-500" style={{ width: `${(r / total) * 100}%` }} />
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{g} Green</span><span>{y} Yellow</span><span>{r} Red</span>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}