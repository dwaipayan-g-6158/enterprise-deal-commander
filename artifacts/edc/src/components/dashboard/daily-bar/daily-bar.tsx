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
}: {
  previousVisitAt: string | null | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 divide-x divide-border rounded-xl border bg-card text-card-foreground shadow px-1.5 py-1">
      <WelcomeBackSegment previousVisitAt={previousVisitAt} />
      <MissionSegment />
      <TodaySegment />
      <InsightSegment />
      <WeekSegment />
    </div>
  );
}
