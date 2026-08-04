import { useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { haptic } from "@/mobile/lib/haptics";

/**
 * One merged sample from /analytics/deals/:id/trajectory. The payload is an
 * open record in the contract, and every metric carries forward independently,
 * so each field has to tolerate being absent.
 */
export interface TrajectoryPoint {
  at: string;
  score: number | null;
  gatePct: number | null;
  health: string | null;
  stage: string | null;
  tcv: number | null;
}

export interface TrajectoryStageChange {
  at: string;
  to: string | null;
}

/** Drawn in a normalised x-space and stretched to fit; see the note below. */
const VIEW_W = 1000;
const VIEW_H = 100;
const PAD_Y = 8;

function toTime(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * A deal's history, scrubbable.
 *
 * Drag the playhead and the figures above rewind to that date — this is a
 * read of history, not a projection, and it writes nothing. Notches on the
 * track mark where the deal changed stage, so the shape of the line can be
 * matched to what actually happened to it.
 *
 * Gesture is plain pointer events with a CSS spring on release rather than an
 * animation library. A drag mapped straight onto an index needs no physics of
 * its own, and the one thing that does — the playhead settling back to today
 * — is a single transition. The mobile chunk stays free of a runtime it would
 * use in exactly one place.
 *
 * `touch-action: none` on the track is load-bearing: without it a horizontal
 * drag scrolls the screen instead of scrubbing.
 */
export function TrajectoryScrubber({
  points,
  stageChanges,
  index,
  onScrub,
  className,
}: {
  /** Chronological. Points without a score are dropped by the caller. */
  points: TrajectoryPoint[];
  stageChanges: TrajectoryStageChange[];
  /** Index being scrubbed, or null when released. */
  index: number | null;
  onScrub: (index: number | null) => void;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const geometry = useMemo(() => {
    const scores = points.map((p) => p.score ?? 0);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    // A flat series would divide by zero; draw it down the middle instead.
    const span = max - min || 1;
    const stepX = VIEW_W / Math.max(points.length - 1, 1);
    const y = (v: number) => PAD_Y + (VIEW_H - PAD_Y * 2) * (1 - (v - min) / span);

    const line = scores
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(" ");

    // Stage changes are timestamped, not indexed, so they land by time.
    const first = toTime(points[0].at);
    const last = toTime(points[points.length - 1].at);
    const range = last - first || 1;
    const notches = stageChanges
      .map((c) => ((toTime(c.at) - first) / range) * 100)
      .filter((pct) => pct >= 0 && pct <= 100);

    return {
      line,
      area: `${line} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z`,
      notches,
      pctFor: (i: number) => (i / Math.max(points.length - 1, 1)) * 100,
      rising: scores[scores.length - 1] >= scores[0],
    };
  }, [points, stageChanges]);

  const indexAt = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return 0;
      const t = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return Math.round(t * (points.length - 1));
    },
    [points.length],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    onScrub(indexAt(e.clientX));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    onScrub(indexAt(e.clientX));
  };

  const release = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    haptic();
    onScrub(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const last = points.length - 1;
    const from = index ?? last;
    if (e.key === "ArrowLeft") onScrub(Math.max(from - 1, 0));
    else if (e.key === "ArrowRight") onScrub(Math.min(from + 1, last));
    else if (e.key === "Home") onScrub(0);
    else if (e.key === "End") onScrub(last);
    else if (e.key === "Escape") onScrub(null);
    else return;
    e.preventDefault();
  };

  const active = index != null ? points[index] : null;
  const playheadPct = geometry.pctFor(index ?? points.length - 1);
  const stroke = geometry.rising ? "stroke-emerald-500" : "stroke-orange-500";

  return (
    <section className={cn("select-none", className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Deal trajectory. Drag to see the deal as it was on an earlier date."
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={index ?? points.length - 1}
        aria-valuetext={`${formatDate(active?.at ?? points[points.length - 1].at, "—")}${
          active?.score != null ? `, score ${Math.round(active.score)}` : ""
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={onKeyDown}
        className={cn(
          "relative h-14 w-full cursor-ew-resize touch-none rounded-md",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {/* preserveAspectRatio none stretches the normalised x-space to
            whatever width the card is; non-scaling-stroke keeps the line 2px
            through that stretch. Anything that must stay round — the notches,
            the playhead dot — is an HTML element on top instead. */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={geometry.area}
            className={geometry.rising ? "fill-emerald-500/10" : "fill-orange-500/10"}
          />
          <path
            d={geometry.line}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className={stroke}
          />
        </svg>

        {geometry.notches.map((pct, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="absolute bottom-0 top-0 w-px bg-foreground opacity-15"
            style={{ left: `${pct}%` }}
          />
        ))}

        {/* The playhead. Untransitioned while the finger is down so it tracks
            exactly, sprung back to today on release. */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bottom-0 top-0 w-px bg-primary",
            index == null ? "opacity-0" : "opacity-90",
          )}
          style={{
            left: `${playheadPct}%`,
            transition: index == null ? "left 320ms var(--m-ease-spring), opacity 180ms" : "none",
          }}
        >
          <span className="absolute -left-[3px] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-primary" />
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        {active ? (
          <>
            <span className="m-caption truncate">
              {formatDate(active.at, "—")}
              {active.stage ? <span className="m-muted"> · {active.stage}</span> : null}
            </span>
            <span className="m-caption m-muted shrink-0">
              {active.score != null ? `Score ${Math.round(active.score)}` : "No score"}
              {active.gatePct != null ? ` · Gates ${Math.round(active.gatePct)}%` : ""}
            </span>
          </>
        ) : (
          <>
            <span className="m-label">Trajectory</span>
            <span className="m-caption m-muted shrink-0">Drag to rewind</span>
          </>
        )}
      </div>
    </section>
  );
}
