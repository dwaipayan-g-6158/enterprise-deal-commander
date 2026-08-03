import { Pie, PieChart, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { OUTCOME_HSL } from "@/lib/semantic-colors";

const config: ChartConfig = {
  won: { label: "Won", color: OUTCOME_HSL.won },
  lost: { label: "Lost", color: OUTCOME_HSL.lost },
};

export function WinLossDonut({ won, lost }: { won: number; lost: number }) {
  const data = [
    { key: "won", value: won, fill: OUTCOME_HSL.won },
    { key: "lost", value: lost, fill: OUTCOME_HSL.lost },
  ];
  return (
    <ChartContainer config={config} className="mx-auto aspect-square max-h-[200px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={55} strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
