import { dealEvents } from "../events";
import { scoreDeal } from "../scoring";

// Eager predictive scoring. The score depends on gate progress, blockers, stage,
// days-in-stage and economics — so any event that changes those re-scores the
// deal and persists a fresh `deal_scores` row. This keeps the roster's Score
// column populated without waiting for someone to open a deal's Score tab.
const RESCORE_ON = new Set<string>([
  "deal.created",
  "deal.updated",
  "deal.stage_changed",
  "gate.toggled",
  "blocker.created",
  "blocker.resolved",
  "playbook.step_changed",
  "playbook.assigned",
]);

export function registerScoring(): () => void {
  return dealEvents.on(async (event) => {
    if (!RESCORE_ON.has(event.type)) return;
    await scoreDeal(event.dealId);
  });
}
