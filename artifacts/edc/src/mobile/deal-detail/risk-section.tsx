import type { Alert, Intelligence } from "@workspace/api-client-react";
import { humanizeCode } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RISK_LEVEL_CLASS, RISK_LEVEL_LABEL } from "@/lib/semantic-colors";
import { alertBody } from "@/mobile/lib/alert-text";
import { CollapsibleSection } from "@/mobile/components/collapsible-section";

const SEVERITY_TONE: Record<string, string> = {
  RED: RISK_LEVEL_CLASS.HIGH.text,
  YELLOW: RISK_LEVEL_CLASS.MODERATE.text,
  GREEN: RISK_LEVEL_CLASS.LOW.text,
};

/**
 * Risk, read-only. The desktop cockpit lets an admin accept, acknowledge or
 * snooze an alert; here the dispositions are shown as state, because that
 * state is the thing a commander in the field needs to know — whether
 * somebody has already dealt with this.
 */
export function RiskSection({ intel }: { intel: Intelligence }) {
  const { risk, governance } = intel;
  const live = governance.alerts;
  const managed = governance.managedAlerts;

  const verdict = (
    <>
      <p className={cn("m-title", RISK_LEVEL_CLASS[risk.riskLevel].text)}>
        {RISK_LEVEL_LABEL[risk.riskLevel]}
        <span className="m-caption m-muted ml-2">{risk.compositeScore}</span>
      </p>
      <p className="m-caption m-muted mt-1">
        {live.length === 0
          ? managed.length > 0
            ? `No open alerts · ${managed.length} managed`
            : "No open alerts"
          : `${live.length} open alert${live.length === 1 ? "" : "s"}${
              managed.length ? ` · ${managed.length} managed` : ""
            }`}
      </p>
    </>
  );

  const hasBody = live.length > 0 || managed.length > 0 || risk.topDrivers.length > 0;

  return (
    <CollapsibleSection anchorId="risk" label="Risk" verdict={verdict}>
      {hasBody ? (
        <div className="space-y-4">
          {live.length > 0 ? <AlertList title="Open" alerts={live} /> : null}
          {managed.length > 0 ? <AlertList title="Managed" alerts={managed} muted /> : null}
          {risk.topDrivers.length > 0 ? (
            <div>
              <p className="m-label m-muted mb-2">Top drivers</p>
              <ul className="space-y-1.5">
                {risk.topDrivers.slice(0, 4).map((driver, i) => (
                  <li key={i} className="m-caption flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1">{humanizeCode(driver.factor)}</span>
                    <span className="m-muted shrink-0">{Math.round(driver.impact)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : undefined}
    </CollapsibleSection>
  );
}

function AlertList({
  title,
  alerts,
  muted = false,
}: {
  title: string;
  alerts: Alert[];
  muted?: boolean;
}) {
  return (
    <div>
      <p className="m-label m-muted mb-2">{title}</p>
      <ul className="space-y-3">
        {alerts.map((alert) => (
          <li key={`${alert.code}-${alert.severity}`} className={cn(muted && "opacity-75")}>
            <p className={cn("m-headline", SEVERITY_TONE[alert.severity] ?? "")}>
              {humanizeCode(alert.code)}
            </p>
            {/* alertBody, not alert.message: the engine prefixes the message
                with the same pattern name printed on the line above, in block
                caps. */}
            <p className="m-body m-muted mt-0.5">{alertBody(alert)}</p>
            {alert.disposition ? (
              <p className="m-caption m-muted mt-1">
                {humanizeCode(alert.disposition.state)}
                {alert.disposition.createdBy ? ` by ${alert.disposition.createdBy}` : ""}
                {alert.disposition.rationale ? ` — ${alert.disposition.rationale}` : ""}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
