import { PipelinePulse } from "./pipeline-pulse";
import { CoverageTracker } from "./coverage-tracker";
import { PipelineFunnel } from "./pipeline-funnel";
import { ConversionMatrix } from "./conversion-matrix";
import { TransitionSankey } from "./transition-sankey";
import { RecycleExit } from "./recycle-exit";

export function FlowAnalytics() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <PipelinePulse />
        <div className="space-y-4">
          <CoverageTracker />
          <PipelineFunnel />
        </div>
      </div>
      <ConversionMatrix />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TransitionSankey />
        <RecycleExit />
      </div>
    </div>
  );
}
