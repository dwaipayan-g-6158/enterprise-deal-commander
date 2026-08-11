import { useEffect, useRef } from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultStore } from "@/lib/storage";
import { getTimeBand } from "@/lib/greetings/time-bands";
import GREETING_POOL from "@/lib/greetings/greeting-pool.json";
import {
  selectGreeting,
  type GreetingContext,
  type GreetingPool,
} from "@/lib/greetings/select-greeting";
import { readShownHistory, recordShown } from "@/lib/greetings/shown-history";
import { CountUp } from "@/mobile/components/count-up";
import { Shimmer } from "@/mobile/components/shimmer";
import type { Verdict } from "@/mobile/screens/command/verdict";

/**
 * The top of the screen: who you are, how the portfolio is, and the one number
 * that says so.
 *
 * Rendered on the shell's own canvas rather than inside a card. The ambient
 * time-of-day wash is painted on the frame, and letting the first block sit
 * directly on it is what makes the screen open as a page rather than as the top
 * of a list of boxes — which is the difference between "editorial" and "widget
 * grid" in practice, not a metaphor.
 */
export function VerdictBlock({
  greetingContext,
  greetingReady,
  streak,
  verdict,
  money,
}: {
  greetingContext: GreetingContext;
  /** Hold the greeting until its inputs have settled — see the lock below. */
  greetingReady: boolean;
  streak: number;
  verdict: Verdict | null;
  money: (n: number) => string;
}) {
  const greeting = useLockedGreeting(greetingContext, greetingReady);
  const [headline, ...rest] = (greeting?.text ?? "").split("\n");
  const subline = rest.join(" ");

  return (
    <section className="px-4 pb-2 pt-4">
      {greeting ? (
        <div className="m-appear">
          <h2 className="m-display text-balance">{headline}</h2>
          {subline ? <p className="m-body m-muted mt-1.5 text-pretty">{subline}</p> : null}
        </div>
      ) : (
        <>
          <Shimmer className="h-8 w-64" />
          <Shimmer className="mt-2 h-4 w-48" />
        </>
      )}

      {streak > 0 ? (
        <p className="m-caption m-muted mt-2 inline-flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" />
          {streak} day{streak === 1 ? "" : "s"} active
        </p>
      ) : null}

      {verdict ? (
        <div className="m-appear mt-5">
          {verdict.figure ? (
            <p
              className={cn(
                "m-hero m-num",
                verdict.tone === "critical" && "text-destructive",
              )}
            >
              {verdict.figure.kind === "money" ? (
                <CountUp value={verdict.figure.value} format={money} valueKey="command-verdict" />
              ) : (
                verdict.figure.value
              )}
            </p>
          ) : null}
          <p
            className={cn(
              "text-pretty",
              // The verdict is the sentence. When there is no figure above it,
              // it IS the headline of the block and is sized accordingly.
              verdict.figure ? "m-body mt-1" : "m-headline mt-1",
            )}
          >
            {verdict.sentence}
          </p>
        </div>
      ) : (
        <Shimmer className="mt-5 h-12 w-52" />
      )}
    </section>
  );
}

/**
 * Picks a greeting once per visit and holds it.
 *
 * `selectGreeting` draws on un-memoized `Math.random()`, and the queries feeding
 * its context settle one after another — so recomputing on render would let the
 * headline change two or three times while the screen loads, and would record a
 * different greeting as "shown" each time. The desktop hero carries the same
 * lock and the same reasoning; this is the phone's copy of it, not a new idea.
 *
 * `ready` gates on the queries having SETTLED, not on their data being present:
 * the QueryClient runs with `retry: false`, so after a failure `data` stays
 * undefined forever while `isLoading` still flips. Gating on data would strand
 * the greeting on its shimmer permanently after one transient failure.
 */
function useLockedGreeting(
  context: GreetingContext,
  ready: boolean,
): { id: string; text: string } | null {
  const lockRef = useRef<{ id: string; text: string } | null>(null);

  if (ready && lockRef.current === null) {
    const now = new Date();
    lockRef.current = selectGreeting(
      GREETING_POOL as GreetingPool,
      getTimeBand(now),
      context,
      readShownHistory(defaultStore, now),
    );
  }

  const lockedId = lockRef.current?.id;
  useEffect(() => {
    if (!lockedId) return;
    recordShown(defaultStore, lockedId, new Date());
    // Fires exactly once, the moment the greeting locks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedId]);

  return lockRef.current;
}
