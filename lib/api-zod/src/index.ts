export * from "./generated/api";
export * from "./generated/types";

// Resolve TS2308 ambiguity: for endpoints with BOTH a path param and query
// params, Orval emits a zod path-param schema `<Op>Params` in generated/api.ts
// AND a TS query-param type `<Op>Params` in generated/types/. The explicit
// re-export below makes the zod (runtime) version authoritative and removes the
// star-export ambiguity. Add a line here whenever a new path+query endpoint is
// introduced.
export {
  GetSnapshotParams,
  ListAuditParams,
  ListBlockersParams,
  ListChangesParams,
  ListDealActivityParams,
  ListDealHealthHistoryParams,
  ListDealSnapshotsParams,
} from "./generated/api";

// Same TS2308 ambiguity, but for request-body schemas: Orval emits a zod
// request-body schema in generated/api.ts AND a TS interface of the same
// name in generated/types/ for these two operations' bodies. Re-export the
// zod (runtime) version as authoritative, same pattern as above.
export { RollbackSettingsChangeBody, ImportSettingsConfigBody, DashboardVisitResponse } from "./generated/api";
