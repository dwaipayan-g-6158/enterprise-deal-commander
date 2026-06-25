import { useEffect, useMemo, useRef, useState } from "react";
import {
  useGetSnapshot,
  useGetDeal,
  useGetDealIntelligence,
  useListDeals,
  type Deal,
  type Intelligence,
} from "@workspace/api-client-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Printer,
  ImageDown,
  History,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  Play,
  Pause,
  RotateCcw,
  Timer,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  EyeOff,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "./use-invalidate";
import { useEngineContext, recomputeIntelligence } from "./engine-recompute";

type QueueItem = {
  id: string;
  dealName: string;
  accountName: string;
  healthStatus?: string;
};

function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function BriefingMode({
  deal,
  intel,
  onClose,
}: {
  deal: Deal;
  intel: Intelligence;
  onClose: () => void;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([
    {
      id: deal.id,
      dealName: deal.dealName,
      accountName: deal.accountName,
      healthStatus: deal.healthStatus,
    },
  ]);
  const [activeId, setActiveId] = useState<string>(deal.id);
  const [filterGreen, setFilterGreen] = useState(false);

  const activeIndex = Math.max(
    0,
    queue.findIndex((q) => q.id === activeId),
  );
  const activeItem = queue[activeIndex] ?? queue[0];

  // Pacing timer — presenter only.
  const [running, setRunning] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [dealSeconds, setDealSeconds] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setSessionSeconds((s) => s + 1);
      setDealSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  // Reset the per-deal timer whenever the active deal changes.
  useEffect(() => {
    setDealSeconds(0);
  }, [activeId]);

  const goPrev = () => {
    if (!filterGreen) {
      if (activeIndex > 0) setActiveId(queue[activeIndex - 1].id);
      return;
    }
    for (let i = activeIndex - 1; i >= 0; i--) {
      if (queue[i].healthStatus !== "GREEN") {
        setActiveId(queue[i].id);
        return;
      }
    }
  };
  const goNext = () => {
    if (!filterGreen) {
      if (activeIndex < queue.length - 1) setActiveId(queue[activeIndex + 1].id);
      return;
    }
    for (let i = activeIndex + 1; i < queue.length; i++) {
      if (queue[i].healthStatus !== "GREEN") {
        setActiveId(queue[i].id);
        return;
      }
    }
  };
  // When skipping GREEN, disable arrows only when no eligible deal remains.
  const hasPrev = filterGreen
    ? queue.slice(0, activeIndex).some((q) => q.healthStatus !== "GREEN")
    : activeIndex > 0;
  const hasNext = filterGreen
    ? queue.slice(activeIndex + 1).some((q) => q.healthStatus !== "GREEN")
    : activeIndex < queue.length - 1;

  const resetTimer = () => {
    setRunning(false);
    setSessionSeconds(0);
    setDealSeconds(0);
  };

  const addToQueue = (item: QueueItem) => {
    setQueue((prev) =>
      prev.some((q) => q.id === item.id) ? prev : [...prev, item],
    );
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => {
      if (prev.length <= 1) return prev; // keep at least one deal
      const next = prev.filter((q) => q.id !== id);
      if (id === activeId) {
        const removedIdx = prev.findIndex((q) => q.id === id);
        const fallback = next[Math.min(removedIdx, next.length - 1)];
        setActiveId(fallback.id);
      }
      return next;
    });
  };

  const moveInQueue = (index: number, dir: -1 | 1) => {
    setQueue((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto print:static print:overflow-visible">
      {/* Presenter control bar — never projected/printed */}
      <div className="max-w-5xl mx-auto px-8 py-6 flex items-center gap-3 flex-wrap print:hidden">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={goPrev}
            disabled={!hasPrev}
            aria-label="Previous deal"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums px-2 min-w-[88px] text-center">
            Deal {activeIndex + 1} of {queue.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={goNext}
            disabled={!hasNext}
            aria-label="Next deal"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <AgendaManager
          queue={queue}
          activeId={activeId}
          onSelect={setActiveId}
          onAdd={addToQueue}
          onRemove={removeFromQueue}
          onMove={moveInQueue}
        />

        <Button
          variant={filterGreen ? "default" : "ghost"}
          size="sm"
          onClick={() => setFilterGreen((v) => !v)}
          title="Skip GREEN deals when navigating the queue"
        >
          <EyeOff className="h-4 w-4 mr-1" />
          Skip GREEN
        </Button>

        <div className="flex items-center gap-1 ml-auto rounded-md border px-2 py-1">
          <Timer className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-mono tabular-nums px-1" aria-label="Session elapsed time">
            {formatElapsed(sessionSeconds)}
          </span>
          <span className="text-xs text-muted-foreground font-mono tabular-nums px-1">
            (deal {formatElapsed(dealSeconds)})
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setRunning((r) => !r)}
            aria-label={running ? "Pause timer" : "Start timer"}
          >
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={resetTimer}
            aria-label="Reset timer"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close briefing">
          <X className="h-6 w-6" />
        </Button>
      </div>

      <BriefingDealView
        key={activeItem.id}
        dealId={activeItem.id}
        fallbackName={activeItem.dealName}
        fallbackAccount={activeItem.accountName}
      />
    </div>
  );
}

function AgendaManager({
  queue,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  onMove,
}: {
  queue: QueueItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  const [search, setSearch] = useState("");
  const { data } = useListDeals({ state: "active", sort: "dealName" });
  const queueIds = new Set(queue.map((q) => q.id));

  const candidates = (data?.data ?? [])
    .filter((d) => !queueIds.has(d.id))
    .filter((d) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        d.dealName.toLowerCase().includes(q) ||
        d.accountName.toLowerCase().includes(q)
      );
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <ListOrdered className="h-4 w-4 mr-2" /> Agenda
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-semibold">Session Agenda</p>
          <p className="text-xs text-muted-foreground">
            Curate and reorder the deals you will walk through.
          </p>
        </div>

        <div className="px-2 py-2 border-b">
          <ScrollArea className="max-h-56">
            <div className="space-y-1 pr-2">
              {queue.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                    item.id === activeId ? "bg-accent" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="w-5 text-xs text-muted-foreground tabular-nums">
                    {index + 1}.
                  </span>
                  <button
                    type="button"
                    className="flex-1 text-left truncate"
                    onClick={() => onSelect(item.id)}
                  >
                    <span className="font-medium">{item.dealName}</span>
                    <span className="text-muted-foreground"> · {item.accountName}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onMove(index, -1)}
                    disabled={index === 0}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onMove(index, 1)}
                    disabled={index === queue.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onRemove(item.id)}
                    disabled={queue.length <= 1}
                    aria-label="Remove from agenda"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="px-2 py-2">
          <div className="relative mb-2 px-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Add a deal to the agenda..."
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ScrollArea className="max-h-48">
            <div className="space-y-1 pr-2">
              {candidates.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground text-center">
                  {search.trim() ? "No matching deals." : "All deals are in the agenda."}
                </p>
              ) : (
                candidates.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left hover:bg-muted/60"
                    onClick={() =>
                      onAdd({
                        id: d.id,
                        dealName: d.dealName,
                        accountName: d.accountName,
                        healthStatus: d.healthStatus,
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">
                      <span className="font-medium">{d.dealName}</span>
                      <span className="text-muted-foreground"> · {d.accountName}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BriefingDealView({
  dealId,
  fallbackName,
  fallbackAccount,
}: {
  dealId: string;
  fallbackName: string;
  fallbackAccount: string;
}) {
  const { data: dealRes, isLoading: dealLoading } = useGetDeal(dealId);
  const { data: intelRes, isLoading: intelLoading } = useGetDealIntelligence(dealId);
  const deal = dealRes?.data;
  const intel = intelRes?.data;

  if (dealLoading || intelLoading || !deal || !intel) {
    return (
      <div className="max-w-5xl mx-auto px-8 pb-12 pt-6 space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-12 w-96" />
          <Skeleton className="h-7 w-64" />
        </div>
        <div className="grid grid-cols-3 gap-8">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <p className="text-sm text-muted-foreground">
          Loading {fallbackName} · {fallbackAccount}...
        </p>
      </div>
    );
  }

  return <BriefingDealContent deal={deal} intel={intel} />;
}

function BriefingDealContent({ deal, intel }: { deal: Deal; intel: Intelligence }) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const isHistorical = date !== today;
  const { data: snapshot } = useGetSnapshot(deal.id, { date });
  const contentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const ctx = useEngineContext(deal, intel);

  const asOf = useMemo(() => {
    if (!isHistorical || !snapshot?.data) return null;
    const gates: Record<string, boolean> = {};
    for (const g of snapshot.data.gates) gates[g.gateCode] = g.isCompleted;
    return recomputeIntelligence(deal, intel, { gates }, ctx);
  }, [isHistorical, snapshot, deal, intel, ctx]);

  const progressPercentage =
    asOf?.technicalTrack.progressPercentage ?? intel.technicalTrack.progressPercentage;
  const alerts = asOf?.governance.alerts ?? intel.governance.alerts;

  const handlePrint = () => window.print();

  const handlePng = async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
      const dataUrl = await toPng(contentRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: bg,
      });
      const link = document.createElement("a");
      link.download = `briefing-${deal.dealName.replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      toast({ title: "Could not export image", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const health = asOf?.governance.healthStatus ?? deal.healthStatus;
  const healthColor =
    health === "RED" ? "text-destructive" : health === "YELLOW" ? "text-amber-500" : "text-emerald-500";

  return (
    <>
      <div className="max-w-5xl mx-auto px-8 flex items-center gap-2 flex-wrap print:hidden">
        <div className="flex items-center gap-2 mr-auto">
          <History className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto h-9"
          />
          {isHistorical && (
            <Button variant="ghost" size="sm" onClick={() => setDate(today)}>
              Today
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" /> Print / PDF
        </Button>
        <Button variant="outline" size="sm" onClick={handlePng} disabled={exporting}>
          <ImageDown className="h-4 w-4 mr-2" /> {exporting ? "Exporting..." : "PNG"}
        </Button>
      </div>

      <div ref={contentRef} className="max-w-5xl mx-auto px-8 pb-12 pt-6 bg-background">
        <div className="mb-12">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
              Executive Briefing
            </p>
            <h1 className="text-5xl font-bold tracking-tight">{deal.dealName}</h1>
            <p className="text-2xl text-muted-foreground mt-2">{deal.accountName}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-8 mb-12">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Normalized TCV</p>
            <p className="text-4xl font-bold font-mono">
              {formatCurrency(intel.financials.normalizedTCV, intel.financials.reportingCurrency)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Health Status</p>
            <p className={`text-4xl font-bold ${healthColor}`}>{health}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Technical Progress</p>
            <p className="text-4xl font-bold font-mono">{progressPercentage}%</p>
          </div>
        </div>

        {isHistorical && (
          <div className="mb-12 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Showing technical validation and risk posture reconstructed as of{" "}
            {new Date(date).toLocaleDateString()}. Deal economics and sales stage reflect current values.
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 mb-12">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Sales Stage</p>
            <p className="text-xl">{intel.salesStage}</p>
            <p className="text-sm text-muted-foreground">{intel.daysInStage} days in stage</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Team</p>
            <p className="text-xl">{intel.team.accountManager}</p>
            <p className="text-sm text-muted-foreground">Technical: {intel.team.technicalLead}</p>
          </div>
        </div>

        {deal.managerStrategicBlueprint && (
          <div className="mb-12">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Strategic Blueprint</p>
            <p className="text-lg leading-relaxed">{deal.managerStrategicBlueprint}</p>
          </div>
        )}

        <div className="mb-12">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Risk Posture</p>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-500">
              <CheckCircle className="h-5 w-5" />
              <span className="text-lg">No active risk patterns.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <div key={a.code} className="flex items-start gap-3">
                  {a.severity === "RED" ? (
                    <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-lg">{a.message}</p>
                    {a.disposition && (
                      <Badge variant="outline" className="capitalize mt-1">
                        {a.disposition.state}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {snapshot?.data && (
          <p className="text-xs text-muted-foreground">
            Snapshot as of {new Date(snapshot.data.asOf).toLocaleString()}
            {snapshot.data.reconstructed ? " (reconstructed)" : ""}
          </p>
        )}
      </div>

      {/* Presenter-private speaker notes — never projected, printed, or exported. */}
      {deal.speakerNotes && (
        <div className="max-w-5xl mx-auto px-8 pb-16 print:hidden">
          <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <EyeOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Presenter Notes — Private
              </p>
              <Badge variant="outline" className="ml-auto text-[10px]">
                Not projected or exported
              </Badge>
            </div>
            <p className="text-base leading-relaxed text-foreground/80 whitespace-pre-wrap">
              {deal.speakerNotes}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
