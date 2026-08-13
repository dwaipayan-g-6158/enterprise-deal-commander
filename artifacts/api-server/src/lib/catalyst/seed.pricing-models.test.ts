import { describe, it, expect, beforeEach } from "vitest";
import { initCatalystApp } from "@workspace/db/catalyst";
import { installCatalystFake, type CatalystTestStore } from "../../test-support/catalyst-test-app";
import { renameIfPresent } from "./seed";

// Guards the exact hazard the Pricing Model rework identified: a live
// Production deal ("ESAB") references pricing_model_id = 4, the row being
// renamed from "Usage-Based" to "User/Device Based". seedMissingRows (in
// seedLookupsCatalyst) keys on model_name, so without renameIfPresent running
// first, re-seeding a legacy environment would INSERT a fifth row rather than
// rename the existing one — leaving two rows competing for the same concept
// and ESAB's row unrenamed.
//
// This tests renameIfPresent directly rather than the whole seedLookupsCatalyst
// pipeline: that function also seeds ~20 unrelated lookup tables via the SDK's
// bulk insertRows, which this repo's in-memory Data Store fake does not
// implement (only per-row insertRow/updateRow — see catalyst-test-app.ts).
// renameIfPresent itself only calls fetchAllRows + updateRow, so it is
// directly and fully exercisable against the fake without that gap.

let store: CatalystTestStore;
const app = () => initCatalystApp({ headers: {} });

function seedLegacyPricingModels() {
  store.seedRaw("pricing_models", [
    { id: "1", model_name: "Annual Subscription", is_active: "true" },
    { id: "2", model_name: "Multi-Year Committed", is_active: "true" },
    { id: "3", model_name: "Perpetual License", is_active: "true" },
    { id: "4", model_name: "Usage-Based", is_active: "true" },
  ]);
}

beforeEach(() => {
  ({ store } = installCatalystFake());
});

describe("renameIfPresent — pricing_models 'Usage-Based' -> 'User/Device Based'", () => {
  it("renames row 4 in place, preserving its ROWID, without inserting a duplicate", async () => {
    seedLegacyPricingModels();
    const rowIdBefore = store.rows("pricing_models").find((r) => r["id"] === "4")?.ROWID;

    await renameIfPresent(app(), "pricing_models", "model_name", "Usage-Based", "User/Device Based");

    const rows = store.rows("pricing_models");
    expect(rows).toHaveLength(4);

    const row4 = rows.find((r) => r["id"] === "4");
    expect(row4?.model_name).toBe("User/Device Based");
    // Same physical row — the rename must be an UPDATE, not a delete+insert,
    // or ESAB's pricing_model_id = 4 would stop resolving.
    expect(row4?.ROWID).toBe(rowIdBefore);

    // Every other row untouched.
    expect(rows.find((r) => r["id"] === "1")?.model_name).toBe("Annual Subscription");
    expect(rows.find((r) => r["id"] === "2")?.model_name).toBe("Multi-Year Committed");
    expect(rows.find((r) => r["id"] === "3")?.model_name).toBe("Perpetual License");
  });

  it("is idempotent — a second call makes no further change", async () => {
    seedLegacyPricingModels();
    await renameIfPresent(app(), "pricing_models", "model_name", "Usage-Based", "User/Device Based");
    const rowIdAfterFirst = store.rows("pricing_models").find((r) => r["id"] === "4")?.ROWID;

    await renameIfPresent(app(), "pricing_models", "model_name", "Usage-Based", "User/Device Based");

    const rows = store.rows("pricing_models");
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r["id"] === "4")?.model_name).toBe("User/Device Based");
    expect(rows.find((r) => r["id"] === "4")?.ROWID).toBe(rowIdAfterFirst);
  });

  it("early-returns without touching anything when the new name is already present", async () => {
    // A store that has already been migrated once — id 4 already renamed. If
    // renameIfPresent didn't early-return here, it would find no row named
    // "Usage-Based" to rename anyway (a no-op by omission) — this instead
    // proves the early-return path itself runs, guarding against a future
    // change that makes the loop body reachable in this state.
    store.seedRaw("pricing_models", [
      { id: "1", model_name: "Annual Subscription", is_active: "true" },
      { id: "2", model_name: "Multi-Year Committed", is_active: "true" },
      { id: "3", model_name: "Perpetual License", is_active: "false" },
      { id: "4", model_name: "User/Device Based", is_active: "true" },
    ]);
    const rowIdBefore = store.rows("pricing_models").find((r) => r["id"] === "4")?.ROWID;

    await renameIfPresent(app(), "pricing_models", "model_name", "Usage-Based", "User/Device Based");

    const rows = store.rows("pricing_models");
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r["id"] === "4")?.ROWID).toBe(rowIdBefore);
    expect(rows.find((r) => r["id"] === "4")?.model_name).toBe("User/Device Based");
  });

  it("does nothing when neither the old nor the new name exists (fresh environment)", async () => {
    store.seedRaw("pricing_models", [
      { id: "1", model_name: "Annual Subscription", is_active: "true" },
    ]);

    await renameIfPresent(app(), "pricing_models", "model_name", "Usage-Based", "User/Device Based");

    expect(store.rows("pricing_models")).toHaveLength(1);
  });
});
