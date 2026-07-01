import { useEffect, useState } from "react";
import { useUpdateDealMemory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AutopsyForm } from "@/components/memory/autopsy-form";

interface MemoryDetail {
  id: string;
  dealId: string;
  dealName: string;
  outcome: string;
  winLossNarrative?: string | null;
  keyLessons?: string[] | null;
  tags?: string[] | null;
  primaryLossCategory?: string | null;
  lossSubcategory?: string | null;
  lossNarrative?: string | null;
  winningCompetitorId?: number | null;
  winBackPotential?: number | null;
  winBackTimeline?: string | null;
  decisionMakerEngaged?: boolean | null;
  championIdentified?: boolean | null;
  causalChain?: string[] | null;
  productGaps?: string[] | null;
}

export function NarrativeTab({ memory: m }: { memory: MemoryDetail }) {
  const { toast } = useToast();
  const updateMemory = useUpdateDealMemory();
  const [narrative, setNarrative] = useState(m.winLossNarrative ?? "");
  const [lessons, setLessons] = useState((m.keyLessons ?? []).join("\n"));
  const [tags, setTags] = useState((m.tags ?? []).join(", "));

  useEffect(() => {
    setNarrative(m.winLossNarrative ?? "");
    setLessons((m.keyLessons ?? []).join("\n"));
    setTags((m.tags ?? []).join(", "));
  }, [m.id]);

  const save = async () => {
    try {
      await updateMemory.mutateAsync({
        id: m.id,
        data: {
          win_loss_narrative: narrative || undefined,
          key_lessons: lessons.split("\n").map((l) => l.trim()).filter(Boolean),
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        } as never,
      });
      toast({ title: "Saved" });
    } catch {
      toast({ title: "Could not save", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-lg">Narrative & Lessons</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Win/Loss Narrative</Label>
            <Textarea rows={4} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Key Lessons (one per line)</Label>
            <Textarea rows={3} value={lessons} onChange={(e) => setLessons(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <Button onClick={save} disabled={updateMemory.isPending}>
            {updateMemory.isPending ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      {m.outcome === "Lost" && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Closed-Lost Autopsy</CardTitle></CardHeader>
          <CardContent>
            <AutopsyForm dealId={m.dealId} dealName={m.dealName} memoryRow={m} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
