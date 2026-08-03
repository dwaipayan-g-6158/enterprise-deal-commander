import { useGetCompetitiveLoss } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Swords } from "lucide-react";
import { compactUSD } from "@/lib/format";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";

export function CompetitiveLossPanel() {
  // Typed response (GetCompetitiveLossResponse, generated from the
  // CompetitiveLoss schema) — was GenericDataResponse, cast with `as` to
  // local interfaces that could silently drift from the server shape.
  const { data: response, isLoading, isError } = useGetCompetitiveLoss();
  const data = response?.data;
  const byCompetitor = data?.byCompetitor ?? [];
  const matrix = data?.matrix ?? [];
  const suites = [...new Set(matrix.map((m) => m.suite))].sort();
  const competitorNames = [...new Set(matrix.map((m) => m.competitorName))].sort();
  const cellFor = (suite: string, name: string) => matrix.find((m) => m.suite === suite && m.competitorName === name);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Competitive Loss Intelligence
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Aggregated from the Competitive tab tracked on each deal. Only deals that have actually closed
            Closed-Won/Closed-Lost count — a competitor tagged on a still-open deal isn't booked as a win or loss yet.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Aggregating competitive data...</div>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Competitive data didn't load. Try refreshing the page.</p>
          ) : byCompetitor.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Swords className="h-5 w-5" /></EmptyMedia>
                <EmptyTitle>No competitive losses tracked</EmptyTitle>
                <EmptyDescription>Track competitors on individual deals to populate this view.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competitor</TableHead>
                  <TableHead>Losses</TableHead>
                  <TableHead>Lost TCV</TableHead>
                  <TableHead>Top Archetype</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCompetitor.map((c) => (
                  <TableRow key={c.competitorId}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono tabular-nums">{c.lossCount}</TableCell>
                    <TableCell className="font-mono tabular-nums">{compactUSD(c.lossTcv)}</TableCell>
                    <TableCell className="text-muted-foreground">{c.topArchetype ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {suites.length > 0 && competitorNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Win/Loss Matrix</CardTitle>
            <p className="text-sm text-muted-foreground">
              Raw win/loss counts by product suite and competitor — shown as counts, not rates, given the current data volume.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Suite</TableHead>
                  {competitorNames.map((name) => (
                    <TableHead key={name} className="text-center">{name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {suites.map((suite) => (
                  <TableRow key={suite}>
                    <TableCell className="font-medium">{suite}</TableCell>
                    {competitorNames.map((name) => {
                      const cell = cellFor(suite, name);
                      return (
                        <TableCell key={name} className="text-center font-mono text-xs tabular-nums">
                          {cell ? (
                            <span>
                              <span className={OUTCOME_CLASS.won.text}>{cell.wins}W</span>
                              {" / "}
                              <span className={OUTCOME_CLASS.lost.text}>{cell.losses}L</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
