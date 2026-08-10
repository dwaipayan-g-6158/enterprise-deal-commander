import { cn } from "@/lib/utils";
import { haptic } from "@/mobile/lib/haptics";
import type { ChartPaint } from "@/mobile/charts/chart-colors";

export interface HeatCell {
  /** Displayed IN the cell. Colour is never the only channel. */
  value: string;
  paint: ChartPaint;
  /** Full description for assistive tech and the tap handler. */
  description: string;
}

export interface HeatRow {
  label: string;
  cells: HeatCell[];
}

/**
 * A heat grid built from CSS grid and real buttons, not SVG.
 *
 * ## Why this exists at all
 *
 * Portfolio risk is currently a "needs desktop" stub whose stated reason is that
 * a heatmap needs width to compare. That is true of a heatmap where colour is
 * the only channel — but the thing the grid encodes is a ranking, and a ranking
 * survives a narrow screen perfectly well. So: every cell carries its NUMBER,
 * the first column is sticky, and the grid scroll-snaps horizontally. The
 * comparison the desktop grid supports is still available; it is read a column
 * at a time instead of all at once.
 *
 * SVG would have cost the 48px targets, the text wrapping and the sticky column,
 * and bought nothing — there are no curves here.
 */
export function MHeatGrid({
  columns,
  rows,
  onSelect,
  rowHeader,
  className,
}: {
  columns: string[];
  rows: HeatRow[];
  onSelect?: (row: HeatRow, columnIndex: number) => void;
  /** Header for the sticky first column — "Account manager", say. */
  rowHeader: string;
  className?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className={cn("-mx-4 overflow-x-auto overscroll-x-contain px-4", className)}>
      <table className="w-max border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              scope="col"
              className="m-caption m-muted sticky left-0 z-10 bg-card px-2 pb-2 text-left"
            >
              {rowHeader}
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="m-caption m-muted px-1 pb-2 text-center">
                <span className="block w-16 truncate">{column}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th
                scope="row"
                // Sticky and OPAQUE: a translucent header over scrolling cells
                // is unreadable exactly when it matters, mid-scroll.
                className="m-label sticky left-0 z-10 bg-card py-1 pr-3 text-left"
              >
                <span className="block w-28 truncate">{row.label}</span>
              </th>
              {row.cells.map((cell, i) => (
                <td key={columns[i] ?? i} className="p-0.5">
                  <button
                    type="button"
                    disabled={!onSelect}
                    onClick={() => {
                      if (!onSelect) return;
                      haptic();
                      onSelect(row, i);
                    }}
                    aria-label={cell.description}
                    className={cn(
                      "m-num flex h-12 w-16 items-center justify-center rounded-lg",
                      onSelect && "m-press",
                    )}
                    style={{
                      backgroundColor: cell.paint.fill,
                      boxShadow: `inset 0 0 0 1.5px ${cell.paint.stroke}`,
                    }}
                  >
                    <span className="m-label">{cell.value}</span>
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
