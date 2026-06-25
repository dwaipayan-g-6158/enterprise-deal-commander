import { useEffect, useRef, useState } from "react";
import {
  useListGates,
  useListGateDefinitions,
  useUpdateGatesBatch,
  type IntegrityWarning,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCockpitInvalidate } from "./use-invalidate";
import { AlertTriangle } from "lucide-react";

export function TechnicalGates({
  dealId,
  progressPercentage,
  integrityWarnings,
  onSaveRef,
}: {
  dealId: string;
  progressPercentage: number;
  integrityWarnings: IntegrityWarning[];
  onSaveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}) {
  const { toast } = useToast();
  const invalidate = useCockpitInvalidate(dealId);
  const { data: gates } = useListGates(dealId);
  const { data: definitions } = useListGateDefinitions();
  const updateBatch = useUpdateGatesBatch();

  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (gates?.data) {
      const next: Record<string, boolean> = {};
      for (const g of gates.data) next[g.gateCode] = g.isCompleted;
      setDraft(next);
    }
  }, [gates?.data]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const defByCode = new Map((definitions?.data ?? []).map((d) => [d.gateCode, d]));
  const list = gates?.data ?? [];
  const dirty = list.some((g) => draft[g.gateCode] !== g.isCompleted);

  const saveWithDraft = async (currentDraft: Record<string, boolean>) => {
    const updates = list
      .filter((g) => currentDraft[g.gateCode] !== g.isCompleted)
      .map((g) => ({ gate_code: g.gateCode, is_completed: currentDraft[g.gateCode] }));
    if (updates.length === 0) return;
    try {
      const res = await updateBatch.mutateAsync({ dealId, data: { updates } });
      await invalidate();
      const warnings = res.integrityWarnings ?? [];
      if (warnings.length > 0) {
        toast({
          title: "Gates saved with warnings",
          description: warnings.map((w) => w.message).join(" "),
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: "Save failed", description: msg ?? "Could not update gates.", variant: "destructive" });
      // Roll the draft back to the server's last-known state on failure.
      if (gates?.data) {
        const reset: Record<string, boolean> = {};
        for (const g of gates.data) reset[g.gateCode] = g.isCompleted;
        setDraft(reset);
      }
    }
  };

  const handleToggle = (gateCode: string, value: boolean) => {
    const newDraft = { ...draft, [gateCode]: value };
    setDraft(newDraft);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void saveWithDraft(newDraft), 500);
  };

  const manualSave = async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!dirty) return;
    await saveWithDraft(draft);
    toast({ title: "Gates updated", description: "Technical track progress saved." });
  };

  // Expose the manual save so the cockpit's Ctrl+S can flush pending changes.
  useEffect(() => {
    if (onSaveRef) onSaveRef.current = manualSave;
  });

  const groups = [...new Set(list.map((g) => g.gateGroup))].sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex justify-between items-center">
          <span>Gate Progress</span>
          <span className="font-mono text-xl">{progressPercentage}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {integrityWarnings.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
            {integrityWarnings.map((w, idx) => (
              <div key={idx} className="flex gap-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        {groups.map((group) => (
          <div key={group} className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Phase {group}
            </p>
            {list
              .filter((g) => g.gateGroup === group)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((gate) => {
                const def = defByCode.get(gate.gateCode);
                const prereqs = def?.prerequisiteGateCodes ?? gate.prerequisiteGateCodes ?? [];
                return (
                  <label
                    key={gate.gateCode}
                    className="flex items-start gap-3 p-3 bg-muted/50 rounded-md border cursor-pointer"
                  >
                    <Checkbox
                      checked={draft[gate.gateCode] ?? false}
                      onCheckedChange={(c) => handleToggle(gate.gateCode, c === true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{gate.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">{gate.gateCode}</p>
                      {prereqs.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Requires: {prereqs.join(", ")}
                        </p>
                      )}
                    </div>
                    {gate.isCompleted && <Badge variant="outline">Complete</Badge>}
                  </label>
                );
              })}
          </div>
        ))}

        <Button onClick={manualSave} disabled={!dirty || updateBatch.isPending}>
          {updateBatch.isPending ? "Saving..." : "Save Gate Progress"}
        </Button>
      </CardContent>
    </Card>
  );
}
