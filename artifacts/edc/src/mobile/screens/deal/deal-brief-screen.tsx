import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactCurrency, formatDate, formatTerm, humanizeCode } from "@/lib/format";
import { HEALTH_CLASS } from "@/lib/semantic-colors";
import { sharedCardSeed } from "@/mobile/lib/shared-card";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { ListRow } from "@/mobile/components/list-row";
import { Shimmer } from "@/mobile/components/shimmer";
import { ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import {
  DEAL_PANELS,
  PANEL_GROUP_LABEL,
  PANEL_GROUP_ORDER,
  panelHref,
  type PanelGroup,
} from "@/mobile/nav/routes";
import { BriefHero, BriefHeroPreview } from "@/mobile/screens/deal/brief-hero";
import { buildBriefActions } from "@/mobile/screens/deal/brief-actions";
import { buildDealVerdict } from "@/mobile/screens/deal/deal-verdict";
import { useDealBrief } from "@/mobile/screens/deal/use-deal-brief";

/**
 * One deal, as a brief.
 *
 * ## Menu, not scroll
 *
 * The screen this replaces was eight collapsible sections in one column — every
 * fact on the deal reachable, provided you were willing to scroll past seven
 * other topics to find it, and provided the fact was one of the eight it
 * carried. Seven of the desktop cockpit's thirteen sub-tabs were simply absent.
 *
 * This is the iOS Health pattern instead: a Brief that states the deal's
 * condition and lists what there is to know, with each item a real pushed screen
 * at its own URL. Sixteen panels against desktop's thirteen sub-tabs, so parity
 * is a superset rather than a compromise, and every one of them is deep-linkable
 * and shareable.
 *
 * ## The header's trailing slot is empty, deliberately
 *
 * Briefing is a presentation, Simulate is a bank of sliders, Bat-Signal is a
 * write this shell does not ship and Edit is a twenty-field form. All four are
 * desktop work. An empty corner is the right answer when nothing belongs in it;
 * a menu button that opens four things nobody can use on a phone is worse than
 * nothing.
 */
export function DealBriefScreen({ id }: { id: string }) {
  // What the roster card knew, if this screen was opened by tapping one. Read
  // once at mount: the morph is released as soon as the transition settles, and
  // the loading hero below outlives that.
  const [seed] = useState(() => sharedCardSeed(id));
  const { intel, score, tags, enrichment, isError, refresh } = useDealBrief(id);

  const verdict = useMemo(() => {
    if (!intel) return null;
    const open = intel.governance.alerts;
    return buildDealVerdict({
      riskLevel: intel.risk.riskLevel,
      openRedAlerts: open.filter((a) => a.severity === "RED").length,
      openYellowAlerts: open.filter((a) => a.severity !== "RED").length,
      managedAlerts: intel.governance.managedAlerts.length,
      gatesPct: intel.technicalTrack.progressPercentage,
      stage: intel.salesStage,
      daysInStage: intel.daysInStage,
      daysToClose: intel.financials.daysToClose ?? null,
      benchmarkDays: enrichment?.benchmarkDays ?? null,
    });
  }, [intel, enrichment]);

  const actions = useMemo(
    () => buildBriefActions(intel?.risk.recommendedActions),
    [intel],
  );

  if (isError) {
    return (
      <>
        <MNavBar title="Deal" backHref="/deals" backLabel="Back to deals" />
        <ErrorState
          title="Couldn't load this deal"
          body="It may have been archived, or the connection dropped. Go back and try again."
        />
      </>
    );
  }

  if (!intel) {
    return (
      <>
        <MNavBar
          title={seed?.title ?? "Deal"}
          subtitle={seed?.eyebrow}
          backHref="/deals"
          backLabel="Back to deals"
        />
        {seed ? (
          <BriefHeroPreview dealId={id} seed={seed} />
        ) : (
          <div className="space-y-3 p-4">
            <Shimmer className="h-8 w-48" />
            <Shimmer className="h-10 w-36" />
          </div>
        )}
        <div className="space-y-3 p-4">
          <Shimmer className="h-24 rounded-xl" />
          <Shimmer className="h-40 rounded-xl" />
        </div>
      </>
    );
  }

  const { financials, team } = intel;
  const money = (n: number) => compactCurrency(n, financials.dealCurrency);

  return (
    <>
      <MNavBar
        title={intel.dealName}
        subtitle={intel.accountName}
        backHref="/deals"
        backLabel="Back to deals"
        collapseTitle
      />

      <PullToRefresh onRefresh={refresh}>
        <BriefHero intel={intel} dealId={id} tags={tags} />

        <div className="space-y-3 px-4 pb-6 pt-2">
          {verdict ? (
            <VerdictLine dealId={id} tone={verdict.tone} sentence={verdict.sentence} panel={verdict.panel} />
          ) : null}

          {actions.length > 0 ? (
            <MobileCard>
              <CardHeader
                label="What needs you now"
                action={
                  <Link href={panelHref(id, "coaching")} className="m-caption text-primary">
                    All coaching
                  </Link>
                }
              />
              <ul>
                {actions.map((action) => (
                  <li key={action.id}>
                    <ListRow
                      href={panelHref(id, action.panel)}
                      media={
                        action.blocking ? (
                          <ShieldAlert
                            className={cn("h-4 w-4", HEALTH_CLASS.RED.text)}
                            aria-hidden="true"
                          />
                        ) : undefined
                      }
                      title={action.action}
                      // A recommended action is a sentence, not a label — one
                      // line cut "Cannot advance stage: Gate 3 (Performance)…"
                      // to its first three words. The priority beside it is the
                      // hint, so the sentence gets the room.
                      titleLines={2}
                      trailing={humanizeCode(action.priority)}
                    />
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}

          {/* The stage row, with the deal's one primary action on it. */}
          <Link href={panelHref(id, "stage")} className="m-card m-press m-reveal block p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-label m-muted">Stage</p>
                <p className="m-headline mt-0.5 truncate">{intel.salesStage}</p>
                <p className="m-caption m-muted mt-0.5">
                  {intel.daysInStage}d in stage
                  {financials.expectedCloseDate
                    ? ` · closes ${formatDate(financials.expectedCloseDate, "—")}`
                    : ""}
                </p>
              </div>
              <span className="m-label shrink-0 text-primary">Advance</span>
              <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
            </div>
          </Link>

          <MobileCard>
            <CardHeader label="Money" />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Figure label="Total contract" value={money(financials.calculatedTCV)} />
              <Figure
                label={`Normalized (${financials.reportingCurrency})`}
                value={compactCurrency(financials.normalizedTCV, financials.reportingCurrency)}
              />
              <Figure label="Product" value={money(financials.productRevenue)} />
              <Figure label="Services" value={money(financials.servicesRevenue)} />
              <Figure label="Pricing" value={financials.pricingModel} />
              <Figure label="Term" value={formatTerm(financials.termYears, financials.isPerpetualTerm, "short")} />
              {score ? (
                <Figure
                  label="Close score"
                  value={`${score.score}`}
                  detail={`${humanizeCode(score.confidence)} confidence`}
                />
              ) : null}
              {financials.winProbability != null ? (
                <Figure label="Win probability" value={`${Math.round(financials.winProbability)}%`} />
              ) : null}
            </dl>
            <p className="m-caption m-muted mt-3">
              {team.accountManager} · {team.technicalLead}
            </p>
          </MobileCard>

          <DrillList dealId={id} />
        </div>
      </PullToRefresh>
    </>
  );
}

/**
 * The verdict, and a way to act on it.
 *
 * Tappable only when there is a panel that answers it — a steady verdict has
 * nowhere useful to go, and a row that looks tappable and does nothing is worse
 * than a plain sentence.
 */
function VerdictLine({
  dealId,
  tone,
  sentence,
  panel,
}: {
  dealId: string;
  tone: "critical" | "caution" | "steady";
  sentence: string;
  panel: string | null;
}) {
  const body = (
    <p className={cn("m-headline text-pretty", tone === "critical" && "text-destructive")}>
      {sentence}
    </p>
  );

  if (!panel) return <MobileCard>{body}</MobileCard>;

  return (
    <Link href={panelHref(dealId, panel)} className="m-card m-press m-reveal block p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{body}</div>
        <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
      </div>
    </Link>
  );
}

function Figure({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="m-label m-muted truncate">{label}</dt>
      <dd className="m-headline m-num mt-0.5 truncate">{value}</dd>
      {detail ? <p className="m-caption m-muted truncate">{detail}</p> : null}
    </div>
  );
}

/**
 * Everything there is to know about the deal, grouped the way the cockpit groups
 * it — because a reader who uses both shells should not have to learn the
 * taxonomy twice.
 *
 * `stage` is filtered out: it is the primary action above, and listing it again
 * here would be the same destination twice on one screen.
 */
function DrillList({ dealId }: { dealId: string }) {
  return (
    <nav aria-label="Deal detail">
      {PANEL_GROUP_ORDER.map((group) => (
        <section key={group} className="mt-4 first:mt-0">
          <h2 className="m-label m-muted mb-1.5 px-1">{PANEL_GROUP_LABEL[group]}</h2>
          <ul className="m-card overflow-hidden">
            {panelsIn(group).map((panel, i) => (
              <li key={panel.id} className={cn(i > 0 && "border-t border-border")}>
                <Link
                  href={panelHref(dealId, panel.id)}
                  className="m-tap m-press flex items-center gap-3 px-4 py-3.5"
                >
                  <span className="m-headline min-w-0 flex-1 truncate">{panel.title}</span>
                  <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function panelsIn(group: PanelGroup) {
  return DEAL_PANELS.filter((p) => p.group === group);
}
