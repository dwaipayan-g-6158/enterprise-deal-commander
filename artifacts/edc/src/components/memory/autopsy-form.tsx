import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateDealMemory,
  useUpdateDeal,
  useListCompetitors,
  useListLossArchetypes,
  getSearchDealMemoryQueryKey,
} from "@workspace/api-client-react";
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
import { useCanWrite } from "@/lib/auth/role-context";

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
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(values.filter((_, j) => j !== i))}>
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

interface MemoryRow {
  id: string;
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

export function AutopsyForm({
  dealId,
  dealName,
  memoryRow,
  lossArchetypeId,
  onSaved,
}: {
  dealId: string;
  dealName: string;
  memoryRow: MemoryRow | undefined;
  // The deal's CURRENT loss archetype (enterprise_deals.loss_archetype_id —
  // it doesn't live on deal_memory). Without this the select always rendered
  // unset, even for a deal that already had one recorded.
  lossArchetypeId?: number | null;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const updateMemory = useUpdateDealMemory();
  const updateDeal = useUpdateDeal();
  const { data: competitorsData } = useListCompetitors();
  const { data: archetypesData } = useListLossArchetypes();

  const competitorOptions = (competitorsData?.data ?? []).map((c) => ({ value: String(c.id), label: c.name }));

  const [causalChain, setCausalChain] = useState<string[]>([]);
  const [productGaps, setProductGaps] = useState<string[]>([]);
  // Snapshot of causalChain/productGaps as loaded, so onSubmit can tell
  // "the user actually edited this list" from "still exactly what was
  // loaded" — these two fields are plain useState, not react-hook-form
  // fields, so they don't get formState.dirtyFields tracking for free.
  const listBaselineRef = useRef<{ causalChain: string[]; productGaps: string[] }>({
    causalChain: [],
    productGaps: [],
  });

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
      // Was always "" regardless of the deal's actual archetype — the field
      // lives on enterprise_deals, not this deal_memory row, and the caller
      // never passed it in.
      loss_archetype_id: lossArchetypeId ?? "",
    });
    const loadedCausalChain = memoryRow.causalChain ?? [];
    const loadedProductGaps = memoryRow.productGaps ?? [];
    setCausalChain(loadedCausalChain);
    setProductGaps(loadedProductGaps);
    listBaselineRef.current = { causalChain: loadedCausalChain, productGaps: loadedProductGaps };
    // lossArchetypeId is fetched via a separate query (useGetDeal) than
    // memoryRow, so it can resolve after this effect's first run — included
    // in the deps so the select re-syncs once it arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryRow?.id, lossArchetypeId]);

  const onSubmit = async (values: FormState) => {
    if (!memoryRow) return;
    try {
      // Only send a field the user actually TOUCHED (react-hook-form's
      // dirtyFields for the registered/setValue-driven fields; a manual
      // baseline comparison for causalChain/productGaps, which are plain
      // useState). Previously every field was sent unconditionally on every
      // save — including win_back_potential defaulting to 0 and
      // win_back_timeline defaulting to "none" — so even a save with nothing
      // touched still counted as 4/10 "filled" fields server-side
      // (computeAutopsyQualityScore treats 0 and "none" as real answers, not
      // blanks) and got stamped autopsyCompletedAt. Sending only dirty
      // fields means an untouched Save produces an empty body, which the
      // server correctly treats as no autopsy update at all.
      // Explicit null (not omitted) for a touched-then-cleared field — an
      // omitted key means "leave existing value alone" server-side; null
      // means "clear it" (routes/v2/crud.ts's `"x" in b` merge).
      const dirty = formState.dirtyFields;
      const data: Record<string, unknown> = {};
      if (dirty.primary_loss_category) data.primary_loss_category = values.primary_loss_category || null;
      if (dirty.loss_subcategory) data.loss_subcategory = values.loss_subcategory || null;
      if (dirty.loss_narrative) data.loss_narrative = values.loss_narrative || null;
      if (dirty.winning_competitor_id) {
        data.winning_competitor_id = values.winning_competitor_id ? Number(values.winning_competitor_id) : null;
      }
      if (dirty.win_back_potential) data.win_back_potential = values.win_back_potential;
      if (dirty.win_back_timeline) data.win_back_timeline = values.win_back_timeline || null;
      if (dirty.decision_maker_engaged) data.decision_maker_engaged = values.decision_maker_engaged;
      if (dirty.champion_identified) data.champion_identified = values.champion_identified;

      const trimmedCausalChain = causalChain.filter((c) => c.trim().length > 0);
      if (JSON.stringify(trimmedCausalChain) !== JSON.stringify(listBaselineRef.current.causalChain)) {
        data.causal_chain = trimmedCausalChain;
      }
      const trimmedProductGaps = productGaps.filter((p) => p.trim().length > 0);
      if (JSON.stringify(trimmedProductGaps) !== JSON.stringify(listBaselineRef.current.productGaps)) {
        data.product_gaps = trimmedProductGaps;
      }

      const archetypeChanged = !!dirty.loss_archetype_id && values.loss_archetype_id !== "";
      if (Object.keys(data).length === 0 && !archetypeChanged) {
        toast({ title: "Nothing to save", description: "No fields were changed." });
        onSaved?.();
        return;
      }

      if (Object.keys(data).length > 0) {
        await updateMemory.mutateAsync({ id: memoryRow.id, data: data as never });
      }
      if (archetypeChanged) {
        await updateDeal.mutateAsync({ id: dealId, data: { loss_archetype_id: Number(values.loss_archetype_id) } as never });
      }
      // Unscoped key (no params) — invalidates every deal-memory search
      // variant (this sheet's dealId lookup, the Knowledge Hub search tab's
      // arbitrary filters), not just the one-time { outcome: "Lost" } shape
      // this used to pass, which wouldn't even match the dealId-scoped query
      // this component now uses (TanStack matches on the full params object).
      await queryClient.invalidateQueries({ queryKey: getSearchDealMemoryQueryKey() });
      toast({ title: "Autopsy saved", description: `Loss capture recorded for ${dealName}.` });
      onSaved?.();
    } catch {
      toast({ title: "Could not save autopsy", variant: "destructive" });
    }
  };

  if (!memoryRow) {
    return <p className="text-sm text-muted-foreground py-6">No post-mortem record found for this deal yet.</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* fieldset[disabled] propagates to every native form control inside
          (including ListEditor's Inputs/Buttons), matching the read-only
          treatment applied everywhere else — display:contents keeps the
          existing grid/flex layout untouched. Radix controls that don't
          render a native form element (Slider, Combobox) don't inherit this
          and get an explicit disabled prop below. */}
      <fieldset disabled={!canWrite} className="contents">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Primary Loss Category</Label>
          <Select value={watch("primary_loss_category")} onValueChange={(v) => setValue("primary_loss_category", v, { shouldDirty: true })}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {LOSS_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Loss Archetype</Label>
          <Select value={String(watch("loss_archetype_id"))} onValueChange={(v) => setValue("loss_archetype_id", Number(v), { shouldDirty: true })}>
            <SelectTrigger><SelectValue placeholder="Select archetype" /></SelectTrigger>
            <SelectContent>
              {(archetypesData?.data ?? []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.archetypeName}</SelectItem>)}
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
            emptyText="No matching competitors."
            disabled={!canWrite}
          />
        </div>
        <div className="grid gap-2">
          <Label>Win-Back Timeline</Label>
          <Select value={watch("win_back_timeline")} onValueChange={(v) => setValue("win_back_timeline", v, { shouldDirty: true })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WIN_BACK_TIMELINES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
          disabled={!canWrite}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox checked={watch("decision_maker_engaged")} onCheckedChange={(v) => setValue("decision_maker_engaged", !!v, { shouldDirty: true })} />
        <Label className="font-normal">Economic buyer was directly engaged</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={watch("champion_identified")} onCheckedChange={(v) => setValue("champion_identified", !!v, { shouldDirty: true })} />
        <Label className="font-normal">An internal champion was identified</Label>
      </div>

      <ListEditor label="5 Whys — Causal Chain" values={causalChain} onChange={setCausalChain} placeholder="Why did this happen?" />
      <ListEditor label="Product Gaps Cited" values={productGaps} onChange={setProductGaps} placeholder="e.g. Missing real-time sync API" />

      <Button type="submit" disabled={updateMemory.isPending || formState.isSubmitting}>
        {updateMemory.isPending ? "Saving..." : "Save Autopsy"}
      </Button>
      </fieldset>
    </form>
  );
}
