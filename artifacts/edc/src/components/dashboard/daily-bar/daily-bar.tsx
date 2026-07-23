import { MissionSegment } from "./mission-segment";
import { TodaySegment } from "./today-segment";
import { InsightSegment } from "./insight-segment";

// Compacts the former stack of three full-width dashboard cards (Insight
// Banner, "Today", "Today's Mission" — up to ~500px combined) into a single
// ~52px bar. Each segment is a self-contained trigger + popover; `divide-x`
// draws a hairline only between segments that actually render (Today and
// Insight can each render nothing — see their own "absent, not empty" gating
// — while Mission always renders at least its empty state), so no manual
// presence-tracking is needed here.
export function DailyBar() {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 divide-x divide-border rounded-xl border bg-card text-card-foreground shadow px-1.5 py-1">
      <MissionSegment />
      <TodaySegment />
      <InsightSegment />
    </div>
  );
}
