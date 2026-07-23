import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArchetypeBreakdown } from "@/components/autopsy/archetype-breakdown";
import { LossDashboardPanel } from "@/components/autopsy/loss-dashboard-panel";
import { CompetitiveLossPanel } from "@/components/autopsy/competitive-loss-panel";
import { LossRiskPanel } from "@/components/autopsy/loss-risk-panel";
import { ProductGapsPanel } from "@/components/autopsy/product-gaps-panel";
import { PersonalityLine } from "@/components/personality-line";

export default function Autopsy() {
  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Closed-Lost Autopsy</h1>
        <p className="text-muted-foreground mt-2">Learn from loss: post-mortem analysis and pattern recognition</p>
        <PersonalityLine className="text-xs text-muted-foreground italic mt-1" />
      </div>

      <Tabs defaultValue="loss-intelligence">
        <TabsList>
          <TabsTrigger value="loss-intelligence">Loss Intelligence</TabsTrigger>
          <TabsTrigger value="early-warning">Early Warning</TabsTrigger>
          <TabsTrigger value="competitive">Competitive</TabsTrigger>
          <TabsTrigger value="archetypes">Archetypes</TabsTrigger>
          <TabsTrigger value="product-gaps">Product Gaps</TabsTrigger>
        </TabsList>
        <TabsContent value="loss-intelligence" className="pt-6">
          <LossDashboardPanel />
        </TabsContent>
        <TabsContent value="early-warning" className="pt-6">
          <LossRiskPanel />
        </TabsContent>
        <TabsContent value="competitive" className="pt-6">
          <CompetitiveLossPanel />
        </TabsContent>
        <TabsContent value="archetypes" className="pt-6">
          <ArchetypeBreakdown />
        </TabsContent>
        <TabsContent value="product-gaps" className="pt-6">
          <ProductGapsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
