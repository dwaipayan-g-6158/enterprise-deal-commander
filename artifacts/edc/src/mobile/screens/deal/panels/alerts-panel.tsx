import { useState } from "react";
import { BellOff, Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { calendarDaysUntil, formatDate, humanizeCode } from "@/lib/format";
import { RISK_LEVEL_CLASS } from "@/lib/semantic-colors";
import { useGetDealIntelligence, type Alert } from "@workspace/api-client-react";
import { AdminOnly } from "@/components/auth/write-gate";
import { alertBody } from "@/mobile/lib/alert-text";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MActionSheet } from "@/mobile/ui/m-action-sheet";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";
import { WriteErrorInline } from "@/mobile/write/write-error-inline";
import type { WriteOutcome } from "@/mobile/write/write-outcome";
import {
  useRiskDisposition,
  RATIONALE_MIN_LENGTH,
  type Disposition,
} from "@/mobile/write/use-risk-disposition";

const SEVERITY_TONE: Record<string, string> = {
  RED: RISK_LEVEL_CLASS.HIGH.text,
  YELLOW: RISK_LEVEL_CLASS.MODERATE.text,
};

/** Snooze durations, in days. Longer than a fortnight is a decision, not a snooze. */
const SNOOZE_DAYS = [3, 7, 14];

/**
 * The deal's risk alerts, and the one thing you can do about them from a phone.
 *
 * ## Two of the three dispositions are undoable, and the third must not be
 *
 * Acknowledge and snooze are notes: someone has seen this, raise it again later.
 * Both are one tap, both are eminently fat-fingerable, and both get the undo bar.
 *
 * Accept is different in kind. Server-side, `isBlockingRedAlert` treats an
 * accepted alert as CLEARING THE STAGE GUARDRAIL — so accepting is an
 * authorization to advance past a red alert, it carries a mandatory rationale,
 * and it is audited. It therefore asks for that rationale on a full screen,
 * states its consequence in plain words, and offers no undo. Letting it be
 * issued and silently revoked six seconds later, with no second rationale on the
 * record, would leave a guardrail lifted with nothing explaining why.
 */
export function AlertsPanel({ dealId }: PanelBodyProps) {
  const query = useGetDealIntelligence(dealId);
  const { apply, isPending } = useRiskDisposition(dealId);

  const [sheetFor, setSheetFor] = useState<Alert | null>(null);
  const [acceptFor, setAcceptFor] = useState<Alert | null>(null);
  const [rationale, setRationale] = useState("");
  const [outcome, setOutcome] = useState<WriteOutcome | null>(null);

  const governance = query.data?.data?.governance;
  const open = governance?.alerts ?? [];
  const managed = governance?.managedAlerts ?? [];

  async function run(alert: Alert, disposition: Disposition, opts: { snoozeDays?: number; rationale?: string } = {}) {
    setOutcome(await apply(alert.code, disposition, { label: humanizeCode(alert.code), ...opts }));
  }

  if (acceptFor) {
    return (
      <AcceptScreen
        alert={acceptFor}
        rationale={rationale}
        onRationale={setRationale}
        pending={isPending}
        outcome={outcome}
        onCancel={() => {
          setAcceptFor(null);
          setRationale("");
          setOutcome(null);
        }}
        onConfirm={async () => {
          const result = await apply(acceptFor.code, "accept", {
            label: humanizeCode(acceptFor.code),
            rationale: rationale.trim(),
          });
          setOutcome(result);
          // Only leave the screen on success. Closing it on failure would throw
          // away a rationale somebody just typed.
          if (!result) {
            setAcceptFor(null);
            setRationale("");
          }
        }}
      />
    );
  }

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && open.length === 0 && managed.length === 0}
      emptyTitle="No alerts on this deal"
      emptyBody="The engine re-checks all twelve patterns on every change to the deal."
    >
      <>
        {open.length > 0 ? (
          <MobileCard>
            <CardHeader label={`Open (${open.length})`} />
            <ul className="space-y-4">
              {open.map((alert) => (
                <AlertRow
                  key={alert.code}
                  alert={alert}
                  action={
                    <AdminOnly>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setSheetFor(alert)}
                        className="m-label m-press m-tap mt-2 rounded-full border border-border px-4 py-2 disabled:opacity-50"
                      >
                        Disposition
                      </button>
                    </AdminOnly>
                  }
                />
              ))}
            </ul>
            <WriteErrorInline outcome={outcome} />
          </MobileCard>
        ) : null}

        {managed.length > 0 ? (
          <MobileCard>
            <CardHeader label={`Managed (${managed.length})`} />
            <ul className="space-y-4">
              {managed.map((alert) => (
                <AlertRow key={alert.code} alert={alert} muted />
              ))}
            </ul>
          </MobileCard>
        ) : null}

        <MActionSheet
          open={sheetFor != null}
          onOpenChange={(next) => {
            if (!next) setSheetFor(null);
          }}
          title={sheetFor ? humanizeCode(sheetFor.code) : ""}
          description="How should this alert be handled?"
          actions={
            sheetFor
              ? [
                  {
                    id: "acknowledge",
                    label: "Acknowledge",
                    detail: "Seen. The alert stays live and keeps blocking.",
                    icon: Check,
                    onSelect: () => void run(sheetFor, "acknowledge"),
                  },
                  ...SNOOZE_DAYS.map((days) => ({
                    id: `snooze-${days}`,
                    label: `Snooze ${days} days`,
                    // Not "hidden": nothing in the engine hides a dispositioned
                    // alert. `managedAlerts` holds every one of them regardless
                    // of state, and the Managed card below renders that list. A
                    // snooze differs from an acknowledge only in coming back.
                    detail: `Moves to Managed, returns in ${days} days. Still blocks a stage advance.`,
                    icon: BellOff,
                    onSelect: () => void run(sheetFor, "snooze", { snoozeDays: days }),
                  })),
                  {
                    id: "accept",
                    label: "Accept the risk",
                    detail: "Clears the stage guardrail. Needs a rationale, and cannot be undone.",
                    icon: ShieldCheck,
                    destructive: true,
                    onSelect: () => {
                      setAcceptFor(sheetFor);
                      setOutcome(null);
                    },
                  },
                ]
              : []
          }
        />
      </>
    </PanelBody>
  );
}

type AlertDisposition = NonNullable<Alert["disposition"]>;

/**
 * What a disposition actually did, led by the part that distinguishes it.
 *
 * For a snooze that is the return date and nothing else: every dispositioned
 * alert — acknowledged, snoozed, accepted alike — sits in this same Managed
 * card, so without the countdown a snooze and an acknowledge are the same row.
 * That is the whole of what "snooze isn't working" turned out to look like from
 * the outside, on the alerts whose disposition did save.
 */
function dispositionSummary(disposition: AlertDisposition): string {
  if (disposition.state === "snooze") {
    const days = calendarDaysUntil(disposition.snoozeUntil);
    if (days == null) return "Snoozed · return date pending";
    if (days <= 0) return "Snoozed · returns today";
    return `Snoozed · returns in ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (disposition.state === "accept") return "Accepted · stage guardrail cleared";
  return "Acknowledged · still blocking";
}

/** Who and when, plus the rationale an accept carries. Empty when unknown. */
function provenanceLine(disposition: AlertDisposition): string {
  const who = disposition.createdBy ? `by ${disposition.createdBy}` : "";
  const when = disposition.createdAt ? `on ${formatDate(disposition.createdAt, "—")}` : "";
  const stamp = [who, when].filter(Boolean).join(" ");
  return disposition.rationale ? [stamp, disposition.rationale].filter(Boolean).join(" — ") : stamp;
}

function AlertRow({
  alert,
  muted = false,
  action,
}: {
  alert: Alert;
  muted?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <li className={cn(muted && "opacity-80")}>
      <p className={cn("m-headline", SEVERITY_TONE[alert.severity] ?? "")}>
        {humanizeCode(alert.code)}
      </p>
      {/* alertBody, not alert.message: the engine prefixes the message with the
          same pattern name printed on the line above, in block caps. */}
      <p className="m-body m-muted mt-0.5 text-pretty">{alertBody(alert)}</p>

      {alert.disposition ? (
        <>
          <p className="m-caption mt-1.5">{dispositionSummary(alert.disposition)}</p>
          {provenanceLine(alert.disposition) ? (
            <p className="m-caption m-muted mt-0.5">{provenanceLine(alert.disposition)}</p>
          ) : null}
        </>
      ) : null}

      {alert.intervention ? (
        <p className="m-caption m-muted mt-1">Playbook: {alert.intervention.name}</p>
      ) : null}

      {action}
    </li>
  );
}

/**
 * Accepting a risk, on its own screen.
 *
 * A full screen rather than a sheet, because vaul repositions when the keyboard
 * opens and fights iOS exactly while somebody is typing a justification — and
 * because the consequence deserves to be read without a list showing through
 * behind it.
 */
function AcceptScreen({
  alert,
  rationale,
  onRationale,
  pending,
  outcome,
  onCancel,
  onConfirm,
}: {
  alert: Alert;
  rationale: string;
  onRationale: (value: string) => void;
  pending: boolean;
  outcome: WriteOutcome | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const short = rationale.trim().length < RATIONALE_MIN_LENGTH;

  return (
    <section className="m-card p-4">
      <h2 className="m-headline">Accept {humanizeCode(alert.code)}</h2>
      <p className="m-body m-muted mt-1 text-pretty">{alertBody(alert)}</p>

      <p className="m-body mt-3 text-pretty text-destructive">
        Accepting clears the stage guardrail for this alert — the deal will be able to advance
        past it. This cannot be undone from here.
      </p>

      <label htmlFor="accept-rationale" className="m-label m-muted mt-4 block">
        Why this risk is acceptable
      </label>
      <textarea
        id="accept-rationale"
        value={rationale}
        onChange={(e) => onRationale(e.target.value)}
        rows={5}
        // 16px minimum, or iOS zooms the viewport on focus.
        className="mt-1.5 w-full resize-none rounded-xl border border-border bg-card p-3 text-base outline-none"
        placeholder="Recorded against the deal and audited."
      />
      <p className="m-caption m-muted mt-1">
        {short
          ? `${RATIONALE_MIN_LENGTH - rationale.trim().length} more characters needed`
          : "Recorded against the deal and audited."}
      </p>

      <button
        type="button"
        disabled={short || pending}
        onClick={onConfirm}
        className="m-label m-press m-tap mt-3 w-full rounded-full border border-destructive py-3 text-destructive disabled:opacity-40"
      >
        Accept the risk
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="m-label m-press m-tap m-muted mt-1 w-full py-3"
      >
        Cancel
      </button>

      <WriteErrorInline outcome={outcome} />
    </section>
  );
}
