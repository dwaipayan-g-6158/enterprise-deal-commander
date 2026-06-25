import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListDeals,
  useArchiveDeal,
  useDeleteDeal,
  useRestoreDeal,
  getListDealsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Archive,
  Trash2,
  RotateCcw,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { CreateDealSheet } from "@/components/cockpit/create-deal-sheet";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/components/cockpit/use-invalidate";

type SortKey = "dealName" | "accountName" | "salesStage" | "calculatedTCV" | "healthStatus" | "technicalLead";

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Deals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [health, setHealth] = useState("all");
  const [state, setState] = useState<"active" | "archived" | "deleted">("active");
  const [sortKey, setSortKey] = useState<SortKey>("dealName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "archive" | "delete">(null);

  const sortParam = `${sortDir === "desc" ? "-" : ""}${sortKey}`;
  const queryParams = useMemo(
    () => ({
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(health !== "all" ? { health: health as "GREEN" | "YELLOW" | "RED" } : {}),
      state,
      sort: sortParam,
    }),
    [search, health, state, sortParam],
  );

  const { data, isLoading, isError, refetch, isFetching } = useListDeals(queryParams);
  const archiveDeal = useArchiveDeal();
  const deleteDeal = useDeleteDeal();
  const restoreDeal = useRestoreDeal();

  const deals = data?.data ?? [];

  // Clear selection whenever the dataset/filter changes.
  useEffect(() => {
    setSelected(new Set());
  }, [state, search, health]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {sortKey === k ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  const allSelected = deals.length > 0 && deals.every((d) => selected.has(d.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(deals.map((d) => d.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDealsQueryKey() });

  const runBulk = async (action: "archive" | "delete" | "restore") => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const mut =
      action === "archive" ? archiveDeal : action === "delete" ? deleteDeal : restoreDeal;
    const results = await Promise.allSettled(ids.map((id) => mut.mutateAsync({ id })));
    const failed = results.filter((r) => r.status === "rejected").length;
    await invalidate();
    setSelected(new Set());
    setConfirm(null);
    if (failed === 0) {
      toast({
        title: `${ids.length} deal${ids.length > 1 ? "s" : ""} ${action}d`,
      });
    } else {
      toast({
        title: `${ids.length - failed} ${action}d, ${failed} failed`,
        variant: "destructive",
      });
    }
  };

  const colCount = 7;

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deal Roster</h1>
          <p className="text-muted-foreground mt-2">
            Active pipeline and technical validation states
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Deal
        </Button>
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deals, accounts, or owners..."
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select value={health} onValueChange={setHealth}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="All Health States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Health</SelectItem>
            <SelectItem value="GREEN">Green</SelectItem>
            <SelectItem value="YELLOW">Yellow</SelectItem>
            <SelectItem value="RED">Red</SelectItem>
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={(v) => setState(v as typeof state)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            {state === "active" && (
              <Button size="sm" variant="outline" onClick={() => setConfirm("archive")}>
                <Archive className="h-4 w-4 mr-2" /> Archive
              </Button>
            )}
            {(state === "archived" || state === "deleted") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => runBulk("restore")}
                disabled={restoreDeal.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" /> Restore
              </Button>
            )}
            {state !== "deleted" && (
              <Button size="sm" variant="destructive" onClick={() => setConfirm("delete")}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <Card className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  disabled={deals.length === 0}
                />
              </TableHead>
              <SortHeader k="dealName" label="Deal" />
              <SortHeader k="accountName" label="Account" />
              <SortHeader k="salesStage" label="Stage" />
              <SortHeader k="calculatedTCV" label="TCV" className="text-right" />
              <SortHeader k="healthStatus" label="Health" />
              <SortHeader k="technicalLead" label="Lead" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-12">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <p className="text-sm text-muted-foreground">
                      Could not load deals.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => refetch()}>
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : deals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="py-12">
                  <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
                    <Inbox className="h-8 w-8" />
                    <p className="text-sm">
                      {search.trim() || health !== "all"
                        ? "No deals match your filters."
                        : state === "active"
                          ? "No active deals yet."
                          : `No ${state} deals.`}
                    </p>
                    {state === "active" && !search.trim() && health === "all" && (
                      <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Create your first deal
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              deals.map((deal) => (
                <TableRow
                  key={deal.id}
                  data-state={selected.has(deal.id) ? "selected" : undefined}
                  className="group"
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(deal.id)}
                      onCheckedChange={() => toggleOne(deal.id)}
                      aria-label={`Select ${deal.dealName}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/deals/${deal.id}`} className="hover:underline">
                      {deal.dealName}
                    </Link>
                  </TableCell>
                  <TableCell>{deal.accountName}</TableCell>
                  <TableCell>{deal.salesStage}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(deal.calculatedTCV, deal.dealCurrency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        deal.healthStatus === "RED"
                          ? "destructive"
                          : deal.healthStatus === "YELLOW"
                            ? "default"
                            : "secondary"
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
                  </TableCell>
                  <TableCell>{deal.technicalLead}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile card list — shown below sm, hidden at sm+ */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-6 w-1/3" />
            </div>
          ))
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 text-center py-8">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Could not load deals.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground py-8">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">
              {search.trim() || health !== "all"
                ? "No deals match your filters."
                : state === "active"
                  ? "No active deals yet."
                  : `No ${state} deals.`}
            </p>
            {state === "active" && !search.trim() && health === "all" && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create your first deal
              </Button>
            )}
          </div>
        ) : (
          deals.map((deal) => (
            <Link
              key={deal.id}
              href={`/deals/${deal.id}`}
              className="block rounded-lg border p-4 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{deal.accountName}</span>
                <Badge
                  variant={
                    deal.healthStatus === "RED"
                      ? "destructive"
                      : deal.healthStatus === "YELLOW"
                        ? "default"
                        : "secondary"
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
              <p className="text-sm text-muted-foreground mt-1">{deal.dealName}</p>
              <p className="text-xl font-bold font-mono mt-1">
                {formatCurrency(deal.calculatedTCV, deal.dealCurrency)}
              </p>
            </Link>
          ))
        )}
      </div>

      {!isLoading && !isError && deals.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {data?.meta?.total ?? deals.length} deal
          {(data?.meta?.total ?? deals.length) === 1 ? "" : "s"}
          {isFetching ? " · updating..." : ""}
        </p>
      )}

      <CreateDealSheet open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? "Delete deals?" : "Archive deals?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? `This will move ${selected.size} deal${selected.size > 1 ? "s" : ""} to the deleted state. You can restore them later.`
                : `This will archive ${selected.size} deal${selected.size > 1 ? "s" : ""}. You can restore them later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runBulk(confirm === "delete" ? "delete" : "archive")}
              className={
                confirm === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
            >
              {confirm === "delete" ? "Delete" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
