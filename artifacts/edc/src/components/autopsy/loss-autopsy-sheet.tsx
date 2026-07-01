import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSearchDealMemory,
  useUpdateDealMemory,
  useUpdateDeal,
  useListCompetitors,
  useListLossArchetypes,
  getSearchDealMemoryQueryKey,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";

const LOSS_CATEGORIES = [
  { value: "price", label: "Price / Commercial" },
  { value: "product", label: "Product / Technical" },
  { value: "competitive", label: "Competitive" },
  { value: "timing", label: "Timing" },
  { value: "relationship", label: "Relationship" },
  { value: "process", label: "Process / Execution" },
];

const WIN_BACK_TIMELINES = [
  { value: "immediate", label: "Immediate (<30 days)" },
  { value: "short_term", label: "Short-term (30-90 days)" },
  { value: "long_term", label: "Long-term (90+ days)" },
  { value: "none", label: "None" },
];

interface FormState {
  primary_loss_category: string;
  loss_subcategory: string;
  loss_narrative: string;
  winning_competitor_id: number | "";
  win_back_potential: number;
  win_back_timeline: string;
  decision_maker_engaged: boolean;
  champion_identified: boolean;
  loss_archetype_id: number | "";
}

function ListEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={v}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {values.length < 5 && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      )}
    </div>
  );
}

export function LossAutopsySheet({
  dealId,
  dealName,
  open,
  onOpenChange,
}: {
  dealId: string;
  dealName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMemory = useUpdateDealMemory();
  const updateDeal = useUpdateDeal();
  const { data: competitorsData } = useListCompetitors();
  const { data: archetypesData } = useListLossArchetypes();
  const { data: memorySearch } = useSearchDealMemory({ outcome: "Lost" });

  const memoryRow = memorySearch?.data?.find((m) => m.dealId === dealId);
  const competitorOptions = (competitorsData?.data ?? []).map((c) => ({ value: String(c.id), label: c.name }));

  const [causalChain, setCausalChain] = useState<string[]>([]);
  const [productGaps, setProductGaps] = useState<string[]>([]);

  const { register, handleSubmit, setValue, watch, reset, formState } = useForm<FormState>({
    defaultValues: {
      primary_loss_category: "",
      loss_subcategory: "",
      loss_narrative: "",
      winning_competitor_id: "",
      win_back_potential: 0,
      win_back_timeline: "none",
      decision_maker_engaged: false,
      champion_identified: false,
      loss_archetype_id: "",
    },
  });

  useEffect(() => {
    if (!memoryRow) return;
    reset({
      primary_loss_category: memoryRow.primaryLossCategory ?? "",
      loss_subcategory: memoryRow.lossSubcategory ?? "",
      loss_narrative: memoryRow.lossNarrative ?? "",
      winning_competitor_id: memoryRow.winningCompetitorId ?? "",
      win_back_potential: memoryRow.winBackPotential ?? 0,
      win_back_timeline: memoryRow.winBackTimeline ?? "none",
      decision_maker_engaged: memoryRow.decisionMakerEngaged ?? false,
      champion_identified: memoryRow.championIdentified ?? false,
      loss_archetype_id: "",
    });
    setCausalChain(memoryRow.causalChain ?? []);
    setProductGaps(memoryRow.productGaps ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryRow?.id]);

  const onSubmit = async (values: FormState) => {
    if (!memoryRow) return;
    try {
      await updateMemory.mutateAsync({
        id: memoryRow.id,
        data: {
          primary_loss_category: values.primary_loss_category || undefined,
          loss_subcategory: values.loss_subcategory || undefined,
          loss_narrative: values.loss_narrative || undefined,
          winning_competitor_id: values.winning_competitor_id ? Number(values.winning_competitor_id) : undefined,
          win_back_potential: values.win_back_potential,
          win_back_timeline: values.win_back_timeline || undefined,
          causal_chain: causalChain.filter((c) => c.trim().length > 0),
          decision_maker_engaged: values.decision_maker_engaged,
          champion_identified: values.champion_identified,
          product_gaps: productGaps.filter((p) => p.trim().length > 0),
        } as never,
      });
      if (values.loss_archetype_id) {
        await updateDeal.mutateAsync({
          id: dealId,
          data: { loss_archetype_id: Number(values.loss_archetype_id) } as never,
        });
      }
      await queryClient.invalidateQueries({ queryKey: getSearchDealMemoryQueryKey({ outcome: "Lost" }) });
      toast({ title: "Autopsy saved", description: `Loss capture recorded for ${dealName}.` });
      onOpenChange(false);
    } catch {
      toast({ title: "Could not save autopsy", variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Complete Autopsy — {dealName}</SheetTitle>
          <SheetDescription>Structured loss capture beyond the reason dropdown.</SheetDescription>
        </SheetHeader>

        {!memoryRow ? (
          <p className="text-sm text-muted-foreground py-6">
            No post-mortem record found for this deal yet.
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Primary Loss Category</Label>
                <Select
                  value={watch("primary_loss_category")}
                  onValueChange={(v) => setValue("primary_loss_category", v, { shouldDirty: true })}
                >
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {LOSS_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Loss Archetype</Label>
                <Select
                  value={String(watch("loss_archetype_id"))}
                  onValueChange={(v) => setValue("loss_archetype_id", Number(v), { shouldDirty: true })}
                >
                  <SelectTrigger><SelectValue placeholder="Select archetype" /></SelectTrigger>
                  <SelectContent>
                    {(archetypesData?.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.archetypeName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Sub-category</Label>
              <Input placeholder="e.g. Price too high vs. competitor" {...register("loss_subcategory")} />
            </div>

            <div className="grid gap-2">
              <Label>Loss Narrative</Label>
              <Textarea rows={4} placeholder="Why was this deal lost?" {...register("loss_narrative")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Winning Competitor</Label>
                <Combobox
                  options={competitorOptions}
                  value={watch("winning_competitor_id") ? String(watch("winning_competitor_id")) : ""}
                  onChange={(v) => setValue("winning_competitor_id", v ? Number(v) : "", { shouldDirty: true })}
                  placeholder="None"
                  emptyText="No competitors found."
                />
              </div>
              <div className="grid gap-2">
                <Label>Win-Back Timeline</Label>
                <Select
                  value={watch("win_back_timeline")}
                  onValueChange={(v) => setValue("win_back_timeline", v, { shouldDirty: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WIN_BACK_TIMELINES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Win-Back Potential</Label>
                <span className="font-mono text-sm text-muted-foreground">{watch("win_back_potential")}%</span>
              </div>
              <Slider
                value={[watch("win_back_potential")]}
                onValueChange={([v]) => setValue("win_back_potential", v, { shouldDirty: true })}
                max={100}
                step={5}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={watch("decision_maker_engaged")}
                onCheckedChange={(v) => setValue("decision_maker_engaged", !!v, { shouldDirty: true })}
              />
              <Label className="font-normal">Economic buyer was directly engaged</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={watch("champion_identified")}
                onCheckedChange={(v) => setValue("champion_identified", !!v, { shouldDirty: true })}
              />
              <Label className="font-normal">An internal champion was identified</Label>
            </div>

            <ListEditor
              label="5 Whys — Causal Chain"
              values={causalChain}
              onChange={setCausalChain}
              placeholder="Why did this happen?"
            />
            <ListEditor
              label="Product Gaps Cited"
              values={productGaps}
              onChange={setProductGaps}
              placeholder="e.g. Missing real-time sync API"
            />

            <SheetFooter className="pt-2">
              <Button type="submit" disabled={updateMemory.isPending || formState.isSubmitting}>
                {updateMemory.isPending ? "Saving..." : "Save Autopsy"}
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
