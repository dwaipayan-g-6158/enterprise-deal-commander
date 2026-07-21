import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSetDisposition,
  getGetIntelligenceSummaryQueryKey,
  getListDealsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert,
  Check,
  Clock,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface CriticalAlert {
  dealId: string;
  dealName: string;
  accountName: string;
  alert: {
    code: string;
    severity: string;
    message: string;
    weight?: number;
  };
}

interface CriticalAlertsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alerts: CriticalAlert[];
}

// Fields a snooze can watch for change. The backend stores the raw string; these
// mirror the deal-input field names the engine re-evaluates against.
const SNOOZE_FIELDS: { value: string; label: string }[] = [
  { value: "sales_stage_id", label: "Sales stage changes" },
  { value: "win_probability_pct", label: "Win probability changes" },
  { value: "expected_close_date", label: "Expected close date changes" },
  { value: "product_revenue", label: "Product revenue changes" },
  { value: "services_revenue", label: "Services revenue changes" },
];

export function CriticalAlertsDialog({
  open,
  onOpenChange,
  alerts,
}: CriticalAlertsDialogProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getGetIntelligenceSummaryQueryKey(),
      }),
      queryClient.invalidateQueries({ queryKey: getListDealsQueryKey() }),
    ]);

  const goToDeal = (id: string) => {
    onOpenChange(false);
    navigate(`/deals/${id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Critical Alerts
          </DialogTitle>
          <DialogDescription>
            RED-severity risks across the portfolio requiring disposition. Act on
            each here, or open the deal for full context.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {alerts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing critical right now. Enjoy the calm.
            </p>
          ) : (
            alerts.map((item, i) => (
              <AlertRow
                key={`${item.dealId}-${item.alert.code}-${i}`}
                item={item}
                onGoToDeal={goToDeal}
                onActioned={invalidate}
                toast={toast}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ToastFn = ReturnType<typeof useToast>["toast"];

function AlertRow({
  item,
  onGoToDeal,
  onActioned,
  toast,
}: {
  item: CriticalAlert;
  onGoToDeal: (id: string) => void;
  onActioned: () => Promise<unknown>;
  toast: ToastFn;
}) {
  const setDisposition = useSetDisposition();
  const [mode, setMode] = useState<"idle" | "accept" | "snooze">("idle");
  const [rationale, setRationale] = useState("");
  const [snoozeField, setSnoozeField] = useState("");

  const pending = setDisposition.isPending;

  const run = async (
    data:
      | { disposition: "acknowledge" }
      | { disposition: "accept"; rationale: string }
      | { disposition: "snooze"; snooze_until_field_change: string },
    successMsg: string,
  ) => {
    try {
      await setDisposition.mutateAsync({
        dealId: item.dealId,
        patternCode: item.alert.code,
        data,
      });
      await onActioned();
      toast({ title: successMsg, description: item.dealName });
      setMode("idle");
      setRationale("");
      setSnoozeField("");
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data
        ?.error?.message;
      toast({
        title: "Could not update alert",
        description: msg ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{item.dealName}</p>
            <Badge variant="destructive" className="shrink-0 text-[10px]">
              {item.alert.code}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.accountName}
          </p>
          <p className="mt-1.5 text-sm">{item.alert.message}</p>
        </div>
      </div>

      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run({ disposition: "acknowledge" }, "Alert acknowledged")}
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Acknowledge
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setMode("accept")}
          >
            Accept risk
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setMode("snooze")}
          >
            <Clock className="h-3.5 w-3.5" />
            Snooze
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onGoToDeal(item.dealId)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open deal
          </Button>
        </div>
      )}

      {mode === "accept" && (
        <div className="mt-3 space-y-2">
          <Label htmlFor={`rationale-${item.dealId}-${item.alert.code}`}>
            Rationale (required, min 10 chars)
          </Label>
          <Textarea
            id={`rationale-${item.dealId}-${item.alert.code}`}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why is this risk acceptable?"
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || rationale.trim().length < 10}
              onClick={() =>
                run(
                  { disposition: "accept", rationale: rationale.trim() },
                  "Risk accepted",
                )
              }
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setMode("idle")}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "snooze" && (
        <div className="mt-3 space-y-2">
          <Label>Snooze until this field changes</Label>
          <Select value={snoozeField} onValueChange={setSnoozeField}>
            <SelectTrigger>
              <SelectValue placeholder="Select a field to watch" />
            </SelectTrigger>
            <SelectContent>
              {SNOOZE_FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending || !snoozeField}
              onClick={() =>
                run(
                  {
                    disposition: "snooze",
                    snooze_until_field_change: snoozeField,
                  },
                  "Alert snoozed",
                )
              }
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm snooze
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setMode("idle")}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
