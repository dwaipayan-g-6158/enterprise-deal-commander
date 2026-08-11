import { WelcomeBackSegment } from "./welcome-back-segment";
import { MissionSegment } from "./mission-segment";
import { TodaySegment } from "./today-segment";
import { InsightSegment } from "./insight-segment";
import { WeekSegment } from "./week-segment";

// Compacts the former stack of full-width dashboard cards ("Last session
// you", Insight Banner, Today, Today's Mission, Weekly Review — several
// hundred px combined) into a single bar. Each segment is a self-contained
// trigger + popover; `divide-x` draws a hairline only between segments that
// actually render (most segments can each render nothing — see their own
// "absent, not empty" gating), so no manual presence-tracking is needed here.
export function DailyBar({
  previousVisitAt,
  reportingCurrency,
}: {
  previousVisitAt: string | null | undefined;
  /** Passed through to WeekSegment, whose pipeline figures are money. */
  reportingCurrency: string;
}) {
  return (
    /**
     * `min-h-[44px]` and `empty:hidden`, and the pair is what keeps this bar from
     * moving the page underneath it.
     *
     * Every segment resolves its own query and renders nothing until it has one, so
     * the bar used to grow from a ~10px empty pill to its full height the moment the
     * first segment arrived, and everything below it moved. 44px is each segment
     * trigger's own `min-h` (they all carry it as a tap target), so reserving it
     * means later segments fill the row rather than resize it.
     *
     * `empty:hidden` covers the other half, and it also fixes something that was
     * already wrong: on a quiet day EVERY segment legitimately renders nothing —
     * that is their documented "absent, not empty" behaviour — and this bar still
     * drew a bordered pill with nothing in it. `:empty` matches exactly then,
     * because five nulls leave the div with no children at all. Without this,
     * reserving the height above would have made that empty pill five times taller.
     *
     * So: hidden while it has nothing, full height the moment it has anything, and
     * no step in between. The appearance itself lands behind AppReveal's mask on a
     * normal load.
     */
    <div className="flex min-h-[44px] flex-wrap items-center gap-x-1 gap-y-0.5 divide-x divide-border rounded-xl border bg-card text-card-foreground shadow px-1.5 py-1 empty:hidden">
      <WelcomeBackSegment previousVisitAt={previousVisitAt} />
      <MissionSegment />
      <TodaySegment />
      <InsightSegment />
      <WeekSegment reportingCurrency={reportingCurrency} />
    </div>
  );
}
