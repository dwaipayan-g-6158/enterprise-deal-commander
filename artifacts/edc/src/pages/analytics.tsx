import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsOverview } from "./analytics-overview";
import { FlowAnalytics } from "@/components/cockpit/flow/flow-analytics";
import { PersonalityLine } from "@/components/personality-line";

export default function Analytics() {
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <PersonalityLine className="text-xs text-muted-foreground italic mb-4" />
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="flow">Flow</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <AnalyticsOverview />
        </TabsContent>
        <TabsContent value="flow" className="pt-4">
          <FlowAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
