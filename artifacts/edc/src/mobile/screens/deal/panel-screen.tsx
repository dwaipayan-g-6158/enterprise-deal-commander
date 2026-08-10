import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useGetDealIntelligence } from "@workspace/api-client-react";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { Shimmer, ShimmerLines } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { panelById } from "@/mobile/nav/routes";
import { UndoBar } from "@/mobile/write/undo-bar";
import { useGateToggle } from "@/mobile/write/use-gate-toggle";
import { usePlaybookStep } from "@/mobile/write/use-playbook-step";
import { useRiskDisposition } from "@/mobile/write/use-risk-disposition";
import { PANEL_BODIES } from "@/mobile/screens/deal/panels";

/**
 * The host for all sixteen pushed panels.
 *
 * One route (`/deals/:id/:panel`) and one table lookup, rather than sixteen
 * `<Route>` elements. The nav bar, the back target, the deal-name subtitle and
 * the undo bar are identical on every panel, so they are written once here; a
 * panel body is only its content.
 *
 * ## The undo bar lives here, not in the shell
 *
 * Undo has to call the same hooks that made the write, and those hooks are
 * per-deal — `useGateToggle(dealId)`. A shell-level bar would have no deal to
 * bind to. Mounting it on the panel host is also where it belongs semantically:
 * the offer is made by a screen and should not outlive it, which is why UndoBar
 * clears itself on the first navigation after it opens.
 *
 * Absolutely positioned inside a static `<main>`, so its containing block is the
 * shell frame — it holds still above the tab bar while the panel scrolls.
 */
export function DealPanelScreen({ id, panelId }: { id: string; panelId: string }) {
  const panel = panelById(panelId);
  const intelQuery = useGetDealIntelligence(id);
  const dealName = intelQuery.data?.data?.dealName;

  const gate = useGateToggle(id);
  const playbook = usePlaybookStep(id);
  const disposition = useRiskDisposition(id);

  // An unknown segment is a mistyped or stale URL, not an error worth a screen.
  // Falling back to the Brief lands the reader on the thing they were reaching
  // into rather than on a dead end. `transition={false}` because <Redirect>
  // navigates from a layout effect, where aroundNav's flushSync is unsafe.
  if (!panel) return <Redirect to={`/deals/${id}`} transition={false} />;

  const Body = PANEL_BODIES[panel.id];

  return (
    <>
      <MNavBar
        title={panel.title}
        subtitle={dealName}
        backHref={`/deals/${id}`}
        backLabel="Back to deal"
      />

      <div className="space-y-3 px-4 pb-6 pt-3">
        <Body dealId={id} />
      </div>

      <UndoBar
        onUndo={(entry) => {
          const action = entry.action;
          switch (action.kind) {
            case "gate":
              // The inverse toggle, and it must not offer an undo of its own —
              // an undo bar that undoes an undo is a loop with no exit.
              void gate.toggle(action.gateCode, !action.wasCompleted, {
                label: action.label,
                offerUndoWindow: false,
              });
              return;
            case "playbook-step":
              void playbook.reopenStep(action.assignmentId, action.stepId, action.label);
              return;
            case "disposition":
              void disposition.clear(action.patternCode);
              return;
          }
        }}
      />
    </>
  );
}

/** Every panel body takes exactly this. */
export interface PanelBodyProps {
  dealId: string;
}

/**
 * The three states every panel shares, in one place.
 *
 * Sixteen panels each hand-rolling a shimmer, an error and an empty state is
 * sixteen chances for them to disagree — which on a phone reads as sixteen
 * different apps. The copy is passed in; the shape is not.
 */
export function PanelBody({
  loading,
  error,
  empty,
  emptyTitle,
  emptyBody,
  errorBody = "Pull down on the deal to try again, or check your connection.",
  children,
}: {
  loading: boolean;
  error: boolean;
  empty?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  errorBody?: string;
  children: ReactNode;
}) {
  if (error) return <ErrorState title="Couldn't load this" body={errorBody} />;

  if (loading) {
    return (
      <div className="space-y-3">
        <Shimmer className="h-24 rounded-xl" />
        <div className="m-card p-4">
          <ShimmerLines lines={4} />
        </div>
      </div>
    );
  }

  if (empty) {
    return <EmptyState title={emptyTitle ?? "Nothing here yet"} body={emptyBody ?? ""} />;
  }

  return <>{children}</>;
}
