import { useState } from "react";
import { Link } from "wouter";
import { useGetAutopsy, useListLossArchetypes } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ArrowUpRight } from "lucide-react";

function compactUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function Autopsy() {
  const [archetypeId, setArchetypeId] = useState<string>("all");
  
  const { data: archetypesData } = useListLossArchetypes();
  const archetypes = archetypesData?.data || [];

  const { data: response, isLoading } = useGetAutopsy(archetypeId !== "all" ? { archetypeId: Number(archetypeId) } : undefined);
  const data = response?.data;

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Closed-Lost Autopsy</h1>
          <p className="text-muted-foreground mt-2">Learn from loss: post-mortem analysis and pattern recognition</p>
        </div>
        <div className="w-64">
          <Select value={archetypeId} onValueChange={setArchetypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by Archetype" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Archetypes</SelectItem>
              {archetypes.map(a => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.archetypeName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Analyzing losses...</div>
      ) : !data || data.byArchetype.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">No autopsy data available.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {data.byArchetype.map(arch => (
            <Card key={arch.archetypeId}>
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="text-xl flex justify-between items-center">
                  <span>{arch.archetypeName}</span>
                  <span className="text-sm font-normal text-muted-foreground font-mono">{arch.lossCount} deals</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-8">
                  <h4 className="text-sm font-medium mb-3 uppercase tracking-wider text-muted-foreground">
                    Lost Deals
                  </h4>
                  <div className="rounded-md border divide-y divide-border">
                    {arch.deals.map((d) => (
                      <Link
                        key={d.id}
                        href={`/deals/${d.id}`}
                        className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium group-hover:underline">
                            {d.dealName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.accountName}
                          </p>
                        </div>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {compactUSD(d.tcv)}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Avg Gate Completion</p>
                    <div className="flex items-center gap-3">
                      <Progress value={arch.avgGateCompletionPct} className="flex-1" />
                      <span className="font-mono font-medium">{arch.avgGateCompletionPct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Services Attach Rate</p>
                    <div className="flex items-center gap-3">
                      <Progress value={arch.servicesAttachShare * 100} className="flex-1" />
                      <span className="font-mono font-medium">{(arch.servicesAttachShare * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Never Passed Gate 2</p>
                    <div className="flex items-center gap-3">
                      <Progress value={arch.neverPassedGate2Share * 100} className="flex-1 bg-muted [&>div]:bg-destructive" />
                      <span className="font-mono font-medium text-destructive">{(arch.neverPassedGate2Share * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>

                {arch.patternsThatFired.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-3 uppercase tracking-wider text-muted-foreground">Dominant Risk Patterns</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pattern Code</TableHead>
                          <TableHead className="w-[200px]">Frequency in Loss</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {arch.patternsThatFired.map(p => (
                          <TableRow key={p.code}>
                            <TableCell className="font-mono text-sm font-medium">{p.code}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={p.share * 100} className="h-2 w-24" />
                                <span className="font-mono text-xs text-muted-foreground">{(p.share * 100).toFixed(0)}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}