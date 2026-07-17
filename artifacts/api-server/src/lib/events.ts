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
