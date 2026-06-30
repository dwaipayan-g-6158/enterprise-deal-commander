import { useState, useRef, useEffect } from "react";
import {
  useGetDeal,
  useGetDealIntelligence,
  useListDeals,
} from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Pencil,
  Radio,
  Presentation,
  Sparkles,
  AlertCircle,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COCKPIT_GROUPS, alertCount, managedAlertCount } from "@/components/cockpit/cockpit-tabs";
import { EditDealSheet } from "@/components/cockpit/edit-deal-sheet";
import { BatSignalDialog } from "@/components/cockpit/bat-signal-dialog";
import { RiskGovernance } from "@/components/cockpit/risk-governance";
import { TechnicalGates } from "@/components/cockpit/technical-gates";
import { BlockersPanel } from "@/components/cockpit/blockers-panel";
import { CrossSellPanel } from "@/components/cockpit/cross-sell-panel";
import { NextBestAction } from "@/components/cockpit/next-best-action";
import { ActivityFeed } from "@/components/cockpit/activity-feed";
import { HistoryPanel } from "@/components/cockpit/history-panel";
import { BriefingMode } from "@/components/cockpit/briefing-mode";
import { RiskSimulator } from "@/components/cockpit/risk-simulator";
import { DealTrajectory } from "@/components/cockpit/deal-trajectory";
import { AccountNavigationArray } from "@/components/cockpit/account-navigation-array";
import { ScorePanel } from "@/components/cockpit/v2/score-panel";
import { CompetitivePanel } from "@/components/cockpit/v2/competitive-panel";
import { StakeholdersPanel } from "@/components/cockpit/v2/stakeholders-panel";
import { DecisionsPanel } from "@/components/cockpit/v2/decisions-panel";
import { PlaybookPanel } from "@/components/cockpit/v2/playbook-panel";
import { PricingPanel } from "@/components/cockpit/v2/pricing-panel";
import { DealTagsBar } from "@/components/cockpit/v2/deal-tags-bar";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import {
  extractDealRisk,
  healthToRiskLevel,
  RISK_LEVEL_CLASS,
  RISK_LEVEL_LABEL,
  type RiskLevel,
} from "@/components/cockpit/risk/risk-model";
import { cn } from "@/lib/utils";

function CockpitSkeleton() {
  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-20 w-64" />
      </div>
      <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full lg:col-span-2" />
      </div>
    </div>
  );
}

export default function DealCockpit() {
  const params = useParams();
  const id = params.id as string;

  const {
    data: dealResponse,
    isLoading: isLoadingDeal,
    isError: isErrorDeal,
    refetch: refetchDeal,
  } = useGetDeal(id);
  const {
    data: intelligenceResponse,
    isLoading: isLoadingIntel,
    isError: isErrorIntel,
    refetch: refetchIntel,
  } = useGetDealIntelligence(id);

  const [editOpen, setEditOpen] = useState(false);
  const [batOpen, setBatOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);

  const [group, setGroup] = useState("risk");
  const [sub, setSub] = useState("risk");

  const activeGroup = COCKPIT_GROUPS.find((g) => g.id === group) ?? COCKPIT_GROUPS[0];
  const selectGroup = (id: string) => {
    const g = COCKPIT_GROUPS.find((x) => x.id === id);
    if (!g) return;
    setGroup(id);
    setSub(g.subs[0].id);
  };

  const [, navigate] = useLocation();
  const { data: allDeals } = useListDeals({ state: "active", limit: 500 });
  const gatesSaveRef = useRef<(() => Promise<void>) | null>(null);
  const formDirtyRef = useRef(false);

  const sortedDeals = [...(allDeals?.data ?? [])].sort(
    (a, b) => (b.calculatedTCV ?? 0) - (a.calculatedTCV ?? 0),
  );

  // Warn on full page unload while the edit form has unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (formDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Keyboard shortcuts: Ctrl+B briefing, Ctrl+S save gates, Escape, arrow deal nav.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setBriefingOpen((v) => !v);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void gatesSaveRef.current?.();
        return;
      }

      if (e.key === "Escape" && briefingOpen) {
        setBriefingOpen(false);
        return;
      }

      if (isTyping) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const idx = sortedDeals.findIndex((d) => d.id === id);
        if (idx === -1) return;
        const nextIdx = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= sortedDeals.length) return;
        if (
          formDirtyRef.current &&
          !window.confirm("You have unsaved changes. Leave anyway?")
        )
          return;
        navigate(`/deals/${sortedDeals[nextIdx].id}`);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [briefingOpen, id, navigate, sortedDeals]);

  const deal = dealResponse?.data;
  const intel = intelligenceResponse?.data;

  if (isLoadingDeal || isLoadingIntel) return <CockpitSkeleton />;
  if (isErrorDeal || isErrorIntel) {
    return (
      <div className="p-8 max-w-md mx-auto mt-16 flex flex-col items-center gap-4 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">Could not load this deal.</p>
        <Button
          variant="outline"
          onClick={() => {
            refetchDeal();
            refetchIntel();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (!deal || !intel) return <div className="p-8 text-destructive">Deal not found</div>;

  const redAlerts = alertCount(intel.governance.alerts);
  const managedCount = managedAlertCount(intel.governance.managedAlerts);

  const risk = extractDealRisk(intel);
  const healthStatus = (deal.healthStatus === "RED" || deal.healthStatus === "YELLOW" || deal.healthStatus === "GREEN")
    ? deal.healthStatus
    : "GREEN" as const;
  const level: RiskLevel = risk ? risk.riskLevel : healthToRiskLevel(healthStatus);

  const renderPanel = (subId: string) => {
    switch (subId) {
      case "risk": return (
        <RiskGovernance
          dealId={id}
          alerts={intel.governance.alerts}
          managedAlerts={intel.governance.managedAlerts ?? []}
          risk={risk}
        />
      );
      case "coaching": return <NextBestAction dealId={id} />;
      case "technical": return (
        <TechnicalGates
          dealId={id}
          progressPercentage={intel.technicalTrack.progressPercentage}
          integrityWarnings={intel.technicalTrack.integrityWarnings}
          onSaveRef={gatesSaveRef}
        />
      );
      case "blockers": return <BlockersPanel dealId={id} />;
      case "playbook": return <PlaybookPanel dealId={id} />;
      case "score": return <ScorePanel dealId={id} />;
      case "competitive": return <CompetitivePanel dealId={id} />;
      case "stakeholders": return <StakeholdersPanel dealId={id} />;
      case "pricing": return <PricingPanel dealId={id} currency={deal.dealCurrency} />;
      case "crosssell": return <CrossSellPanel dealId={id} />;
      case "activity": return <ActivityFeed dealId={id} />;
      case "decisions": return <DecisionsPanel dealId={id} />;
      case "history": return <HistoryPanel dealId={id} />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AccountNavigationArray activeDealId={id} />
      <div className="p-8 max-w-[1600px] mx-auto space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{deal.dealName}</h1>
            <Badge
              variant="outline"
              className={cn(
                RISK_LEVEL_CLASS[level].bg,
                RISK_LEVEL_CLASS[level].text,
                RISK_LEVEL_CLASS[level].border,
                "font-medium",
              )}
            >
              {risk ? <span className="font-mono tabular-nums mr-1.5">{risk.compositeScore}</span> : null}
              {RISK_LEVEL_LABEL[level]}
            </Badge>
          </div>
          <p className="text-muted-foreground text-lg">{deal.accountName}</p>
          <DealTagsBar dealId={id} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Contract Value</p>
            <p className="text-3xl font-bold font-mono">
              {formatCurrency(deal.calculatedTCV, deal.dealCurrency)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setBriefingOpen(true)}>
              <Presentation className="h-4 w-4 mr-2" /> Briefing
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSimOpen(true)}>
                  <Sparkles className="h-4 w-4 mr-2" /> Simulate risk
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setBatOpen(true)}>
                  <Radio className="h-4 w-4 mr-2" /> Bat-Signal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <DealTrajectory dealId={id} />

      <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-6">
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
                <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  Normalized TCV
                  <InfoTooltip>
                    Total Contract Value converted to your reporting currency at the current FX
                    rate, so deals in different currencies can be compared on a common basis.
                  </InfoTooltip>
                </span>
                <span className="font-mono">
                  {formatCurrency(intel.financials.normalizedTCV, intel.financials.reportingCurrency)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Pricing Model</span>
                <span>{intel.financials.pricingModel}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground text-sm">Products of Interest</span>
                {deal.productsOfInterest && deal.productsOfInterest.length > 0 ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {deal.productsOfInterest.map((p) => (
                      <Badge key={p.productId} variant="secondary" className="font-normal">
                        {p.productName}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
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
          <div className="w-full">
            {/* Primary group tabs */}
            <Tabs value={group} onValueChange={selectGroup} className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none h-12 bg-transparent p-0 overflow-x-auto">
                {COCKPIT_GROUPS.map((g) => (
                  <TabsTrigger
                    key={g.id}
                    value={g.id}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 shrink-0"
                  >
                    <g.icon className="w-4 h-4 mr-2" />
                    {g.label}
                    {g.id === "risk" && redAlerts > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center rounded-full bg-destructive/15 text-destructive text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 tabular-nums">
                        {redAlerts}
                      </span>
                    )}
                    {g.id === "risk" && managedCount > 0 && (
                      <span className="ml-1 text-[10px] font-medium text-muted-foreground tabular-nums">
                        · {managedCount} managed
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Sub-tabs (segmented) for the active group */}
            <Tabs value={sub} onValueChange={setSub} className="w-full">
              <TabsList className="mt-4 inline-flex h-auto w-fit flex-wrap gap-1 rounded-md bg-muted/40 p-1">
                {activeGroup.subs.map((s) => (
                  <TabsTrigger
                    key={s.id}
                    value={s.id}
                    className="rounded px-4 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    {s.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="pt-6">{renderPanel(sub)}</div>
          </div>
        </div>
      </div>

      <EditDealSheet
        deal={deal}
        open={editOpen}
        onOpenChange={setEditOpen}
        dirtyRef={formDirtyRef}
      />
      <BatSignalDialog dealId={id} open={batOpen} onOpenChange={setBatOpen} />
      <RiskSimulator deal={deal} intel={intel} open={simOpen} onOpenChange={setSimOpen} />
      {briefingOpen && <BriefingMode deal={deal} intel={intel} onClose={() => setBriefingOpen(false)} />}
      </div>
    </div>
  );
}
