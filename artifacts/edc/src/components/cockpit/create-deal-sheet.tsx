import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import {
  useCreateDeal,
  useListPipelineStages,
  useListPricingModels,
  useListServicesTiers,
  getListDealsQueryKey,
} from "@workspace/api-client-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

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

export function CreateDealSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createDeal = useCreateDeal();
  const { data: stages } = useListPipelineStages();
  const { data: models } = useListPricingModels();
  const { data: tiers } = useListServicesTiers();

  const defaultValues: FormState = {
    deal_name: "",
    account_name: "",
    account_manager: "",
    technical_lead: "",
    sales_stage_id: 0,
    pricing_model_id: 0,
    services_tier_id: 0,
    product_revenue: 0,
    services_revenue: 0,
    contract_term_years: 1,
    deal_currency: "USD",
    expected_close_date: "",
    win_probability_pct: "",
    manager_strategic_blueprint: "",
    speaker_notes: "",
  };

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormState>({
    defaultValues,
  });

  const onSubmit = async (values: FormState) => {
    if (!values.sales_stage_id || !values.pricing_model_id || !values.services_tier_id) {
      toast({
        title: "Missing selections",
        description: "Pick a sales stage, pricing model, and services tier.",
        variant: "destructive",
      });
      return;
    }
    const data = {
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
    try {
      const created = await createDeal.mutateAsync({ data: data as never });
      await queryClient.invalidateQueries({ queryKey: getListDealsQueryKey() });
      toast({ title: "Deal created", description: "Technical gates seeded and intelligence computed." });
      reset(defaultValues);
      onOpenChange(false);
      const newId = created?.data?.id;
      if (newId) setLocation(`/deals/${newId}`);
    } catch (err: unknown) {
      const body = (err as { data?: { error?: { message?: string } } })?.data;
      toast({
        title: "Could not create deal",
        description: body?.error?.message ?? "Check the form and try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset(defaultValues);
        onOpenChange(v);
      }}
    >
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Deal</SheetTitle>
          <SheetDescription>
            Register a new enterprise deal. Technical validation gates are seeded automatically.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-6">
          <div className="grid gap-2">
            <Label>Deal Name</Label>
            <Input {...register("deal_name", { required: true })} placeholder="Acme Platform Renewal" />
          </div>
          <div className="grid gap-2">
            <Label>Account Name</Label>
            <Input {...register("account_name", { required: true })} placeholder="Acme Corp" />
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
              value={watch("sales_stage_id") ? String(watch("sales_stage_id")) : ""}
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
                value={watch("pricing_model_id") ? String(watch("pricing_model_id")) : ""}
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
                value={watch("services_tier_id") ? String(watch("services_tier_id")) : ""}
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

          <SheetFooter className="pt-2">
            <Button type="submit" disabled={createDeal.isPending}>
              {createDeal.isPending ? "Creating..." : "Create Deal"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
