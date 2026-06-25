import { Pie, PieChart, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = {
  won: { label: "Won", color: "hsl(var(--chart-2))" },
  lost: { label: "Lost", color: "hsl(var(--destructive))" },
};

export function WinLossDonut({ won, lost }: { won: number; lost: number }) {
  const data = [
    { key: "won", value: won, fill: "hsl(var(--chart-2))" },
    { key: "lost", value: lost, fill: "hsl(var(--destructive))" },
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
