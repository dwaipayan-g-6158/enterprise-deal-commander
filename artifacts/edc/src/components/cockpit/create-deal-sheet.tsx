import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import {
  useCreateDeal,
  useListPipelineStages,
  useListPricingModels,
  useListServicesTiers,
  useListCompetitors,
  useListComplianceDrivers,
  useListTeamMembers,
  useCreateCompetitor,
  useCreateComplianceDriver,
  getListDealsQueryKey,
  getListCompetitorsQueryKey,
  getListComplianceDriversQueryKey,
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

interface FormState {
  deal_name: string;
  account_name: string;
  crm_record_url: string;
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
  const createCompetitor = useCreateCompetitor();
  const createComplianceDriver = useCreateComplianceDriver();
  const { data: stages } = useListPipelineStages();
  const { data: models } = useListPricingModels();
  const { data: tiers } = useListServicesTiers();
  const { data: competitors } = useListCompetitors();
  const { data: drivers } = useListComplianceDrivers();
  const { data: teamMembers } = useListTeamMembers();
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [driverIds, setDriverIds] = useState<number[]>([]);

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

  const defaultValues: FormState = {
    deal_name: "",
    account_name: "",
    crm_record_url: "",
    account_manager: "",
    technical_lead: "",
    sales_stage_id: 0,
    pricing_model_id: 0,
    services_tier_id: 0,
    product_revenue: 0,
    services_revenue: 0,
    contract_term_years: 1,
    expected_close_date: "",
    landed_at: new Date().toISOString().slice(0, 10),
    win_probability_pct: "",
    committed: false,
    manager_strategic_blueprint: "",
    speaker_notes: "",
    competitor_id: "",
    estimated_log_sources: "",
  };

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormState>({
    defaultValues,
  });

  const handleCreateCompetitor = async (name: string) => {
    try {
      const res = await createCompetitor.mutateAsync({ data: { name } });
      await queryClient.invalidateQueries({ queryKey: getListCompetitorsQueryKey() });
      const created = res?.data;
      if (created) {
        setValue("competitor_id", created.id);
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
    if (!values.sales_stage_id || !values.pricing_model_id || !values.services_tier_id) {
      toast({
        title: "Missing selections",
        description: "Pick a sales stage, pricing model, and services tier.",
        variant: "destructive",
      });
      return;
    }
    if (!values.account_manager || !values.technical_lead) {
      toast({
        title: "Missing team",
        description: "Select an Account Manager and a Technical Lead.",
        variant: "destructive",
      });
      return;
    }
    const data = {
      deal_name: values.deal_name,
      account_name: values.account_name,
      crm_record_url: values.crm_record_url.trim() || null,
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
    try {
      const created = await createDeal.mutateAsync({ data: data as never });
      await queryClient.invalidateQueries({ queryKey: getListDealsQueryKey() });
      toast({ title: "Deal created", description: "Technical gates seeded and intelligence computed." });
      reset(defaultValues);
      setInterestIds([]);
      setDriverIds([]);
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
          <div className="grid gap-2">
            <Label>Zoho CRM Link</Label>
            <Input
              type="url"
              {...register("crm_record_url")}
              placeholder="https://crm.zoho.com/crm/org.../tab/Deals/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Account Manager</Label>
              <Combobox
                options={amOptions}
                value={watch("account_manager") || ""}
                onChange={(v) => setValue("account_manager", v)}
                placeholder="Select account manager"
                emptyText="No team members found."
              />
            </div>
            <div className="grid gap-2">
              <Label>Technical Lead</Label>
              <Combobox
                options={tlOptions}
                value={watch("technical_lead") || ""}
                onChange={(v) => setValue("technical_lead", v)}
                placeholder="Select technical lead"
                emptyText="No team members found."
              />
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
              <Label htmlFor="create-committed">Committed</Label>
              <p className="text-xs text-muted-foreground">Include in the committed forecast band.</p>
            </div>
            <Switch
              id="create-committed"
              checked={watch("committed")}
              onCheckedChange={(v) => setValue("committed", v, { shouldDirty: true })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Landed (entered pipeline)</Label>
              <DatePicker
                value={watch("landed_at")}
                onChange={(v) => setValue("landed_at", v)}
                placeholder="Pick a date"
              />
            </div>
            <div className="grid gap-2">
              <Label>Expected Close Date</Label>
              <DatePicker
                value={watch("expected_close_date")}
                onChange={(v) => setValue("expected_close_date", v)}
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
                onChange={(v) => setValue("competitor_id", v ? Number(v) : "")}
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
            <p className="text-xs text-muted-foreground">
              What the customer landed for — drives next-best-product guidance.
            </p>
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
