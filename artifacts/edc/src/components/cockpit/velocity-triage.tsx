import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import { meterGeometry } from "./charts/transforms";

export interface TriageDeal {
  id: string;
  dealName: string;
  accountName: string;
  stage: string;
  daysInStage: number;
  benchmarkDays: number;
  deltaDays: number;
  velocity: string;
}

const VEL: Record<string, { label: string; cls: string; Icon: LucideIcon }> = {
  SLOW: { label: "SLOW", cls: "bg-destructive text-white", Icon: ArrowUp },
  FAST: { label: "FAST", cls: "bg-emerald-500 text-white", Icon: ArrowDown },
  NORMAL: { label: "ON", cls: "bg-muted text-muted-foreground", Icon: Minus },
};

function meterAria(deal: TriageDeal): string {
  if (deal.deltaDays > 0)
    return `${deal.daysInStage} days in stage, benchmark ${deal.benchmarkDays}, ${deal.deltaDays} days overdue`;
  if (deal.deltaDays < 0)
    return `${deal.daysInStage} days in stage, benchmark ${deal.benchmarkDays}, ${Math.abs(deal.deltaDays)} days ahead of benchmark`;
  return `${deal.daysInStage} days in stage, exactly at benchmark ${deal.benchmarkDays}`;
}

function VarianceMeter({ deal, scaleMax }: { deal: TriageDeal; scaleMax: number }) {
  const g = meterGeometry(deal, scaleMax);
  return (
    <div
      className="relative h-2 w-full min-w-[80px] rounded-full bg-muted/40"
      role="img"
      aria-label={meterAria(deal)}
    >
      {g.tone === "behind" ? (
        <>
          <div
            className="absolute inset-y-0 left-0 rounded-l-full bg-muted-foreground/40"
            style={{ width: `${g.benchmarkPct}%` }}
          />
          <div
            className="absolute inset-y-0 rounded-r-full bg-destructive"
            style={{ left: `${g.benchmarkPct}%`, width: `${g.overflowPct}%` }}
          />
        </>
      ) : (
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${g.tone === "ahead" ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
          style={{ width: `${g.fillPct}%` }}
        />
      )}
      <div
        className="absolute inset-y-[-2px] w-0.5 bg-foreground/60"
        style={{ left: `${g.benchmarkPct}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

export function VelocityTriageTable({
  deals,
  onSelect,
}: {
  deals: TriageDeal[];
  onSelect: (id: string) => void;
}) {
  const scaleMax = Math.max(...deals.map((d) => d.daysInStage), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-muted-foreground border-b">
            <th className="text-left py-2 font-medium">Deal</th>
            <th className="text-left py-2 font-medium hidden sm:table-cell">Stage</th>
            <th className="text-left py-2 font-medium w-[40%]">Variance</th>
            <th className="text-right py-2 font-medium">Delta</th>
            <th className="text-right py-2 font-medium hidden sm:table-cell">Velocity</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const v = VEL[d.velocity] ?? VEL.NORMAL;
            return (
              <tr
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(d.id);
                  }
                }}
                className="border-b cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <td className="py-2 pr-3">
                  <span className="font-medium">{d.dealName}</span>
                  <span className="text-muted-foreground"> · {d.accountName}</span>
                </td>
                <td className="py-2 pr-3 hidden sm:table-cell text-muted-foreground">{d.stage}</td>
                <td className="py-2 pr-3">
                  <VarianceMeter deal={d} scaleMax={scaleMax} />
                </td>
                <td
                  className={`py-2 pl-3 text-right font-mono whitespace-nowrap ${
                    d.deltaDays > 0 ? "text-destructive" : d.deltaDays < 0 ? "text-emerald-600" : "text-muted-foreground"
                  }`}
                >
                  {d.deltaDays > 0 ? `+${d.deltaDays}d` : `${d.deltaDays}d`}
                </td>
                <td className="py-2 pl-3 text-right hidden sm:table-cell">
                  <Badge className={v.cls}>
                    <v.Icon className="h-3 w-3 mr-1" />
                    {v.label}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
