import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A section that shows its verdict at rest and its evidence on demand.
 *
 * This is the progressive-disclosure unit of the deal screen: state 0 answers
 * "how is this doing", state 1 answers "why". Everything expands in place —
 * no navigation, so the reader never loses their position in the deal.
 *
 * The anchor id lets the Commander sheet scroll to a section; scroll-mt clears
 * the sticky header so the heading doesn't land underneath it.
 */
export function CollapsibleSection({
  anchorId,
  label,
  verdict,
  children,
  defaultOpen = false,
}: {
  anchorId: string;
  label: string;
  /** The at-rest summary. Kept visible when expanded — it's the headline. */
  verdict: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `${anchorId}-body`;
  const expandable = Boolean(children);

  return (
    <section id={anchorId} className="m-card m-reveal scroll-mt-20 overflow-hidden">
      <button
        type="button"
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? bodyId : undefined}
        disabled={!expandable}
        className={cn(
          "flex w-full items-start gap-3 p-4 text-left",
          expandable && "m-press",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="m-eyebrow">{label}</p>
          <div className="mt-1.5">{verdict}</div>
        </div>
        {expandable ? (
          <ChevronDown
            className={cn(
              "m-muted mt-1 h-5 w-5 shrink-0 transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        ) : null}
      </button>

      {/* The body stays mounted so its height can animate: a 0fr→1fr grid row
          resolves to the content's own height at both ends, with nothing
          measured in JS. `inert` is what keeps a collapsed body out of the
          tab order and off a screen reader, which mounting it would otherwise
          undo. */}
      {expandable ? (
        <div className="m-collapse" data-open={open} inert={!open}>
          <div>
            <div id={bodyId} className="border-t border-[var(--m-keyline)] p-4">
              {children}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
