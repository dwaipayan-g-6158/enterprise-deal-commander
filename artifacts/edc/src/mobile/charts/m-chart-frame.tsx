import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChartDatum {
  label: string;
  value: string;
  /** Optional second column — a share, a delta, a count. */
  detail?: string;
}

/**
 * The frame every chart in the kit renders inside.
 *
 * ## It is always a card, and that is a contrast decision
 *
 * The shell paints an ambient time-of-day wash on its canvas, so a chart drawn
 * directly on the background would sit on a surface that changes colour four
 * times a day — and every stroke measured against `--card` in tokens.test.ts
 * would be measured against the wrong thing. Keeping charts on `--card` is what
 * makes that audit true of the shipped pixel.
 *
 * ## The data table is not an accessibility afterthought
 *
 * Every chart ships with a real `<table>` behind a "Show data" disclosure. A
 * `role="img"` with a summary label tells a screen-reader user the shape; it
 * does not let them read the third quarter's number. The table does, and making
 * it visible to everyone rather than hiding it off-screen means it also serves
 * the sighted reader who wants the exact figure — which on a deal review is
 * most of them.
 */
export function MChartFrame({
  title,
  subtitle,
  /** Shown at the top right — the scrubbed readout, usually. */
  readout,
  legend,
  data,
  empty,
  error,
  loading,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  readout?: ReactNode;
  legend?: ReactNode;
  /** Rows for the disclosure table. Omit only when the chart IS a list already. */
  data?: ChartDatum[];
  /** Shown instead of the chart when there is nothing to draw. */
  empty?: ReactNode;
  error?: ReactNode;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [showData, setShowData] = useState(false);
  const tableId = useId();

  const body = error ? (
    <p className="m-body m-muted py-6 text-center">{error}</p>
  ) : loading ? (
    <div className="m-skeleton h-40 w-full" aria-hidden="true" />
  ) : empty ? (
    <p className="m-body m-muted py-6 text-center">{empty}</p>
  ) : (
    children
  );

  return (
    <section className={cn("m-card p-4", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-headline truncate">{title}</h3>
          {subtitle ? <p className="m-caption m-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {readout ? <div className="m-num shrink-0 text-right">{readout}</div> : null}
      </header>

      {body}

      {legend ? <div className="mt-3">{legend}</div> : null}

      {data && data.length > 0 && !error && !loading ? (
        <>
          <button
            type="button"
            onClick={() => setShowData((v) => !v)}
            aria-expanded={showData}
            aria-controls={tableId}
            className="m-caption m-muted m-press mt-3 flex items-center gap-1"
          >
            {showData ? "Hide data" : "Show data"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-[var(--m-dur-quick)]",
                showData && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>

          <div id={tableId} className="m-collapse mt-2" data-open={showData || undefined}>
            <div>
              <table className="w-full">
                <caption className="sr-only">{title}</caption>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.label} className="border-t border-border">
                      {/* No font-normal to undo the UA's bold <th>: .m-caption
                          already sets a weight, and any author rule outranks the
                          user-agent sheet. */}
                      <th scope="row" className="m-caption m-muted py-1.5 text-left">
                        {row.label}
                      </th>
                      <td className="m-caption m-num py-1.5 text-right">{row.value}</td>
                      {row.detail ? (
                        <td className="m-caption m-muted m-num py-1.5 pl-3 text-right">
                          {row.detail}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

/** A colour key. Never the only channel — every chart pairs one with a table. */
export function MChartLegend({ items }: { items: { label: string; paint: { stroke: string } }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="m-caption m-muted flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.paint.stroke }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
