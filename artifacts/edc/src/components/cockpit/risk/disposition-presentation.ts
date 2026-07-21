import { AlarmClock, Eye, ShieldCheck, type LucideIcon } from "lucide-react";
import type { AlertDispositionState } from "@workspace/api-client-react";

export interface DispositionPresentation {
  Icon: LucideIcon;
  label: string;
  /** Icon + heading color (theme-aware, dark variant included). */
  text: string;
  /** Tinted background for the section header / icon chip. */
  bg: string;
}

/**
 * Pure map: disposition state -> lucide icon + label + semantic color.
 * Deliberately distinct from the RED/YELLOW severity palette (risk-model.ts)
 * so a disposition never reads as a severity level. Ordered snooze -> ack ->
 * accept, matching DISPOSITION_PRIORITY below (time-boxed and still-live
 * concerns surface above settled decisions).
 */
export const DISPOSITION_PRESENTATION: Record<AlertDispositionState, DispositionPresentation> = {
  snooze: {
    Icon: AlarmClock,
    label: "Snoozed",
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/12",
  },
  acknowledge: {
    Icon: Eye,
    label: "Acknowledged",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/12",
  },
  accept: {
    Icon: ShieldCheck,
    label: "Accepted",
    text: "text-muted-foreground",
    bg: "bg-muted",
  },
};

/** Managed-risk section order: time-boxed/still-live concerns before settled decisions. */
export const DISPOSITION_PRIORITY: AlertDispositionState[] = ["snooze", "acknowledge", "accept"];
