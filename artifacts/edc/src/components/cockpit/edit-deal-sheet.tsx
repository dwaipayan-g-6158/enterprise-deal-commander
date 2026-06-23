import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  useUpdateDeal,
  useListPipelineStages,
  useListPricingModels,
  useListServicesTiers,
  type Deal,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCockpitInvalidate } from "./use-invalidate";
import { AlertTriangle } from "lucide-react";

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
  deal_currency: string;
  expected_close_date: string;
  win_probability_pct: number | "";
  manager_strategic_blueprint: string;
  speaker_notes: string;
}

export function EditDealSheet({
  deal,
  open,
  onOpenChange,
}: {
  deal: Deal;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const invalidate = useCockpitInvalidate(deal.id);
  const updateDeal = useUpdateDeal();
  const { data: stages } = useListPipelineStages();
  const { data: models } = useListPricingModels();
  const { data: tiers } = useListServicesTiers();

  const [guardrail, setGuardrail] = useState<{ message: string; patternCodes: string[] } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormState>({
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
      deal_currency: deal.dealCurrency,
      expected_close_date: deal.expectedCloseDate?.slice(0, 10) ?? "",
      win_probability_pct: deal.winProbabilityPct ?? "",
      manager_strategic_blueprint: deal.managerStrategicBlueprint ?? "",
      speaker_notes: deal.speakerNotes ?? "",
    },
  });

  const onSubmit = async (values: FormState) => {
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
      deal_currency: values.deal_currency.toUpperCase(),
      expected_close_date: values.expected_close_date || null,
      win_probability_pct:
        values.win_probability_pct === "" ? null : Number(values.win_probability_pct),
      manager_strategic_blueprint: values.manager_strategic_blueprint || null,
      speaker_notes: values.speaker_notes || null,
    };
    if (overrideReason.trim().length >= 10) {
      data.override_reason = overrideReason.trim();
    }
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
              <Input {...register("account_manager", { required: true })} />
            </div>
            <div className="grid gap-2">
              <Label>Technical Lead</Label>
              <Input {...register("technical_lead", { required: true })} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Sales Stage</Label>
            <Select
              value={String(watch("sales_stage_id"))}
              onValueChange={(v) => setValue("sales_stage_id", Number(v))}
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
                onValueChange={(v) => setValue("pricing_model_id", Number(v))}
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
                onValueChange={(v) => setValue("services_tier_id", Number(v))}
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

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Term (yrs)</Label>
              <Input type="number" min={1} max={10} {...register("contract_term_years", { valueAsNumber: true })} />
            </div>
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Input maxLength={3} className="uppercase" {...register("deal_currency")} />
            </div>
            <div className="grid gap-2">
              <Label>Win %</Label>
              <Input type="number" min={0} max={100} {...register("win_probability_pct", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Expected Close Date</Label>
            <Input type="date" {...register("expected_close_date")} />
          </div>

          <div className="grid gap-2">
            <Label>Strategic Blueprint</Label>
            <Textarea rows={3} {...register("manager_strategic_blueprint")} />
          </div>
          <div className="grid gap-2">
            <Label>Speaker Notes</Label>
            <Textarea rows={3} {...register("speaker_notes")} />
          </div>

          {guardrail && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 space-y-3">
              <div className="flex gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Stage Guardrail</p>
                  <p className="text-sm">{guardrail.message}</p>
                  {guardrail.patternCodes.length > 0 && (
                    <p className="text-xs font-mono mt-1">{guardrail.patternCodes.join(", ")}</p>
                  )}
                </div>
              </div>
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
