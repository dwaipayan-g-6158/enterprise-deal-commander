import type { ComponentType } from "react";
import type { PanelBodyProps } from "@/mobile/screens/deal/panel-screen";
import { StagePanel } from "@/mobile/screens/deal/panels/stage-panel";
import { AlertsPanel } from "@/mobile/screens/deal/panels/alerts-panel";
import { GatesPanel } from "@/mobile/screens/deal/panels/gates-panel";
import { PlaybookPanel } from "@/mobile/screens/deal/panels/playbook-panel";
import { MeddpiccPanel } from "@/mobile/screens/deal/panels/meddpicc-panel";
import { BlockersPanel, CoachingPanel } from "@/mobile/screens/deal/panels/risk-panels";
import {
  CompetitivePanel,
  ScorePanel,
  StakeholdersPanel,
  TrajectoryPanel,
} from "@/mobile/screens/deal/panels/intel-panels";
import {
  CrossSellPanel,
  EconomicsPanel,
  PricingPanel,
} from "@/mobile/screens/deal/panels/commercial-panels";
import { DecisionsPanel, HistoryPanel } from "@/mobile/screens/deal/panels/record-panels";

/**
 * Panel id → the component that renders it.
 *
 * Keyed by the same ids `DEAL_PANELS` declares, and `panels.test.ts` asserts the
 * two sets are identical in both directions. A panel in the table with no body
 * would push an empty screen; a body with no table entry would be unreachable
 * code that still costs bytes in the mobile chunk.
 *
 * Not lazy. Sixteen `React.lazy` boundaries would each add a suspense fallback
 * to a push that is already animating, and the whole set is a fraction of the
 * chunk the shell has already downloaded by the time anyone taps one.
 */
export const PANEL_BODIES: Record<string, ComponentType<PanelBodyProps>> = {
  stage: StagePanel,

  alerts: AlertsPanel,
  coaching: CoachingPanel,
  blockers: BlockersPanel,

  gates: GatesPanel,
  playbook: PlaybookPanel,
  meddpicc: MeddpiccPanel,

  score: ScorePanel,
  trajectory: TrajectoryPanel,
  competitive: CompetitivePanel,
  stakeholders: StakeholdersPanel,

  economics: EconomicsPanel,
  pricing: PricingPanel,
  "cross-sell": CrossSellPanel,

  history: HistoryPanel,
  decisions: DecisionsPanel,
};

