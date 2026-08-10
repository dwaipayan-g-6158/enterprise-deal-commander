/**
 * Pure cache patchers for the four mobile write actions.
 *
 * Separated from the hooks so the reasoning can be tested without React Query,
 * a network, or a rendered tree. Every one of these follows the same contract as
 * `patchDealStage` in the roster model: if the cached value does not contain the
 * thing being patched, return it BY REFERENCE. `setQueriesData` fans out across
 * every cached variant, and a fresh object for an untouched variant re-renders
 * every list in the app on every tap.
 *
 * Relative imports only — node-tested, and the standalone vitest config has no
 * alias resolution.
 */

export type StepStatus = "completed" | "skipped" | "blocked";

/* ------------------------------------------------------------------ gates -- */

interface Gateish {
  gateCode?: string;
  code?: string;
  isCompleted?: boolean;
}

/** Flips one gate inside a `GET /deals/:id/gates` response. */
export function patchGateList(cached: unknown, gateCode: string, isCompleted: boolean): unknown {
  if (!cached || typeof cached !== "object") return cached;
  const c = cached as { data?: Gateish[] };
  if (!Array.isArray(c.data)) return cached;

  let changed = false;
  const data = c.data.map((gate) => {
    if ((gate.gateCode ?? gate.code) !== gateCode) return gate;
    if (gate.isCompleted === isCompleted) return gate;
    changed = true;
    return { ...gate, isCompleted };
  });
  return changed ? { ...c, data } : cached;
}

interface TechnicalTrack {
  gates?: Gateish[];
  stepsCompleted?: number;
  totalSteps?: number;
  progressPercentage?: number;
}

/**
 * Flips the same gate inside the intelligence payload, and RECOMPUTES the
 * rollups.
 *
 * The gate list and the intelligence summary are two caches holding the same
 * fact. Patching only one leaves the deal screen saying 62% while the panel one
 * tap away says 69% — a disagreement the reader has no way to resolve and every
 * reason to distrust. Recomputing here is what keeps them honest until the
 * invalidation lands.
 */
export function patchIntelligenceGates(
  cached: unknown,
  gateCode: string,
  isCompleted: boolean,
): unknown {
  if (!cached || typeof cached !== "object") return cached;
  const c = cached as { data?: { technicalTrack?: TechnicalTrack } };
  const track = c.data?.technicalTrack;
  if (!track || !Array.isArray(track.gates)) return cached;

  let changed = false;
  const gates = track.gates.map((gate) => {
    if ((gate.gateCode ?? gate.code) !== gateCode) return gate;
    if (gate.isCompleted === isCompleted) return gate;
    changed = true;
    return { ...gate, isCompleted };
  });
  if (!changed) return cached;

  const total = track.totalSteps ?? gates.length;
  const completed = gates.filter((g) => g.isCompleted).length;

  return {
    ...c,
    data: {
      ...c.data,
      technicalTrack: {
        ...track,
        gates,
        stepsCompleted: completed,
        progressPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
    },
  };
}

/* ----------------------------------------------------------- dispositions -- */

interface Alertish {
  code?: string;
  patternCode?: string;
  disposition?: string | null;
}

interface Governance {
  alerts?: Alertish[];
  managedAlerts?: Alertish[];
}

/**
 * Moves an alert from open to managed.
 *
 * The payoff is larger than the deal screen: "What needs you now" on the Command
 * Center reads the same cache, so an alert dispositioned in the field disappears
 * from the home screen's to-do list in the same frame, with no refetch.
 */
export function patchAlertDisposition(
  cached: unknown,
  patternCode: string,
  disposition: string,
): unknown {
  if (!cached || typeof cached !== "object") return cached;
  const c = cached as { data?: { governance?: Governance } };
  const governance = c.data?.governance;
  if (!governance || !Array.isArray(governance.alerts)) return cached;

  const match = (a: Alertish) => (a.patternCode ?? a.code) === patternCode;
  const moving = governance.alerts.find(match);
  if (!moving) return cached;

  return {
    ...c,
    data: {
      ...c.data,
      governance: {
        ...governance,
        alerts: governance.alerts.filter((a) => !match(a)),
        managedAlerts: [...(governance.managedAlerts ?? []), { ...moving, disposition }],
      },
    },
  };
}

/** Moves an alert back to open — the undo for acknowledge and snooze. */
export function unpatchAlertDisposition(cached: unknown, patternCode: string): unknown {
  if (!cached || typeof cached !== "object") return cached;
  const c = cached as { data?: { governance?: Governance } };
  const governance = c.data?.governance;
  if (!governance || !Array.isArray(governance.managedAlerts)) return cached;

  const match = (a: Alertish) => (a.patternCode ?? a.code) === patternCode;
  const moving = governance.managedAlerts.find(match);
  if (!moving) return cached;

  const { disposition: _dropped, ...restored } = moving;
  return {
    ...c,
    data: {
      ...c.data,
      governance: {
        ...governance,
        managedAlerts: governance.managedAlerts.filter((a) => !match(a)),
        alerts: [...(governance.alerts ?? []), restored],
      },
    },
  };
}

/* --------------------------------------------------------------- playbook -- */

interface Stepish {
  id?: string;
  stepId?: string;
  status?: string | null;
  note?: string | null;
}

interface Assignmentish {
  id?: string;
  assignmentId?: string;
  steps?: Stepish[];
  completedCount?: number;
  totalCount?: number;
  progressPct?: number;
}

/**
 * Sets a step's state inside a playbook journey and recomputes the rollup.
 *
 * `skipped` counts as done for progress. That is not a shortcut: the panel used
 * to render a skip as a green check, which said "this happened" about something
 * that explicitly did not. The state is preserved distinctly so the UI can show
 * a skip as a skip, while progress still reflects that the step is resolved and
 * no longer blocking.
 */
export function patchPlaybookStep(
  cached: unknown,
  assignmentId: string,
  stepId: string,
  status: StepStatus | null,
  note?: string | null,
): unknown {
  if (!cached || typeof cached !== "object") return cached;
  const c = cached as { data?: { assignments?: Assignmentish[] } };
  const assignments = c.data?.assignments;
  if (!Array.isArray(assignments)) return cached;

  let changed = false;
  const next = assignments.map((assignment) => {
    if ((assignment.assignmentId ?? assignment.id) !== assignmentId) return assignment;
    if (!Array.isArray(assignment.steps)) return assignment;

    let stepChanged = false;
    const steps = assignment.steps.map((step) => {
      if ((step.stepId ?? step.id) !== stepId) return step;
      stepChanged = true;
      return { ...step, status, note: note ?? null };
    });
    if (!stepChanged) return assignment;

    changed = true;
    const total = assignment.totalCount ?? steps.length;
    const completed = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
    return {
      ...assignment,
      steps,
      completedCount: completed,
      progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  return changed ? { ...c, data: { ...c.data, assignments: next } } : cached;
}
