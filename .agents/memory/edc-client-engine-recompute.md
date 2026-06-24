---
name: EDC client-side engine recompute
description: How/why the Risk Simulator and historical Briefing re-run the pure intelligence engine in the browser, and the fidelity limits to respect.
---

The Risk Simulator and the Briefing's historical date view both re-run the pure `@workspace/engine` (`processDealIntelligence` + `calculateOwnMomentum`) client-side. The shared reconstruction lives in one module (`engine-recompute.ts`: `useEngineContext` + `recomputeIntelligence`) — keep both consumers on it so there is a single reconstruction path and no divergence.

**Why:** the engine is intentionally isomorphic; duplicating the RawDeal/RawGate/RawBlocker reconstruction in two components risks the simulator baseline drifting from the live cockpit.

**Fidelity limits to respect:**
- Own-momentum on the client is computed from the audit list endpoint, which caps at 200 rows (the server computes from all rows). Momentum windows are time-bounded, so 200 newest rows is faithful for realistic single-user volumes; do not assume parity for pathologically active deals.
- The server snapshot endpoint reconstructs **gate state only** — the returned `deal`/`salesStage` are current values, not historical. So the historical Briefing recomputes technical progress + gate-driven risk posture as-of, but economics and sales stage stay current (the UI says so in an amber banner). Do not present financials/stage as historical.
- The Briefing date `<input type=date>` fires the snapshot query on intermediate keystrokes, producing a transient 400 that self-recovers. Pre-existing; only worth fixing if it becomes user-visible.

**How to apply:** when changing engine inputs or the simulator/briefing, edit `engine-recompute.ts` once; reset simulator local state on dialog open (`useEffect` on `open`) so reopening shows current deal values, not stale edits.

**Provenance seededDefaults trap:** the engine decides threshold "tuned" vs "default" by comparing active thresholds against `ctx.seededDefaults`. Both adapters MUST seed with the true defaults (`DEFAULT_THRESHOLDS`), not the already-tuned active thresholds — seeding with the active set makes every threshold report "default" and the simulator's explanation badges silently diverge from the server. A parity test (`engine-recompute.test.ts`) now guards this round-trip.
