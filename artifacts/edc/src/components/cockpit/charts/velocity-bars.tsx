import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { classifyVelocity } from "./transforms";

const config: ChartConfig = { days: { label: "Days in stage" } };

const colorFor = (delta: number) => {
  const k = classifyVelocity(delta);
  if (k === "behind") return "hsl(var(--destructive))";
  if (k === "ahead") return "hsl(var(--chart-2))";
  return "hsl(var(--chart-1))";
};

export function VelocityBars({
  deals,
}: {
  deals: { dealName: string; daysInStage: number; benchmarkDays: number; deltaDays: number }[];
}) {
  const data = deals.map((d) => ({ name: d.dealName, days: d.daysInStage, delta: d.deltaDays }));
  return (
    <ChartContainer config={config} className="aspect-[16/7] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="days" radius={4}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFor(d.delta)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
