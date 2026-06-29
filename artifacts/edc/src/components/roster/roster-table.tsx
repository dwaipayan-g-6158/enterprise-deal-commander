import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { COLUMNS } from "./model/roster-columns";
import type { ColumnId, Density, Health, RosterRow, SortSpec } from "./model/roster-types";
import type { DerivedRows, RosterGroup } from "./model/derive-rows";
import { DENSITY_PAD, DENSITY_TEXT } from "./density";
import { HEALTH_BORDER, RISK_BORDER, RosterCellContent } from "./cells";
import { RowContextMenu, type RowActions } from "./row-context-menu";

interface RosterTableProps {
  derived: DerivedRows;
  visibleColumns: ColumnId[];
  columnWidths: Partial<Record<ColumnId, number>>;
  onColumnResize: (id: ColumnId, width: number) => void;
  density: Density;
  sort: SortSpec[];
  onToggleSort: (key: ColumnId, additive: boolean) => void;
  selection: Set<string>;
  onToggleRow: (id: string, shiftKey: boolean) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  grouped: boolean;
  collapsedGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  onRowClick: (row: RosterRow) => void;
  previewId: string | null;
  rowActions: RowActions;
}

const MIN_COL_WIDTH = 60;

function ariaSort(spec: SortSpec | undefined): "ascending" | "descending" | "none" {
  if (!spec) return "none";
  return spec.dir === "asc" ? "ascending" : "descending";
}

export function RosterTable(props: RosterTableProps) {
  const {
    derived,
    visibleColumns,
    columnWidths,
    onColumnResize,
    density,
    sort,
    onToggleSort,
    selection,
    onToggleRow,
    onToggleAll,
    allSelected,
    grouped,
    collapsedGroups,
    onToggleGroup,
    onRowClick,
    previewId,
    rowActions,
  } = props;

  const pad = DENSITY_PAD[density];
  const text = DENSITY_TEXT[density];
  const sortByKey = new Map(sort.map((s) => [s.key, s]));
  const colCount = visibleColumns.length + 1; // selection

  // Column resize: track drag start in a ref, surface a live width for feedback,
  // persist once on mouse-up (handled by the parent).
  const dragRef = useRef<{ id: ColumnId; startX: number; startW: number } | null>(null);
  const [liveWidth, setLiveWidth] = useState<{ id: ColumnId; w: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setLiveWidth({ id: d.id, w: Math.max(MIN_COL_WIDTH, d.startW + (e.clientX - d.startX)) });
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      onColumnResize(d.id, Math.max(MIN_COL_WIDTH, d.startW + (e.clientX - d.startX)));
      dragRef.current = null;
      setLiveWidth(null);
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onColumnResize]);

  const startResize = (id: ColumnId, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th");
    const startW = columnWidths[id] ?? th?.getBoundingClientRect().width ?? COLUMNS[id].defaultWidth;
    dragRef.current = { id, startX: e.clientX, startW };
    setLiveWidth({ id, w: startW });
    document.body.style.userSelect = "none";
  };

  const widthOf = (id: ColumnId): number | undefined => (liveWidth?.id === id ? liveWidth.w : columnWidths[id]);

  return (
    <Table className={text}>
      <colgroup>
        <col style={{ width: 40 }} />
        {visibleColumns.map((id) => {
          const w = widthOf(id);
          return <col key={id} style={w ? { width: w } : undefined} />;
        })}
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onToggleAll}
              aria-label="Select all"
              disabled={derived.flat.length === 0}
            />
          </TableHead>
          {visibleColumns.map((id) => {
            const col = COLUMNS[id];
            const spec = sortByKey.get(id);
            return (
              <TableHead
                key={id}
                aria-sort={ariaSort(spec)}
                className={cn("relative", col.align === "right" && "text-right", col.align === "center" && "text-center")}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={(e) => onToggleSort(id, e.shiftKey)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
                      col.align === "right" && "flex-row-reverse",
                    )}
                    title="Click to sort · Shift-click to add a secondary sort"
                  >
                    {col.label}
                    {spec ? (
                      spec.dir === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.label
                )}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize ${col.label}`}
                  onMouseDown={(e) => startResize(id, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/40"
                />
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {derived.groups.map((group) => (
          <Fragment key={group.key || "__all"}>
            {grouped && group.key !== "" && (
              <GroupHeaderRow
                group={group}
                colCount={colCount}
                collapsed={collapsedGroups.has(group.key)}
                onToggle={() => onToggleGroup(group.key)}
              />
            )}
            {!(grouped && collapsedGroups.has(group.key)) &&
              group.rows.map((row) => {
                const isPreview = previewId === row.id;
                return (
                  <RowContextMenu key={row.id} row={row} actions={rowActions}>
                    <TableRow
                      data-state={selection.has(row.id) ? "selected" : undefined}
                      onClick={() => onRowClick(row)}
                      className={cn(
                        "group cursor-pointer",
                        row.riskLevel ? RISK_BORDER[row.riskLevel] : HEALTH_BORDER[row.healthStatus as Health],
                        isPreview && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                      )}
                    >
                      <TableCell className={pad} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selection.has(row.id)}
                          onCheckedChange={() => onToggleRow(row.id, false)}
                          onClick={(e) => {
                            if ((e as unknown as MouseEvent).shiftKey) onToggleRow(row.id, true);
                          }}
                          aria-label={`Select ${row.dealName}`}
                        />
                      </TableCell>
                      {visibleColumns.map((id) => {
                        const col = COLUMNS[id];
                        return (
                          <TableCell
                            key={id}
                            className={cn(pad, col.align === "right" && "text-right", col.align === "center" && "text-center")}
                          >
                            <RosterCellContent columnId={id} row={row} />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </RowContextMenu>
                );
              })}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

function GroupHeaderRow({
  group,
  colCount,
  collapsed,
  onToggle,
}: {
  group: RosterGroup;
  colCount: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <TableRow className="bg-muted/40 hover:bg-muted/50">
      <TableCell colSpan={colCount} className="py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {group.label}
          <span className="text-xs text-muted-foreground font-normal">
            {group.rows.length} · {formatCurrency(group.totalTCV, "USD")}
            {group.redCount > 0 && <span className="ml-1 text-red-500">· {group.redCount} RED</span>}
          </span>
        </button>
      </TableCell>
    </TableRow>
  );
}
