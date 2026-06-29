import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useArchiveDeal,
  useDeleteDeal,
  useRestoreDeal,
  useListPipelineStages,
  useListTags,
  getListDealsQueryKey,
} from "@workspace/api-client-react";
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
import { PreviewPanel } from "@/components/roster/preview-panel";
import type { RowActions } from "@/components/roster/row-context-menu";
import type { FilterOption } from "@/components/roster/multi-select-filter";
import { COLUMNS } from "@/components/roster/model/roster-columns";
import type { ColumnId, RosterRow } from "@/components/roster/model/roster-types";

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

  const {
    view,
    viewId,
    setFilters,
    setGroup,
    toggleSort,
    selectSavedView,
    density,
    setDensity,
    columnLayout,
    setColumnLayout,
    customViews,
    setCustomViews,
  } = useRosterState();
  const filters = view.filters;

  const savedViews = useSavedViews({ view, viewId, customViews, setCustomViews, selectSavedView });
  const [saveOpen, setSaveOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Search box is debounced before it touches the URL (which is the source of
  // truth). Keep a local mirror so typing feels instant; sync the other way
  // when the URL search changes externally (e.g. a saved view is selected).
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounced(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
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
  const { data: tagsData } = useListTags();
  const tagOptions = useMemo<FilterOption[]>(
    () => (tagsData?.data ?? []).map((t) => ({ value: t.id, label: t.tagName })),
    [tagsData],
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

  // Clear selection whenever the result set's identity changes.
  useEffect(() => {
    setSelected(new Set());
  }, [filters.state, filters.search, filters.health.join(","), filters.velocity.join(",")]);

  const flatIds = derived.flat.map((r) => r.id);
  const allSelected = flatIds.length > 0 && flatIds.every((id) => selected.has(id));

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(flatIds));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListDealsQueryKey() });

  const runBulk = async (action: "archive" | "delete" | "restore") => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
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
    } catch {
      toast({ title: `Could not ${action} deal`, variant: "destructive" });
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
  };

  const someSelected = selected.size > 0;
  const grouped = view.group !== "none";
  const hasActiveFilters =
    filters.search.trim() !== "" || filters.health.length > 0 || filters.velocity.length > 0;

  const emptyMessage = hasActiveFilters
    ? "No deals match your filters."
    : filters.state === "active"
      ? "No active deals yet."
      : `No ${filters.state} deals.`;

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Deal Roster</h1>
          <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">
            Active pipeline and technical validation states
          </p>
        </div>
        <Button className="gap-2 shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Deal</span>
        </Button>
      </div>

      <SavedViewTabs
        allViews={savedViews.allViews}
        activeId={viewId}
        dirty={savedViews.dirty}
        canSaveToActive={savedViews.canSaveToActive}
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
            {filters.state === "active" && (
              <Button size="sm" variant="outline" onClick={() => setConfirm("archive")}>
                <Archive className="h-4 w-4 mr-2" /> Archive
              </Button>
            )}
            {(filters.state === "archived" || filters.state === "deleted") && (
              <Button size="sm" variant="outline" onClick={() => runBulk("restore")} disabled={restoreDeal.isPending}>
                <RotateCcw className="h-4 w-4 mr-2" /> Restore
              </Button>
            )}
            {filters.state !== "deleted" && (
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
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      ) : isError ? (
        <Card className="py-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Could not load deals.</p>
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
            {filters.state === "active" && !hasActiveFilters && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create your first deal
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Table at lg+ ; cards below (mobile + tablet). The preview always
              opens as a right-side Sheet overlay so the table never reflows. */}
          <div className="hidden lg:block">
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
              />
            </Card>
          </div>
          <div className="lg:hidden">
            <RosterCardList rows={derived.flat} />
          </div>
        </>
      )}

      {/* Preview always opens as a right-side Sheet overlay (handles its own Esc
          / outside-click), so opening it never resizes or reflows the table. */}
      <PreviewPanel row={previewRow} onClose={() => setPreviewDealId(null)} />

      {!isLoading && !isError && derived.flat.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {derived.matchedCount === total
            ? `${total} deal${total === 1 ? "" : "s"}`
            : `${derived.matchedCount} of ${total} deals`}
          {isFetching ? " · updating…" : ""}
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
        <AlertDialogContent>
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
