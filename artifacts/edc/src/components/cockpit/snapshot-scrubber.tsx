import { useState } from "react";
import {
  useGetSnapshot,
  getGetSnapshotQueryKey,
  type Intelligence,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { History, X, Check, Circle } from "lucide-react";

export function SnapshotScrubber({
  dealId,
  intel,
}: {
  dealId: string;
  intel: Intelligence;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>("");
  const active = date !== "" && date !== today;

  const { data, isLoading, isError } = useGetSnapshot(
    dealId,
    { date: date || today },
    {
      query: {
        enabled: active,
        queryKey: getGetSnapshotQueryKey(dealId, { date: date || today }),
      },
    },
  );

  const snapshot = data?.data;
  const currentByCode = new Map(
    intel.technicalTrack.gates.map((g) => [g.gateCode, g.isCompleted]),
  );

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2 flex-wrap">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <History className="h-4 w-4" />
        <span>Point-in-time view</span>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            {active ? new Date(date).toLocaleDateString() : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <Input
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </PopoverContent>
      </Popover>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => setDate("")}
        >
          <X className="h-4 w-4 mr-1" /> Back to today
        </Button>
      )}

      {active && (
        <div className="flex items-center gap-2 ml-auto text-sm">
          {isLoading ? (
            <span className="text-muted-foreground">Reconstructing...</span>
          ) : isError ? (
            <span className="text-destructive">Could not load snapshot</span>
          ) : snapshot ? (
            <>
              <Badge variant="secondary">
                Stage: {snapshot.salesStage}
              </Badge>
              <Badge variant="secondary">
                {snapshot.gates.filter((g) => g.isCompleted).length}/
                {snapshot.gates.length} gates
              </Badge>
              {snapshot.reconstructed && (
                <Badge variant="outline">reconstructed</Badge>
              )}
            </>
          ) : null}
        </div>
      )}

      {active && snapshot && !isLoading && (
        <div className="w-full pt-2 mt-1 border-t">
          <p className="text-xs text-muted-foreground mb-2">
            Gate state as of {new Date(snapshot.asOf).toLocaleString()}
            {" — "}changes since then are highlighted.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {snapshot.gates.map((g) => {
              const now = currentByCode.get(g.gateCode);
              const changed = now !== undefined && now !== g.isCompleted;
              return (
                <div
                  key={g.gateCode}
                  className="flex items-center gap-2 text-sm py-0.5"
                >
                  {g.isCompleted ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className={changed ? "font-medium" : "text-muted-foreground"}>
                    {g.label}
                  </span>
                  {changed && (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {now ? "now complete" : "now incomplete"}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
