import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  FileEdit,
  Flag,
  HeartPulse,
  ListChecks,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { dayKey, dayLabel, formatDateTime, formatTime } from "@/lib/format";
import { HEALTH_CLASS, type Health } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";
import type { TimelineKind, TimelineRow } from "./adapters";

// Presentational only — no hooks, no queries, no dealId. Both Record-tab views
// and both mount points (deal cockpit + /memory/:id) render through this.
//
// `state` is a three-way union rather than isLoading/isError booleans on
// purpose: every one of the five list sections this replaces destructured only
// `data`, so their "nothing here yet" copy rendered while fetching AND on
// error — it told you the record was clean when the request had failed. With a
// discriminated state that bug is unrepresentable.

/**
 * Icon per event kind. Kind is conveyed by ICON, not colour: semantic-colors.ts
 * reserves green for "won" and the sky→amber→red ramp for live risk, and exists
 * precisely because ~24 ad-hoc colour maps once collided. The only colour this
 * list spends is on health chips, via HEALTH_CLASS.
 */
const KIND_ICON: Record<TimelineKind, LucideIcon> = {
  field: FileEdit,
  stage: Flag,
  health: HeartPulse,
  gate: ShieldCheck,
  blocker: AlertCircle,
  playbook: ListChecks,
  meddpicc: ClipboardCheck,
  system: Sparkles,
};

const KIND_LABEL: Record<TimelineKind, string> = {
  field: "Field change",
  stage: "Stage",
  health: "Health",
  gate: "Gates",
  blocker: "Blockers",
  playbook: "Playbook",
  meddpicc: "MEDDPICC",
  system: "Lifecycle",
};

export interface TimelineListProps {
  rows: TimelineRow[];
  state: "loading" | "error" | "ready";
  onRetry?: () => void;
  /** Unpaged row count from the API's `meta.total`, when known. */
  total?: number;
  /** Present only while a larger page is still available. */
  onShowAll?: () => void;
  empty: { icon: LucideIcon; title: string; description: string };
  /** Accessible name for the list. */
  label: string;
}

/**
 * One before/after value chip. Truncated with CSS rather than by shortening the
 * string in adapters.ts: the audit log stores long text verbatim (the strategic
 * blueprint and speaker notes are unbounded, loss_reason and the AD360 notes run
 * to 2000 chars), so a paragraph would otherwise render as a wall of monospace
 * inside a chip. Clipping here keeps the value intact — `title` gives the whole
 * thing back on hover — and needs no list of "long" fields kept in sync.
 *
 * `min-w-0` is load-bearing, not defensive: the parent <li> is a flex row and
 * `truncate` sets white-space:nowrap, which makes a flex item's automatic
 * min-width equal the full text width. min-width beats max-width, so without it
 * the chip overflows the row instead of ellipsizing.
 */
function DetailValue({ value }: { value: string }) {
  return (
    <span
      title={value}
      className="min-w-0 max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] sm:max-w-[28rem]"
    >
      {value}
    </span>
  );
}

function HealthChip({ status }: { status: string | null }) {
  if (!status) return <DetailValue value="—" />;
  const cls = HEALTH_CLASS[status as Health];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px]",
        cls ? cls.text : "text-muted-foreground",
      )}
    >
      {cls ? <span className={cn("h-1.5 w-1.5 rounded-full", cls.dot)} /> : null}
      {status}
    </span>
  );
}

function Row({ row }: { row: TimelineRow }) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[row.kind] ?? CircleDot;
  const expandable = row.details.length > 0;

  const body = (
    <>
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-foreground">{row.title}</span>
          {row.health ? (
            <span className="inline-flex items-center gap-1">
              <HealthChip status={row.health.from} />
              <span className="text-muted-foreground">→</span>
              <HealthChip status={row.health.to} />
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {/* Time only: the day is already the group heading, so repeating the
              date on every row is noise. Full timestamp stays on hover. */}
          <span title={formatDateTime(row.at, "")}>{formatTime(row.at)}</span>
          {row.actor ? <> · by {row.actor}</> : null}
        </span>
      </span>
      {expandable ? (
        <ChevronRight
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        />
      ) : null}
    </>
  );

  return (
    <li className="border-l border-border pl-3">
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="-mx-2 flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/40"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-0 py-2">{body}</div>
      )}

      {expandable && open ? (
        <ul className="mb-2 ml-9 space-y-1">
          {row.details.map((d, i) => (
            <li key={`${d.label}-${i}`} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{d.label}</span>
              {d.text ? (
                <span className="text-foreground/90">{d.text}</span>
              ) : d.from != null || d.to != null ? (
                <>
                  <DetailValue value={d.from ?? "—"} />
                  <span className="text-muted-foreground">→</span>
                  <DetailValue value={d.to ?? "—"} />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TimelineList({
  rows,
  state,
  onRetry,
  total,
  onShowAll,
  empty,
  label,
}: TimelineListProps) {
  const [kind, setKind] = useState<TimelineKind | "all">("all");

  // Filtering is client-side over already-fetched rows. The activity endpoint
  // does support an event_type param, but a round-trip to filter <=200 rows
  // already in memory is slower and no more correct.
  const kindsPresent = useMemo(() => {
    const seen = new Set<TimelineKind>();
    for (const r of rows) seen.add(r.kind);
    return [...seen];
  }, [rows]);

  const visible = useMemo(
    () => (kind === "all" ? rows : rows.filter((r) => r.kind === kind)),
    [rows, kind],
  );

  const days = useMemo(() => {
    const out: { key: string; label: string; items: TimelineRow[] }[] = [];
    for (const r of visible) {
      const k = dayKey(r.at);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(r);
      else out.push({ key: k, label: dayLabel(r.at), items: [r] });
    }
    return out;
  }, [visible]);

  if (state === "loading") {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={`${label} loading`}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </EmptyMedia>
          {/* Mount-agnostic copy: this panel also renders on /memory/:id, where
              the deal may since have been deleted. */}
          <EmptyTitle>This deal's history didn't load</EmptyTitle>
          <EmptyDescription>
            The request failed. Nothing has been lost — try again.
          </EmptyDescription>
        </EmptyHeader>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="mr-2 h-4 w-4" /> Try again
          </Button>
        ) : null}
      </Empty>
    );
  }

  if (rows.length === 0) {
    const Icon = empty.icon;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle>{empty.title}</EmptyTitle>
          <EmptyDescription>{empty.description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const hasMore = total != null && total > rows.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {kindsPresent.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant={kind === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setKind("all")}
            >
              All
            </Button>
            {kindsPresent.map((k) => (
              <Button
                key={k}
                variant={kind === k ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {kind === "all"
              ? total != null && total > rows.length
                ? `Showing ${rows.length} of ${total}`
                : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`
              : `${visible.length} of ${rows.length} shown`}
          </span>
          {hasMore && onShowAll ? (
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onShowAll}>
              Show all
            </Button>
          ) : null}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing under {KIND_LABEL[kind as TimelineKind]}.{" "}
          <button type="button" className="underline" onClick={() => setKind("all")}>
            Show everything
          </button>
        </p>
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <section key={d.key}>
              <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {d.label}
              </h4>
              <ul aria-label={label}>
                {d.items.map((r) => (
                  <Row key={r.id} row={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

    </div>
  );
}

export { KIND_LABEL };
