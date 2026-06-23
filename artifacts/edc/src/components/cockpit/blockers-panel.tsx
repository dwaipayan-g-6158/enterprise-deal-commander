import { useState } from "react";
import {
  useListBlockers,
  useListBlockerCategories,
  useListBlockerSeverities,
  useCreateBlocker,
  useUpdateBlocker,
  useDeleteBlocker,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCockpitInvalidate } from "./use-invalidate";
import { Trash2, CheckCircle, ShieldX } from "lucide-react";

export function BlockersPanel({ dealId }: { dealId: string }) {
  const { toast } = useToast();
  const invalidate = useCockpitInvalidate(dealId);
  const { data: blockers } = useListBlockers(dealId);
  const { data: categories } = useListBlockerCategories();
  const { data: severities } = useListBlockerSeverities();
  const createBlocker = useCreateBlocker();
  const updateBlocker = useUpdateBlocker();
  const deleteBlocker = useDeleteBlocker();

  const [categoryId, setCategoryId] = useState("");
  const [severityId, setSeverityId] = useState("");
  const [description, setDescription] = useState("");

  const create = async () => {
    if (!categoryId || !severityId || description.trim().length < 6) return;
    try {
      await createBlocker.mutateAsync({
        dealId,
        data: {
          category_id: Number(categoryId),
          severity_id: Number(severityId),
          description: description.trim(),
        },
      });
      await invalidate();
      toast({ title: "Blocker logged", description: "New blocker added to the deal." });
      setDescription("");
      setCategoryId("");
      setSeverityId("");
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: "Failed", description: msg ?? "Could not log blocker.", variant: "destructive" });
    }
  };

  const resolve = async (blockerId: string) => {
    try {
      await updateBlocker.mutateAsync({ dealId, blockerId, data: { is_resolved: true } });
      await invalidate();
      toast({ title: "Blocker resolved" });
    } catch {
      toast({ title: "Failed", description: "Could not resolve blocker.", variant: "destructive" });
    }
  };

  const remove = async (blockerId: string) => {
    try {
      await deleteBlocker.mutateAsync({ dealId, blockerId });
      await invalidate();
      toast({ title: "Blocker deleted" });
    } catch {
      toast({ title: "Failed", description: "Could not delete blocker.", variant: "destructive" });
    }
  };

  const list = blockers?.data ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="font-semibold text-sm">Log a Blocker</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.data.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.categoryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Severity</Label>
              <Select value={severityId} onValueChange={setSeverityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  {severities?.data.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.severityName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the blocker (min 6 chars)"
            />
          </div>
          <Button
            size="sm"
            onClick={create}
            disabled={!categoryId || !severityId || description.trim().length < 6 || createBlocker.isPending}
          >
            Add Blocker
          </Button>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center">
            <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
            <p>No blockers logged.</p>
          </CardContent>
        </Card>
      ) : (
        list.map((b) => (
          <Card key={b.id} className={b.isResolved ? "opacity-60" : ""}>
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldX className={`h-5 w-5 shrink-0 mt-0.5 ${b.isResolved ? "text-muted-foreground" : "text-destructive"}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">{b.category}</Badge>
                  <Badge variant={b.isResolved ? "secondary" : "destructive"}>{b.severity}</Badge>
                  {b.isResolved && <Badge variant="secondary">Resolved</Badge>}
                </div>
                <p className="text-sm">{b.description}</p>
                {b.resolutionNotes && (
                  <p className="text-xs text-muted-foreground mt-1">Resolution: {b.resolutionNotes}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {!b.isResolved && (
                  <Button size="sm" variant="outline" onClick={() => resolve(b.id)} disabled={updateBlocker.isPending}>
                    Resolve
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => remove(b.id)} disabled={deleteBlocker.isPending}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
