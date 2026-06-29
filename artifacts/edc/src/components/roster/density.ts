import type { Density } from "./model/roster-types";

// Density controls only vertical rhythm + base font size; column set is
// unchanged. Kept tiny + central so the table, group headers and card list agree.
export const DENSITY_PAD: Record<Density, string> = {
  comfortable: "py-3",
  compact: "py-1.5",
  ultra: "py-0.5",
};

export const DENSITY_TEXT: Record<Density, string> = {
  comfortable: "text-sm",
  compact: "text-sm",
  ultra: "text-xs",
};

export const DENSITY_LABEL: Record<Density, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
  ultra: "Ultra",
};

export const DENSITIES: Density[] = ["comfortable", "compact", "ultra"];
