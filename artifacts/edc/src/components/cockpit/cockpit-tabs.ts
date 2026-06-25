import type { LucideIcon } from "lucide-react";
import { ShieldAlert, Activity, Gauge, DollarSign, ScrollText } from "lucide-react";

export interface SubTab { id: string; label: string }
export interface TabGroup { id: string; label: string; icon: LucideIcon; subs: SubTab[] }

export const COCKPIT_GROUPS: TabGroup[] = [
  { id: "risk", label: "Risk", icon: ShieldAlert, subs: [
      { id: "risk", label: "Alerts" },
      { id: "coaching", label: "Coaching" },
      { id: "blockers", label: "Blockers" },
  ] },
  { id: "validation", label: "Validation", icon: Activity, subs: [
      { id: "technical", label: "Technical Gates" },
      { id: "playbook", label: "Playbook" },
  ] },
  { id: "intel", label: "Intelligence", icon: Gauge, subs: [
      { id: "score", label: "Score" },
      { id: "competitive", label: "Competitive" },
      { id: "stakeholders", label: "Stakeholders" },
  ] },
  { id: "commercial", label: "Commercial", icon: DollarSign, subs: [
      { id: "pricing", label: "Pricing" },
      { id: "crosssell", label: "Cross-Sell" },
  ] },
  { id: "record", label: "Record", icon: ScrollText, subs: [
      { id: "activity", label: "Activity" },
      { id: "decisions", label: "Decisions" },
      { id: "history", label: "History" },
  ] },
];

/** Map a sub-tab id back to its group id (for default selection / deep-linking). */
export function groupForSub(subId: string): string | undefined {
  return COCKPIT_GROUPS.find((g) => g.subs.some((s) => s.id === subId))?.id;
}

/** Count active RED alerts for the Risk tab badge. */
export function alertCount(alerts: { severity?: string }[] | undefined): number {
  return (alerts ?? []).filter((a) => a.severity === "RED").length;
}
