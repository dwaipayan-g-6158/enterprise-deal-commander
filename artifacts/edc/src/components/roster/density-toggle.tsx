import { Rows3, Rows4, Menu } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DENSITY_LABEL } from "./density";
import type { Density } from "./model/roster-types";

const ICON: Record<Density, typeof Rows3> = {
  comfortable: Rows3,
  compact: Rows4,
  ultra: Menu,
};

const ORDER: Density[] = ["comfortable", "compact", "ultra"];

export function DensityToggle({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
  return (
    <ToggleGroup
      type="single"
      value={density}
      onValueChange={(v) => v && onChange(v as Density)}
      variant="outline"
      size="sm"
      aria-label="Row density"
    >
      {ORDER.map((d) => {
        const Icon = ICON[d];
        return (
          <Tooltip key={d}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={d} aria-label={DENSITY_LABEL[d]} className="cursor-pointer">
                <Icon className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{DENSITY_LABEL[d]}</TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
