import { describe, it, expect } from "vitest";
import { computeRollback } from "./settings-audit";

describe("computeRollback", () => {
  it("an 'update' rolls back to another 'update' restoring the old value", () => {
    const result = computeRollback({
      module: "engine_thresholds",
      settingKey: "elephant_tcv_threshold",
      entityId: null,
      action: "update",
      oldValue: "250000",
      newValue: "500000",
    });
    expect(result).toEqual({
      module: "engine_thresholds",
      settingKey: "elephant_tcv_threshold",
      entityId: null,
      action: "update",
      valueToRestore: "250000",
    });
  });

  it("a 'create' rolls back to a 'deactivate'", () => {
    const result = computeRollback({
      module: "competitors",
      settingKey: "name",
      entityId: "42",
      action: "create",
      oldValue: null,
      newValue: { name: "Acme Corp" },
    });
    expect(result.action).toBe("deactivate");
    expect(result.entityId).toBe("42");
  });

  it("a 'deactivate' rolls back to a 'reactivate'", () => {
    const result = computeRollback({
      module: "team_members",
      settingKey: "name",
      entityId: "7",
      action: "deactivate",
      oldValue: { isActive: true },
      newValue: { isActive: false },
    });
    expect(result.action).toBe("reactivate");
  });

  it("a 'delete' rolls back to a 'create' restoring the deleted value", () => {
    const result = computeRollback({
      module: "webhooks",
      settingKey: "webhook_name",
      entityId: "abc",
      action: "delete",
      oldValue: { webhookName: "Slack alerts" },
      newValue: null,
    });
    expect(result.action).toBe("create");
    expect(result.valueToRestore).toEqual({ webhookName: "Slack alerts" });
  });

  it("throws for an action it doesn't know how to invert", () => {
    expect(() =>
      computeRollback({
        module: "x",
        settingKey: "y",
        entityId: null,
        action: "rollback",
        oldValue: null,
        newValue: null,
      }),
    ).toThrow(/Cannot compute rollback/);
  });
});
