import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  useUpdateDeal,
  useListPipelineStages,
  useListPricingModels,
  useListServicesTiers,
  useListCompetitors,
  useListComplianceDrivers,
  useListTeamMembers,
  useCreateCompetitor,
  useCreateComplianceDriver,
  getListCompetitorsQueryKey,
  getListComplianceDriversQueryKey,
  type Deal,
} from "@workspace/api-client-react";
import { ProductPicker } from "./product-picker";
import { useQueryClient } from "@tanstack/react-query";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useCockpitInvalidate } from "./use-invalidate";
import { GuardrailNotice } from "./risk/guardrail-notice";

interface FormState {
  deal_name: string;
  account_name: string;
  account_manager: string;
  technical_lead: string;
  sales_stage_id: number;
  pricing_model_id: number;
  services_tier_id: number;
  product_revenue: number;
  services_revenue: number;
  contract_term_years: number;
  expected_close_date: string;
  landed_at: string;
  win_probability_pct: number | "";
  committed: boolean;
  manager_strategic_blueprint: string;
  speaker_notes: string;
  competitor_id: number | "";
  estimated_log_sources: number | "";
}

export function EditDealSheet({
  deal,
  open,
  onOpenChange,
  dirtyRef,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dirtyRef?: React.MutableRefObject<boolean>;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = useCockpitInvalidate(deal.id);
  const updateDeal = useUpdateDeal();
  const createCompetitor = useCreateCompetitor();
  const createComplianceDriver = useCreateComplianceDriver();
  const { data: stages } = useListPipelineStages();
  const { data: models } = useListPricingModels();
  const { data: tiers } = useListServicesTiers();
  const { data: competitors } = useListCompetitors();
  const { data: drivers } = useListComplianceDrivers();
  const { data: teamMembers } = useListTeamMembers();

  const [guardrail, setGuardrail] = useState<{ message: string; patternCodes: string[] } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [interestIds, setInterestIds] = useState<string[]>(
    deal.productsOfInterest?.map((p) => p.productId) ?? [],
  );
  const [driverIds, setDriverIds] = useState<number[]>(
    (deal.complianceDrivers ?? []).map((d) => d.id),
  );

  const amOptions = (teamMembers?.data ?? [])
    .filter((m) => m.can_be_am)
    .map((m) => ({ value: m.name, label: m.name }));
  const tlOptions = (teamMembers?.data ?? [])
    .filter((m) => m.can_be_tl)
    .map((m) => ({ value: m.name, label: m.name }));
  const competitorOptions = (competitors?.data ?? []).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));
  const driverOptions = (drivers?.data ?? []).map((d) => ({
    value: String(d.id),
    label: d.name,
  }));

  const { register, handleSubmit, setValue, watch, reset, formState } = useForm<FormState>({
    defaultValues: {
      deal_name: deal.dealName,
      account_name: deal.accountName,
      account_manager: deal.accountManager,
      technical_lead: deal.technicalLead,
      sales_stage_id: deal.salesStageId,
      pricing_model_id: deal.pricingModelId ?? 0,
      services_tier_id: deal.servicesTierId ?? 0,
      product_revenue: deal.productRevenue,
      services_revenue: deal.servicesRevenue,
      contract_term_years: deal.contractTermYears ?? 1,
      expected_close_date: deal.expectedCloseDate?.slice(0, 10) ?? "",
      landed_at: deal.landedAt?.slice(0, 10) ?? "",
      win_probability_pct: deal.winProbabilityPct ?? "",
      committed: deal.committed ?? false,
      manager_strategic_blueprint: deal.managerStrategicBlueprint ?? "",
      speaker_notes: deal.speakerNotes ?? "",
      competitor_id: deal.competitorId ?? "",
      estimated_log_sources: deal.estimatedLogSources ?? "",
    },
  });

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoDataRef = useRef<FormState | null>(null);
  const onAutoSaveRef = useRef<((values: FormState) => Promise<void>) | null>(null);

  // Surface dirty state to the parent cockpit's deal-switch guard.
  const { isDirty } = formState;
  useEffect(() => {
    if (dirtyRef) dirtyRef.current = isDirty;
    return () => {
      if (dirtyRef) dirtyRef.current = false;
    };
  }, [isDirty, dirtyRef]);

  // Auto-save: debounce any field change by 1s while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const subscription = watch(() => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        if (onAutoSaveRef.current) void handleSubmit(onAutoSaveRef.current)();
      }, 1000);
    });
    return () => {
      subscription.unsubscribe();
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [open, watch, handleSubmit]);

  const buildPayload = (values: FormState): Record<string, unknown> => {
    const data: Record<string, unknown> = {
      deal_name: values.deal_name,
      account_name: values.account_name,
      account_manager: values.account_manager,
      technical_lead: values.technical_lead,
      sales_stage_id: Number(values.sales_stage_id),
      pricing_model_id: Number(values.pricing_model_id),
      services_tier_id: Number(values.services_tier_id),
      product_revenue: Number(values.product_revenue),
      services_revenue: Number(values.services_revenue),
      contract_term_years: Number(values.contract_term_years),
      deal_currency: "USD",
      expected_close_date: values.expected_close_date || null,
      landed_at: values.landed_at || null,
      win_probability_pct:
        values.win_probability_pct === "" ? null : Number(values.win_probability_pct),
      committed: values.committed,
      manager_strategic_blueprint: values.manager_strategic_blueprint || null,
      speaker_notes: values.speaker_notes || null,
      competitor_id: values.competitor_id === "" ? null : Number(values.competitor_id),
      compliance_driver_id: null,
      estimated_log_sources:
        values.estimated_log_sources === "" ? null : Number(values.estimated_log_sources),
      product_interest_ids: interestIds,
      compliance_driver_ids: driverIds.map(Number),
    };
    if (overrideReason.trim().length >= 10) {
      data.override_reason = overrideReason.trim();
    }
    return data;
  };

  // Auto-save handler — saves without closing the sheet; offers an undo.
  onAutoSaveRef.current = async (values: FormState) => {
    const prevUndo = undoDataRef.current;
    undoDataRef.current = values;
    try {
      await updateDeal.mutateAsync({ id: deal.id, data: buildPayload(values) as never });
      await invalidate();
      toast({
        title: "Auto-saved",
        description: "Changes saved automatically.",
        action: prevUndo ? (
          <ToastAction
            altText="Undo last change"
            onClick={() => {
              reset(prevUndo);
              undoDataRef.current = null;
              if (onAutoSaveRef.current) void handleSubmit(onAutoSaveRef.current)();
            }}
          >
            Undo
          </ToastAction>
        ) : undefined,
      });
      setGuardrail(null);
    } catch (err: unknown) {
      const body = (err as { data?: { error?: { code?: string; message?: string; patternCodes?: string[] } } })?.data;
      const apiErr = body?.error;
      if (apiErr?.code === "STAGE_GUARDRAIL" || (apiErr?.patternCodes && apiErr.patternCodes.length > 0)) {
        setGuardrail({
          message: apiErr.message ?? "Stage advancement is blocked by active risk patterns.",
          patternCodes: apiErr.patternCodes ?? [],
        });
      }
      // Otherwise stay silent — don't interrupt the user mid-edit on auto-save.
    }
  };

  const handleCreateCompetitor = async (name: string) => {
    try {
      const res = await createCompetitor.mutateAsync({ data: { name } });
      await queryClient.invalidateQueries({ queryKey: getListCompetitorsQueryKey() });
      const created = res?.data;
      if (created) {
        setValue("competitor_id", created.id, { shouldDirty: true });
        return { value: String(created.id), label: created.name };
      }
    } catch {
      toast({
        title: "Could not add competitor",
        description: "Try a different name.",
        variant: "destructive",
      });
    }
    return undefined;
  };

  const handleCreateDriver = async (name: string) => {
    try {
      const res = await createComplianceDriver.mutateAsync({ data: { name } });
      await queryClient.invalidateQueries({ queryKey: getListComplianceDriversQueryKey() });
      const created = res?.data;
      if (created) {
        setDriverIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
        return { value: String(created.id), label: created.name };
      }
    } catch {
      toast({
        title: "Could not add compliance driver",
        description: "Try a different name.",
        variant: "destructive",
      });
    }
    return undefined;
  };

  const onSubmit = async (values: FormState) => {
    const data = buildPayload(values);
    try {
      await updateDeal.mutateAsync({ id: deal.id, data: data as never });
      await invalidate();
      toast({ title: "Deal updated", description: "Changes saved and intelligence recalculated." });
      setGuardrail(null);
      setOverrideReason("");
      onOpenChange(false);
    } catch (err: unknown) {
      const body = (err as { data?: { error?: { code?: string; message?: string; patternCodes?: string[] } } })?.data;
      const apiErr = body?.error;
      if (apiErr?.code === "STAGE_GUARDRAIL" || (apiErr?.patternCodes && apiErr.patternCodes.length > 0)) {
        setGuardrail({
          message: apiErr.message ?? "Stage advancement is blocked by active risk patterns.",
          patternCodes: apiErr.patternCodes ?? [],
        });
        return;
      }
      toast({
        title: "Update failed",
        description: apiErr?.message ?? "Could not save deal changes.",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          setGuardrail(null);
          setOverrideReason("");
        }
        onOpenChange(v);
      }}
    >
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Deal</SheetTitle>
          <SheetDescription>Update deal economics, ownership, and narrative.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-6">
          <div className="grid gap-2">
            <Label>Deal Name</Label>
            <Input {...register("deal_name", { required: true })} />
          </div>
          <div className="grid gap-2">
            <Label>Account Name</Label>
            <Input {...register("account_name", { required: true })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Account Manager</Label>
              <Combobox
                options={amOptions}
                value={watch("account_manager") || ""}
                onChange={(v) => setValue("account_manager", v, { shouldDirty: true })}
                placeholder="Select account manager"
                emptyText="No team members found."
              />
            </div>
            <div className="grid gap-2">
              <Label>Technical Lead</Label>
              <Combobox
                options={tlOptions}
                value={watch("technical_lead") || ""}
                onChange={(v) => setValue("technical_lead", v, { shouldDirty: true })}
                placeholder="Select technical lead"
                emptyText="No team members found."
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Sales Stage</Label>
            <Select
              value={String(watch("sales_stage_id"))}
              onValueChange={(v) => setValue("sales_stage_id", Number(v), { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {stages?.data.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.stageName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Pricing Model</Label>
              <Select
                value={String(watch("pricing_model_id"))}
                onValueChange={(v) => setValue("pricing_model_id", Number(v), { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models?.data.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.modelName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Services Tier</Label>
              <Select
                value={String(watch("services_tier_id"))}
                onValueChange={(v) => setValue("services_tier_id", Number(v), { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  {tiers?.data.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.tierName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Product Revenue</Label>
              <Input type="number" step="any" {...register("product_revenue", { valueAsNumber: true })} />
            </div>
            <div className="grid gap-2">
              <Label>Services Revenue</Label>
              <Input type="number" step="any" {...register("services_revenue", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Term (yrs)</Label>
              <Input type="number" min={1} max={10} {...register("contract_term_years", { valueAsNumber: true })} />
            </div>
            <div className="grid gap-2">
              <Label>Win %</Label>
              <Input type="number" min={0} max={100} {...register("win_probability_pct", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="edit-committed">Committed</Label>
              <p className="text-xs text-muted-foreground">Include in the committed forecast band.</p>
            </div>
            <Switch
              id="edit-committed"
              checked={watch("committed")}
              onCheckedChange={(v) => setValue("committed", v, { shouldDirty: true })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Landed (entered pipeline)</Label>
              <DatePicker
                value={watch("landed_at")}
                onChange={(v) => setValue("landed_at", v, { shouldDirty: true })}
                placeholder="Pick a date"
              />
            </div>
            <div className="grid gap-2">
              <Label>Expected Close Date</Label>
              <DatePicker
                value={watch("expected_close_date")}
                onChange={(v) => setValue("expected_close_date", v, { shouldDirty: true })}
                placeholder="Pick a date"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Compliance Drivers</Label>
              <MultiCombobox
                options={driverOptions}
                value={driverIds.map(String)}
                onChange={(vals) => setDriverIds(vals.map(Number))}
                placeholder="Select drivers"
                emptyText="No compliance drivers found."
                onCreate={handleCreateDriver}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Incumbent / Competitor</Label>
              <Combobox
                options={competitorOptions}
                value={watch("competitor_id") ? String(watch("competitor_id")) : ""}
                onChange={(v) => setValue("competitor_id", v ? Number(v) : "", { shouldDirty: true })}
                placeholder="None"
                emptyText="No competitors found."
                onCreate={handleCreateCompetitor}
              />
            </div>
            <div className="grid gap-2">
              <Label>Est. Log Sources (SIEM)</Label>
              <Input
                type="number"
                min={0}
                placeholder="e.g. 1500"
                {...register("estimated_log_sources", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Products of Interest</Label>
            <ProductPicker selected={interestIds} onChange={setInterestIds} />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-1.5">
              <Label>Strategic Blueprint</Label>
              <InfoTooltip>
                Your overarching plan to win this deal — positioning, key plays, and the path to
                close. Surfaces in Briefing Mode and coaching.
              </InfoTooltip>
            </div>
            <Textarea rows={3} {...register("manager_strategic_blueprint")} />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center gap-1.5">
              <Label>Speaker Notes</Label>
              <InfoTooltip>
                Talking points and reminders for live conversations and executive briefings. Private
                to you; shown in Briefing Mode.
              </InfoTooltip>
            </div>
            <Textarea rows={3} {...register("speaker_notes")} />
          </div>

          {guardrail && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-3">
              <GuardrailNotice message={guardrail.message} patternCodes={guardrail.patternCodes} />
              <div className="grid gap-2">
                <Label className="text-xs">Override reason (min 10 chars)</Label>
                <Textarea
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Document why you are overriding the guardrail..."
                />
              </div>
            </div>
          )}

          <SheetFooter className="pt-2">
            <Button type="submit" disabled={updateDeal.isPending}>
              {updateDeal.isPending
                ? "Saving..."
                : guardrail
                ? "Override & Save"
                : "Save Changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
