import { useState } from "react";
import { useGetDeal, useGetDealIntelligence } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ShieldAlert,
  ShieldX,
  Layers,
  ClipboardList,
  Pencil,
  Radio,
  Presentation,
} from "lucide-react";
import { EditDealSheet } from "@/components/cockpit/edit-deal-sheet";
import { BatSignalDialog } from "@/components/cockpit/bat-signal-dialog";
import { RiskGovernance } from "@/components/cockpit/risk-governance";
import { TechnicalGates } from "@/components/cockpit/technical-gates";
import { BlockersPanel } from "@/components/cockpit/blockers-panel";
import { CrossSellPanel } from "@/components/cockpit/cross-sell-panel";
import { ActivityFeed } from "@/components/cockpit/activity-feed";
import { BriefingMode } from "@/components/cockpit/briefing-mode";
import { formatCurrency } from "@/components/cockpit/use-invalidate";

export default function DealCockpit() {
  const params = useParams();
  const id = params.id as string;

  const { data: dealResponse, isLoading: isLoadingDeal } = useGetDeal(id);
  const { data: intelligenceResponse, isLoading: isLoadingIntel } = useGetDealIntelligence(id);

  const [editOpen, setEditOpen] = useState(false);
  const [batOpen, setBatOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);

  const deal = dealResponse?.data;
  const intel = intelligenceResponse?.data;

  if (isLoadingDeal || isLoadingIntel) return <div className="p-8">Loading cockpit...</div>;
  if (!deal || !intel) return <div className="p-8 text-destructive">Deal not found</div>;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{deal.dealName}</h1>
            <Badge
              variant={
                deal.healthStatus === "RED" ? "destructive" : deal.healthStatus === "YELLOW" ? "default" : "secondary"
              }
              className={
                deal.healthStatus === "YELLOW"
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : deal.healthStatus === "GREEN"
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                  : ""
              }
            >
              {deal.healthStatus}
            </Badge>
          </div>
          <p className="text-muted-foreground text-lg">{deal.accountName}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Contract Value</p>
            <p className="text-3xl font-bold font-mono">
              {formatCurrency(deal.calculatedTCV, deal.dealCurrency)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBatOpen(true)}>
              <Radio className="h-4 w-4 mr-2" /> Bat-Signal
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setBriefingOpen(true)}>
              <Presentation className="h-4 w-4 mr-2" /> Briefing
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Financials & Team */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Deal Economics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Product Revenue</span>
                <span className="font-mono">{formatCurrency(intel.financials.productRevenue, deal.dealCurrency)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Services Revenue</span>
                <span className="font-mono">{formatCurrency(intel.financials.servicesRevenue, deal.dealCurrency)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Normalized TCV</span>
                <span className="font-mono">
                  {formatCurrency(intel.financials.normalizedTCV, intel.financials.reportingCurrency)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Pricing Model</span>
                <span>{intel.financials.pricingModel}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground text-sm">Term</span>
                <span>{intel.financials.termYears} Years</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Team</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Account Manager</span>
                <span>{intel.team.accountManager}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Technical Lead</span>
                <span>{intel.team.technicalLead}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Sales Stage</span>
                <span>{intel.salesStage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Days in Stage</span>
                <span className="font-mono">{intel.daysInStage}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center & Right Columns */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="risk" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-12 bg-transparent p-0 flex-wrap">
              <TabsTrigger
                value="risk"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
              >
                <ShieldAlert className="w-4 h-4 mr-2" />
                Risk
              </TabsTrigger>
              <TabsTrigger
                value="technical"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
              >
                <Activity className="w-4 h-4 mr-2" />
                Technical
              </TabsTrigger>
              <TabsTrigger
                value="blockers"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
              >
                <ShieldX className="w-4 h-4 mr-2" />
                Blockers
              </TabsTrigger>
              <TabsTrigger
                value="crosssell"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
              >
                <Layers className="w-4 h-4 mr-2" />
                Cross-Sell
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6"
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="risk" className="pt-6">
              <RiskGovernance dealId={id} alerts={intel.governance.alerts} />
            </TabsContent>

            <TabsContent value="technical" className="pt-6">
              <TechnicalGates
                dealId={id}
                progressPercentage={intel.technicalTrack.progressPercentage}
                integrityWarnings={intel.technicalTrack.integrityWarnings}
              />
            </TabsContent>

            <TabsContent value="blockers" className="pt-6">
              <BlockersPanel dealId={id} />
            </TabsContent>

            <TabsContent value="crosssell" className="pt-6">
              <CrossSellPanel dealId={id} />
            </TabsContent>

            <TabsContent value="activity" className="pt-6">
              <ActivityFeed dealId={id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <EditDealSheet deal={deal} open={editOpen} onOpenChange={setEditOpen} />
      <BatSignalDialog dealId={id} open={batOpen} onOpenChange={setBatOpen} />
      {briefingOpen && <BriefingMode deal={deal} intel={intel} onClose={() => setBriefingOpen(false)} />}
    </div>
  );
}
