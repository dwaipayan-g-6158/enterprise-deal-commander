import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { AnalyticsOverview } from "./analytics-overview";
import { FlowAnalytics } from "@/components/cockpit/flow/flow-analytics";
import { PersonalityLine } from "@/components/personality-line";
import { useGetPipelineAnalytics } from "@workspace/api-client-react";
import { money } from "@/lib/format";

export default function Analytics() {
  const pipeline = useGetPipelineAnalytics();
  const pipe = pipeline.data?.data as { totalTcv: number; activeDeals: number } | undefined;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline Analytics</h1>
          <p className="text-muted-foreground mt-2">
            {pipe ? `${money(pipe.totalTcv)} across ${pipe.activeDeals} active deals` : "Crunching the pipeline…"}
          </p>
          <PersonalityLine className="text-xs text-muted-foreground italic mt-1" />
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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="flow">Flow</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-6">
          <AnalyticsOverview />
        </TabsContent>
        <TabsContent value="flow" className="pt-6">
          <FlowAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
