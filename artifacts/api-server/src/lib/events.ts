import { EventEmitter } from "node:events";
import { logger } from "./logger";

/**
 * In-process, typed domain event bus for the Phase 2 durable backbone.
 *
 * Phase 1 write paths publish events here AFTER a successful mutation. The bus
 * is intentionally in-process (one emitter per server process) — no Redis or
 * external broker is required. Subscribers (activity logger, snapshot service,
 * health tracker, cache invalidation) react asynchronously and MUST NOT throw
 * back into the request path; `emitDealEvent` swallows listener errors so a
 * failing subscriber can never break a Phase 1 response.
 */

export interface DealEventBase {
  /** The deal the event pertains to. */
  dealId: string;
  /** Human/display name of the actor who triggered the change. */
  actor: string;
  /** When the event occurred (defaults to emit time). */
  occurredAt: Date;
  /**
   * The emitting request's Catalyst Data Store handle, so Data-Store-backed
   * subscribers (activity logger, health tracker, snapshot service, playbook
   * engine, post-mortem, pipeline transitions, webhook dispatcher,
   * notification service, scoring) can perform their own repo calls without
   * a `req` of their own. Typed as `unknown` here (not `CatalystApp`) so this
   * module — otherwise completely DB-agnostic — doesn't need a hard
   * dependency on `@workspace/db/catalyst`; subscribers cast it themselves.
   * Optional and may be `undefined`: not every emitter has migrated off
   * Drizzle yet (as of this writing, every route handler has — the last
   * holdout, `lib/meddpicc-playbook-gate.ts`'s internal `emitStepChanged`,
   * is unreachable in production now that its only caller,
   * `lib/meddpicc.ts`'s `computeMeddpiccScoreForDeal`, has no live callers
   * of its own — see `lib/catalyst/meddpicc-playbook-gate.ts`'s equivalent,
   * which does pass `catalystApp`) — a Data-Store-backed subscriber MUST
   * still treat a missing value as a no-op, never a throw, matching the
   * event bus's existing "never break the request path" contract.
   */
  catalystApp?: unknown;
}

export type DealEventPayloads = {
  "deal.created": DealEventBase & { dealName: string };
  "deal.updated": DealEventBase & { changedFields: string[] };
  "deal.stage_changed": DealEventBase & {
    fromStageId: number | null;
    toStageId: number;
    overridden: boolean;
  };
  "deal.deleted": DealEventBase;
  "deal.restored": DealEventBase;
  "deal.archived": DealEventBase;
  "gate.toggled": DealEventBase & {
    gateCode: string;
    isCompleted: boolean;
  };
  "blocker.created": DealEventBase & {
    blockerId: string;
    description: string;
  };
  "blocker.resolved": DealEventBase & {
    blockerId: string;
    isResolved: boolean;
  };
  "health.changed": DealEventBase & {
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
  };
  "deal.autopsy_captured": DealEventBase & {
    qualityScore: number;
  };
  "playbook.step_changed": DealEventBase & {
    assignmentId: string;
    stepId: string;
    action: "completed" | "skipped" | "blocked" | "reopened";
  };
  "playbook.assigned": DealEventBase & {
    assignmentId: string;
    playbookId: string;
  };
  "meddpicc.answer_changed": DealEventBase & {
    questionOrder: number;
    score: number;
  };
};

export type DealEventType = keyof DealEventPayloads;

/** A discriminated union of every event flowing through the bus. */
export type DealEvent = {
  [K in DealEventType]: { type: K } & DealEventPayloads[K];
}[DealEventType];

export type DealEventListener = (event: DealEvent) => void | Promise<void>;

class DealEventBus {
  private readonly emitter = new EventEmitter();
  private static readonly CHANNEL = "deal-event";

  constructor() {
    // We manage many subscribers across the lifetime of the process; the
    // default limit of 10 would emit spurious warnings.
    this.emitter.setMaxListeners(50);
  }

  /** Register a listener for ALL deal events. */
  on(listener: DealEventListener): () => void {
    const wrapped = (event: DealEvent) => {
      void this.run(listener, event);
    };
    this.emitter.on(DealEventBus.CHANNEL, wrapped);
    return () => this.emitter.off(DealEventBus.CHANNEL, wrapped);
  }

  /** Publish an event. Never throws; subscriber failures are logged only. */
  emit<K extends DealEventType>(
    type: K,
    payload: Omit<DealEventPayloads[K], "occurredAt"> &
      Partial<Pick<DealEventBase, "occurredAt">>,
  ): void {
    const event = {
      type,
      occurredAt: payload.occurredAt ?? new Date(),
      ...payload,
    } as DealEvent;
    try {
      this.emitter.emit(DealEventBus.CHANNEL, event);
    } catch (err) {
      logger.error({ err, eventType: type }, "Failed to emit deal event");
    }
  }

  private async run(listener: DealEventListener, event: DealEvent) {
    try {
      await listener(event);
    } catch (err) {
      logger.error(
        { err, eventType: event.type, dealId: event.dealId },
        "Deal event subscriber failed",
      );
    }
  }
}

/** Process-wide singleton event bus. */
export const dealEvents: DealEventBus = new DealEventBus();

/**
 * Fire-and-forget helper for use inside request handlers. Emitting is
 * synchronous and guarded, but this wrapper makes the "never block the
 * response" intent explicit at call sites.
 */
export function emitDealEvent<K extends DealEventType>(
  type: K,
  payload: Omit<DealEventPayloads[K], "occurredAt"> &
    Partial<Pick<DealEventBase, "occurredAt">>,
): void {
  dealEvents.emit(type, payload);
}
