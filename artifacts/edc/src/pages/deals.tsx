import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useArchiveDeal,
  useDeleteDeal,
  useRestoreDeal,
  useListPipelineStages,
  useListTags,
  useListEngineThresholds,
  getListDealsQueryKey,
  getGetRosterEnrichmentQueryKey,
} from "@workspace/api-client-react";
import { PersonalityLine } from "@/components/personality-line";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Plus, Archive, Trash2, RotateCcw, AlertCircle, Inbox } from "lucide-react";
import { CreateDealSheet } from "@/components/cockpit/create-deal-sheet";
import { useToast } from "@/hooks/use-toast";
import { useRosterState } from "@/components/roster/hooks/use-roster-state";
import { useRosterData } from "@/components/roster/hooks/use-roster-data";
import { useDerivedRows } from "@/components/roster/hooks/use-derived-rows";
import { useSavedViews } from "@/components/roster/hooks/use-saved-views";
import { RosterToolbar } from "@/components/roster/roster-toolbar";
import { SavedViewTabs } from "@/components/roster/saved-view-tabs";
import { SaveViewDialog } from "@/components/roster/save-view-dialog";
import { ManageViewsDialog } from "@/components/roster/manage-views-dialog";
import { FilterChips } from "@/components/roster/filter-chips";
import { RosterTable } from "@/components/roster/roster-table";
import { RosterCardList } from "@/components/roster/roster-card-list";
import { RosterBoard } from "@/components/roster/board/roster-board";
import { RosterTimeline } from "@/components/roster/timeline/roster-timeline";
import { StageOverrideDialog } from "@/components/roster/board/stage-override-dialog";
import { CloseDealDialog, type PendingClose } from "@/components/roster/board/close-deal-dialog";
import { useStageMove } from "@/components/roster/board/use-stage-move";
import { PreviewPanel } from "@/components/roster/preview-panel";
import { LossAutopsySheet } from "@/components/autopsy/loss-autopsy-sheet";
import { ToastAction } from "@/components/ui/toast";
import type { RowActions } from "@/components/roster/row-context-menu";
import { terminalOutcome, type BoardStage } from "@/components/roster/model/board";
import { pruneSelection } from "@/components/roster/model/selection";
import { cn } from "@/lib/utils";
import { useCanWrite } from "@/lib/auth/role-context";
import { AdminOnly } from "@/components/auth/write-gate";
import type { FilterOption } from "@/components/roster/multi-select-filter";
import { COLUMNS } from "@/components/roster/model/roster-columns";
import { DEFAULT_FILTERS, DEFAULT_SORT, type ColumnId, type RosterRow } from "@/components/roster/model/roster-types";
import { encodeRosterUrl } from "@/components/roster/model/roster-url";

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function distinctOptions(values: string[]): FilterOption[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
}

export default function Deals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();

  const {
    view,
    viewId,
    setFilters,
    setGroup,
    toggleSort,
    selectSavedView,
    setView,
    density,
    setDensity,
    columnLayout,
    setColumnLayout,
    customViews,
    setCustomViews,
    viewMode,
    setViewMode,
    boardBand,
    setBoardBand,
  } = useRosterState();
  const filters = view.filters;

  const savedViews = useSavedViews({
    view,
    viewId,
    customViews,
    setCustomViews,
    selectSavedView,
    clearViewId: () => setView(view, null),
  });
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Search box is debounced before it touches the URL (which is the source of
  // truth). Keep a local mirror so typing feels instant; sync the other way
  // when the URL search changes externally (e.g. a saved view is selected).
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounced(searchInput, 300);
  useEffect(() => {
    // Mirror the server's 2-character search minimum (routes/deals.ts's
    // `searchTerm.length >= 2` gate) before it ever reaches `filters.search`.
    // A single typed character used to activate the search filter chip and
    // add a search param the server silently ignores below its own minimum
    // — the chip claimed a filter was applied while the table quietly showed
    // every row. The input box itself (searchInput) still shows exactly what
    // was typed; only the committed filter value holds back at 1 character.
    const trimmed = debouncedSearch.trim();
    const effective = trimmed.length === 1 ? "" : debouncedSearch;
    if (effective !== filters.search) setFilters({ search: effective });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  useEffect(() => {
    setSearchInput(filters.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  const { rows, total, isLoading, isError, isFetching, refetch } = useRosterData({
    state: filters.state,
    search: filters.search,
  });
  const derived = useDerivedRows(rows, view);

  // Board-only close flow: a terminal-column drop opens this dialog; on a lost
  // close the success toast offers to complete the autopsy.
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [autopsyTarget, setAutopsyTarget] = useState<{ dealId: string; dealName: string } | null>(null);
  // Last non-null target, kept around after autopsyTarget clears so the
  // Sheet stays mounted through its own close transition instead of
  // unmounting synchronously with the click (see the identical pattern in
  // components/autopsy/archetype-breakdown.tsx).
  const [lastAutopsyTarget, setLastAutopsyTarget] = useState<{ dealId: string; dealName: string } | null>(null);
  useEffect(() => {
    if (autopsyTarget) setLastAutopsyTarget(autopsyTarget);
  }, [autopsyTarget]);

  // Board-only stage-move API (drag-drop + context menu + 409 override). Harmless
  // in table mode — it holds no subscriptions until a move is triggered.
  const moveApi = useStageMove(derived.flat, {
    onClosed: (row, outcome) => {
      if (outcome === "lost") {
        toast({
          title: `${row.dealName} marked Lost`,
          description: "Capture the full autopsy while it's fresh.",
          action: (
            <ToastAction
              altText="Complete autopsy"
              onClick={() => setAutopsyTarget({ dealId: row.id, dealName: row.dealName })}
            >
              Complete autopsy
            </ToastAction>
          ),
        });
      } else {
        toast({ title: `${row.dealName} marked Won` });
      }
    },
  });

  // Visible columns in their configured order; guard against any stale ids.
  const visibleColumns = useMemo<ColumnId[]>(
    () => columnLayout.order.filter((id) => columnLayout.visible.includes(id) && COLUMNS[id]),
    [columnLayout],
  );

  // Filter options: stages from the canonical lookup (ordered); AM/TL derived
  // from the loaded rows so only owners actually present are offered.
  const { data: stagesData } = useListPipelineStages();
  const stageOptions = useMemo<FilterOption[]>(
    () =>
      [...(stagesData?.data ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ value: s.stageName, label: s.stageName })),
    [stagesData],
  );
  const amOptions = useMemo<FilterOption[]>(() => distinctOptions(rows.map((r) => r.accountManager)), [rows]);
  const tlOptions = useMemo<FilterOption[]>(() => distinctOptions(rows.map((r) => r.technicalLead)), [rows]);

  // Count of terminal-stage (Closed-Won/Closed-Lost) deals in the fetched set, regardless
  // of the current closure filter — drives the "Closed" tab badge and the hidden-count hint.
  const closedCount = useMemo(() => rows.filter((r) => terminalOutcome(r.salesStage) != null).length, [rows]);
  const { data: tagsData } = useListTags();
  const tagOptions = useMemo<FilterOption[]>(
    () => (tagsData?.data ?? []).map((t) => ({ value: t.id, label: t.tagName })),
    [tagsData],
  );

  // Group subtotals sum normalizedTCV (the reporting-currency amount), so the
  // label next to them must name that currency rather than hardcoding "USD" —
  // wrong the moment thresholds.reporting_currency isn't USD. Defaults match
  // the server's own default (see engine-recompute.ts's DEFAULT_THRESHOLDS).
  const { data: thresholdsData } = useListEngineThresholds();
  const reportingCurrency = useMemo(
    () => thresholdsData?.data?.find((t) => t.parameterKey === "reporting_currency")?.parameterValue ?? "USD",
    [thresholdsData],
  );

  // Selection / group-collapse / preview live in component memory.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [previewDealId, setPreviewDealId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "archive" | "delete">(null);

  const [, navigate] = useLocation();
  const archiveDeal = useArchiveDeal();
  const deleteDeal = useDeleteDeal();
  const restoreDeal = useRestoreDeal();

  const previewRow = useMemo(
    () => derived.flat.find((r) => r.id === previewDealId),
    [derived.flat, previewDealId],
  );

  const flatIds = useMemo(() => derived.flat.map((r) => r.id), [derived.flat]);

  // Selection is kept as an invariant `selected ⊆ visible`, not cleared on an
  // ad-hoc list of filter fields — any filter/search/sort change that shrinks
  // `derived.flat` prunes the rows that fell off screen, so a bulk Archive/
  // Delete can never be armed against a deal the user can no longer see (the
  // bug this fixes: select 2 deals, narrow the Stage filter to exclude them,
  // and the bulk bar still read "2 selected" with Delete enabled). Rows in a
  // *collapsed* group stay selected — they're still in derived.flat, only
  // hidden by the group toggle, which is a display concern, not a filter.
  useEffect(() => {
    setSelected((prev) => pruneSelection(prev, flatIds));
  }, [flatIds]);
  // A selection pruned to empty means the confirm dialog would be asking
  // about zero deals; close it rather than let it linger.
  useEffect(() => {
    if (selected.size === 0) setConfirm(null);
  }, [selected.size]);

  const allSelected = flatIds.length > 0 && flatIds.every((id) => selected.has(id));

  // Shift-click extends the selection from the last plain-clicked row to the
  // target row (inclusive), like a file manager or spreadsheet — the anchor
  // is the row index of the last non-shift toggle, resolved against the
  // current `derived.flat` order so grouping/sorting changes don't leave a
  // stale anchor pointing at the wrong row.
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(flatIds));
  const toggleOne = (id: string, shiftKey = false) => {
    const idx = derived.flat.findIndex((r) => r.id === id);
    const anchorIdx = anchorId != null ? derived.flat.findIndex((r) => r.id === anchorId) : -1;
    if (shiftKey && idx !== -1 && anchorIdx !== -1) {
      const [lo, hi] = anchorIdx < idx ? [anchorIdx, idx] : [idx, anchorIdx];
      const rangeIds = derived.flat.slice(lo, hi + 1).map((r) => r.id);
      setSelected((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((rid) => next.add(rid));
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchorId(id);
  };

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Persisted once per drag (on mouse-up), not per pixel.
  const onColumnResize = (id: ColumnId, width: number) =>
    setColumnLayout({ ...columnLayout, width: { ...columnLayout.width, [id]: width } });

  // Also busts the roster-enrichment sidecar (score/gates/risk/velocity), the
  // same pair use-stage-move.ts invalidates on a stage change — without it,
  // those columns kept showing stale values after a bulk archive/restore.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetRosterEnrichmentQueryKey() }),
    ]);

  const runBulk = async (action: "archive" | "delete" | "restore") => {
    // Re-prune at the point of action, not just via the effect above — this
    // is the actual safety guarantee for a destructive action, since it can't
    // be defeated by a stale render or an effect that hasn't flushed yet.
    const ids = Array.from(pruneSelection(selected, flatIds));
    if (ids.length === 0) {
      setConfirm(null);
      return;
    }
    const mut = action === "archive" ? archiveDeal : action === "delete" ? deleteDeal : restoreDeal;
    const results = await Promise.allSettled(ids.map((id) => mut.mutateAsync({ id })));
    const failed = results.filter((r) => r.status === "rejected").length;
    await invalidate();
    setSelected(new Set());
    setConfirm(null);
    toast(
      failed === 0
        ? { title: `${ids.length} deal${ids.length > 1 ? "s" : ""} ${action}d` }
        : { title: `${ids.length - failed} ${action}d, ${failed} failed`, variant: "destructive" },
    );
  };

  const runSingle = async (action: "archive" | "delete" | "restore", id: string) => {
    const mut = action === "archive" ? archiveDeal : action === "delete" ? deleteDeal : restoreDeal;
    try {
      await mut.mutateAsync({ id });
      await invalidate();
      if (previewDealId === id) setPreviewDealId(null);
      toast({ title: `Deal ${action}d` });
    } catch (err) {
      // Surface the server's actual message (e.g. "Only Closed-Won or
      // Closed-Lost deals can be archived...") rather than a generic toast —
      // same shape the API client throws elsewhere in this codebase, see
      // technical-gates.tsx / risk-governance.tsx / blockers-panel.tsx.
      const msg =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ??
        (err instanceof Error ? err.message : undefined);
      toast({ title: `Could not ${action} deal`, description: msg, variant: "destructive" });
    }
  };

  const copyLink = (row: RosterRow) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${window.location.origin}${base}/deals/${row.id}`;
    void navigator.clipboard?.writeText(url);
    toast({ title: "Link copied" });
  };

  const rowActions: RowActions = {
    state: filters.state,
    onOpen: (row) => navigate(`/deals/${row.id}`),
    onPreview: (row) => setPreviewDealId(row.id),
    onArchive: (row) => runSingle("archive", row.id),
    onDelete: (row) => runSingle("delete", row.id),
    onRestore: (row) => runSingle("restore", row.id),
    onCopyLink: copyLink,
    canWrite,
  };

  const someSelected = selected.size > 0;
  const grouped = view.group !== "none";
  // "Any filter is narrowing the set" — reuses the canonical view-serializer
  // (the same technique use-saved-views.ts's sameView already uses) instead
  // of a hand-maintained list of filter fields, which used to cover only
  // search/health/velocity: a TCV range, a stage, an account manager, etc.
  // could empty the table while this said "no active filters", so the empty
  // state below claimed "Your active pipeline is empty" (with a Create-deal
  // CTA) even though 13 deals existed and 0 matched the filters. `state` and
  // `closure` are excluded deliberately — they select a tab (Active/Closed/
  // Archived), not a narrowing filter, and have their own empty-state branch.
  const hasActiveFilters = useMemo(() => {
    const asFiltersOnlyView = (f: typeof filters) => encodeRosterUrl({ filters: f, sort: DEFAULT_SORT, group: "none" });
    const baseline = { ...DEFAULT_FILTERS, state: filters.state, closure: filters.closure };
    return asFiltersOnlyView(filters) !== asFiltersOnlyView(baseline);
  }, [filters]);

  const emptyMessage = hasActiveFilters
    ? "Nothing matched those filters. Try adjusting them."
    : (filters.closure ?? "open") === "closed"
      ? "No closed deals yet. Your first win will show up here."
      : filters.state === "active"
        // R5: a reader has no "Create your first deal" button below this
        // message, so the CTA half of the sentence would point at nothing.
        ? canWrite
          ? "Your active pipeline is empty. Time to find the next opportunity."
          : "Your active pipeline is empty."
        : `No ${filters.state} deals yet.`;

  return (
    <div
      className={cn(
        "p-4 sm:p-8 space-y-6 mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500",
        // Board/timeline want the full width for their horizontal rail; table stays capped.
        viewMode === "table" ? "max-w-[1600px]" : "max-w-full",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Deal Roster</h1>
          <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">
            Active pipeline and technical validation states
          </p>
        </div>
        <AdminOnly>
          <Button className="gap-2 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Deal</span>
          </Button>
        </AdminOnly>
      </div>

      <SavedViewTabs
        allViews={savedViews.allViews}
        activeId={viewId}
        dirty={savedViews.dirty}
        canSaveToActive={savedViews.canSaveToActive}
        counts={{ closed: closedCount }}
        onSelect={selectSavedView}
        onSaveToActive={() => savedViews.activeView && savedViews.saveToView(savedViews.activeView.id)}
        onSaveAs={() => setSaveOpen(true)}
        onManage={() => setManageOpen(true)}
      />

      <RosterToolbar
        filters={filters}
        setFilters={setFilters}
        density={density}
        setDensity={setDensity}
        searchInput={searchInput}
        onSearchInput={setSearchInput}
        stageOptions={stageOptions}
        amOptions={amOptions}
        tlOptions={tlOptions}
        tagOptions={tagOptions}
        group={view.group}
        setGroup={setGroup}
        columnLayout={columnLayout}
        setColumnLayout={setColumnLayout}
        viewMode={viewMode}
        setViewMode={setViewMode}
        boardBand={boardBand}
        setBoardBand={setBoardBand}
      />

      <FilterChips
        filters={filters}
        setFilters={setFilters}
        matchedCount={derived.matchedCount}
        totalCount={total}
        tagOptions={tagOptions}
      />

      {someSelected && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-2 flex-wrap">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            {filters.state === "active" && canWrite && (
              <Button size="sm" variant="outline" onClick={() => setConfirm("archive")}>
                <Archive className="h-4 w-4 mr-2" /> Archive
              </Button>
            )}
            {(filters.state === "archived" || filters.state === "deleted") && canWrite && (
              <Button size="sm" variant="outline" onClick={() => runBulk("restore")} disabled={restoreDeal.isPending}>
                <RotateCcw className="h-4 w-4 mr-2" /> Restore
              </Button>
            )}
            {filters.state !== "deleted" && canWrite && (
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

      {/* States: loading / error / empty */}
      {isLoading ? (
        <Card className="p-4 space-y-3">
          <PersonalityLine className="text-xs text-muted-foreground italic" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      ) : isError ? (
        <Card className="py-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Couldn't load deals. Give it another try.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : derived.flat.length === 0 ? (
        <Card className="py-12">
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <p className="text-sm">{emptyMessage}</p>
            {filters.state === "active" && !hasActiveFilters && canWrite && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create your first deal
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* At lg+, either the table or the Kanban board; cards below (mobile +
              tablet). The preview always opens as a right-side Sheet overlay so
              the layout never reflows. */}
          <div className="hidden lg:block">
            {viewMode === "board" ? (
              <RosterBoard
                rows={derived.flat}
                stages={stagesData?.data ?? []}
                readOnly={filters.state !== "active" || !canWrite}
                stageFilter={filters.stage}
                bandBy={boardBand}
                onCardClick={(row) => setPreviewDealId(row.id)}
                onRequestClose={(row: RosterRow, stage: BoardStage) => setPendingClose({ row, toStage: stage })}
                rowActions={rowActions}
                moveApi={moveApi}
              />
            ) : viewMode === "timeline" ? (
              <RosterTimeline
                rows={derived.flat}
                onCardClick={(row) => setPreviewDealId(row.id)}
                rowActions={rowActions}
              />
            ) : (
              <Card className="min-w-0 overflow-hidden">
                <RosterTable
                  derived={derived}
                  visibleColumns={visibleColumns}
                  columnWidths={columnLayout.width}
                  onColumnResize={onColumnResize}
                  density={density}
                  sort={view.sort}
                  onToggleSort={toggleSort}
                  selection={selected}
                  onToggleRow={toggleOne}
                  onToggleAll={toggleAll}
                  allSelected={allSelected}
                  grouped={grouped}
                  collapsedGroups={collapsedGroups}
                  onToggleGroup={toggleGroup}
                  onRowClick={(row) => setPreviewDealId(row.id)}
                  previewId={previewDealId}
                  rowActions={rowActions}
                  reportingCurrency={reportingCurrency}
                />
              </Card>
            )}
          </div>
          <div className="lg:hidden">
            <RosterCardList rows={derived.flat} />
          </div>
        </>
      )}

      {/* Preview always opens as a right-side Sheet overlay (handles its own Esc
          / outside-click), so opening it never resizes or reflows the table. */}
      <PreviewPanel row={previewRow} onClose={() => setPreviewDealId(null)} />

      {/* Board-only: opens when a stage move hits the 409 risk guardrail. */}
      <StageOverrideDialog moveApi={moveApi} />

      {/* Board-only: drag-to-close confirmation (won/lost + loss capture). */}
      <CloseDealDialog
        pending={pendingClose}
        onCancel={() => setPendingClose(null)}
        onConfirm={(extra) => {
          if (pendingClose) moveApi.close(pendingClose.row.id, pendingClose.toStage, extra);
          setPendingClose(null);
        }}
      />

      <LossAutopsySheet
        dealId={lastAutopsyTarget?.dealId ?? ""}
        dealName={lastAutopsyTarget?.dealName ?? ""}
        open={autopsyTarget !== null}
        onOpenChange={(v) => !v && setAutopsyTarget(null)}
      />

      {!isLoading && !isError && derived.flat.length > 0 && (
        <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
          <span>
            {derived.matchedCount === total
              ? `${total} deal${total === 1 ? "" : "s"}`
              : `${derived.matchedCount} of ${total} deals`}
            {isFetching ? " · updating…" : ""}
          </span>
          {(filters.closure ?? "open") === "open" && closedCount > 0 && (
            <>
              <span>· {closedCount} closed hidden</span>
              <button
                type="button"
                onClick={() => setFilters({ closure: "all" })}
                className="text-primary underline underline-offset-2 hover:no-underline cursor-pointer"
              >
                Show
              </button>
            </>
          )}
        </p>
      )}

      <SaveViewDialog open={saveOpen} onOpenChange={setSaveOpen} onSave={savedViews.createView} />
      <ManageViewsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        views={savedViews.customViews}
        onRename={savedViews.renameView}
        onDelete={savedViews.deleteView}
      />

      <CreateDealSheet open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent animation="spotlight">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? "Delete deals?" : "Archive deals?"}</AlertDialogTitle>
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
              className={confirm === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {confirm === "delete" ? "Delete" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
