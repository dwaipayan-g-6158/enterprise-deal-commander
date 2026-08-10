import { describe, expect, it } from "vitest";
import { classifyWriteError, FORBIDDEN_PHRASES } from "./write-outcome";

const api = (status: number, error?: Record<string, unknown>) => ({ status, data: { error } });

describe("classifyWriteError", () => {
  it("reads a rejected fetch as offline, and says NOT SAVED", () => {
    // The single most important message in the layer. React Query's default
    // networkMode PAUSES a mutation offline, which makes the globally-mounted
    // OfflineSaveNotice promise "queued, will save automatically" — a promise
    // this app does not keep. networkMode: "always" makes the fetch reject so
    // this branch can tell the truth instead.
    const outcome = classifyWriteError(new TypeError("Failed to fetch"));
    expect(outcome.kind).toBe("offline");
    expect(outcome.message).toMatch(/not saved/i);
    expect(outcome.retryable).toBe(true);
  });

  it("never promises a retry the app does not perform", () => {
    const messages = [
      classifyWriteError(new TypeError("Failed to fetch")),
      classifyWriteError(api(403)),
      classifyWriteError(api(500)),
      classifyWriteError(api(409, { code: "STAGE_GUARDRAIL", patternCodes: ["X"] })),
      classifyWriteError(undefined),
    ].map((o) => o.message);

    for (const message of messages) {
      for (const phrase of FORBIDDEN_PHRASES) {
        expect(phrase.test(message), `"${message}" matched ${phrase}`).toBe(false);
      }
    }
  });

  it("explains a 403 as a role, not as an error", () => {
    // Readers see this one. "Forbidden" tells them the app is broken; the role
    // tells them the app is working and they are not an admin.
    const outcome = classifyWriteError(api(403));
    expect(outcome.kind).toBe("forbidden");
    expect(outcome.message).toMatch(/read-only/i);
    expect(outcome.retryable).toBe(false);
  });

  it("distinguishes the stage guardrail from an ordinary conflict", () => {
    const guardrail = classifyWriteError(
      api(409, { code: "STAGE_GUARDRAIL", message: "Blocked by 2 red alerts", patternCodes: ["A", "B"] }),
    );
    expect(guardrail.kind).toBe("guardrail");
    expect(guardrail.message).toBe("Blocked by 2 red alerts");

    // A 409 carrying patternCodes but no code is still the guardrail — the same
    // tolerance extractGuardrail() applies on the roster.
    expect(classifyWriteError(api(409, { patternCodes: ["A"] })).kind).toBe("guardrail");

    expect(classifyWriteError(api(409, { code: "CONFLICT" })).kind).toBe("conflict");
  });

  it("prefers the server's own message where there is one", () => {
    expect(classifyWriteError(api(422, { message: "Rationale must be at least 10 characters" })).message)
      .toBe("Rationale must be at least 10 characters");
  });

  it("treats a dead session as non-retryable", () => {
    expect(classifyWriteError(api(401)).retryable).toBe(false);
  });

  it("offers a retry on a server fault and states that nothing changed", () => {
    const outcome = classifyWriteError(api(503));
    expect(outcome.kind).toBe("server");
    expect(outcome.retryable).toBe(true);
    expect(outcome.message).toMatch(/nothing changed/i);
  });

  it("degrades safely on a shape it has never seen", () => {
    // Catalyst rejects with plain objects rather than Errors, so `instanceof
    // Error` guards are dead here — the classifier must not assume a shape.
    for (const junk of [undefined, null, {}, "boom", 42, { status: "nope" }]) {
      const outcome = classifyWriteError(junk);
      expect(outcome.kind).toBe("unknown");
      expect(outcome.message.length).toBeGreaterThan(0);
    }
  });
});
