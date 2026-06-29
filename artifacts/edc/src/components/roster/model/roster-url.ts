// URL <-> RosterView codec. The URL is the shareable source of truth for which
// rows show and in what order. Short keys, comma-separated arrays, defaults
// omitted. Column layout / widths / density are NEVER serialized here (they live
// in localStorage). `view` is a tiny pointer to a saved view.
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  type ColumnId,
  type DealState,
  type GroupBy,
  type Health,
  type CloseDatePreset,
  type RosterFilters,
  type RosterView,
  type SortSpec,
  type VelocityBucket,
} from "./roster-types";

const STATES: DealState[] = ["active", "archived", "deleted"];
const HEALTHS: Health[] = ["GREEN", "YELLOW", "RED"];
const VELOCITIES: VelocityBucket[] = ["FAST", "NORMAL", "SLOW", "STALLED", "NO_DATE"];
const GROUPS: GroupBy[] = ["none", "salesStage", "healthStatus", "accountManager"];
const CLOSE_PRESETS: CloseDatePreset[] = ["any", "overdue", "30d", "60d", "90d", "quarter"];
const SORT_KEYS: ColumnId[] = [
  "dealName",
  "accountName",
  "salesStage",
  "calculatedTCV",
  "healthStatus",
  "riskLevel",
  "score",
  "gatesPct",
  "velocity",
  "accountManager",
  "technicalLead",
  "expectedCloseDate",
];

function csv(v: string[]): string {
  return v.join(",");
}
function splitCsv(v: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}
function intersect<T extends string>(values: string[], allowed: T[]): T[] {
  return values.filter((v): v is T => (allowed as string[]).includes(v));
}
function parseNum(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parseBool(v: string | null): boolean | null {
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

export function encodeSort(sort: SortSpec[]): string {
  return sort.map((s) => (s.dir === "desc" ? `-${s.key}` : s.key)).join(",");
}

export function decodeSort(raw: string | null): SortSpec[] {
  const parts = splitCsv(raw);
  const out: SortSpec[] = [];
  for (const p of parts) {
    const desc = p.startsWith("-");
    const key = (desc ? p.slice(1) : p) as ColumnId;
    if (SORT_KEYS.includes(key)) out.push({ key, dir: desc ? "desc" : "asc" });
  }
  return out;
}

/** Build a query string (no leading `?`). `viewId` is the saved-view pointer. */
export function encodeRosterUrl(view: RosterView, viewId?: string | null): string {
  const f = view.filters;
  const p = new URLSearchParams();

  if (viewId) p.set("view", viewId);
  if (f.search.trim()) p.set("q", f.search.trim());
  if (f.state !== "active") p.set("st", f.state);
  if (f.stage.length) p.set("sg", csv(f.stage));
  if (f.health.length) p.set("h", csv(f.health));
  if (f.velocity.length) p.set("v", csv(f.velocity));
  if (f.tcvMin != null) p.set("tmin", String(f.tcvMin));
  if (f.tcvMax != null) p.set("tmax", String(f.tcvMax));
  if (f.scoreMin != null) p.set("smin", String(f.scoreMin));
  if (f.scoreMax != null) p.set("smax", String(f.scoreMax));
  if (f.closePreset !== "any") p.set("close", f.closePreset);
  if (f.accountManager.length) p.set("am", csv(f.accountManager));
  if (f.technicalLead.length) p.set("tl", csv(f.technicalLead));
  if (f.tags.length) p.set("tags", csv(f.tags));
  if (f.hasBlockers != null) p.set("blk", f.hasBlockers ? "1" : "0");
  if (f.hasCompetitors != null) p.set("cmp", f.hasCompetitors ? "1" : "0");

  const sortStr = encodeSort(view.sort);
  const defaultSortStr = encodeSort(DEFAULT_SORT);
  if (sortStr && sortStr !== defaultSortStr) p.set("so", sortStr);

  if (view.group !== "none") p.set("g", view.group);

  return p.toString();
}

/** Parse a query string (with or without leading `?`) into a view + view pointer. */
export function decodeRosterUrl(search: string): { view: RosterView; viewId: string | null } {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  const state = p.get("st");
  const close = p.get("close");
  const group = p.get("g");

  const filters: RosterFilters = {
    search: p.get("q") ?? "",
    state: state && STATES.includes(state as DealState) ? (state as DealState) : "active",
    stage: splitCsv(p.get("sg")),
    health: intersect(splitCsv(p.get("h")), HEALTHS),
    velocity: intersect(splitCsv(p.get("v")), VELOCITIES),
    tcvMin: parseNum(p.get("tmin")),
    tcvMax: parseNum(p.get("tmax")),
    scoreMin: parseNum(p.get("smin")),
    scoreMax: parseNum(p.get("smax")),
    closePreset: close && CLOSE_PRESETS.includes(close as CloseDatePreset) ? (close as CloseDatePreset) : "any",
    accountManager: splitCsv(p.get("am")),
    technicalLead: splitCsv(p.get("tl")),
    tags: splitCsv(p.get("tags")),
    hasBlockers: parseBool(p.get("blk")),
    hasCompetitors: parseBool(p.get("cmp")),
  };

  const sort = decodeSort(p.get("so"));

  return {
    view: {
      filters,
      sort: sort.length ? sort : DEFAULT_SORT,
      group: group && GROUPS.includes(group as GroupBy) ? (group as GroupBy) : "none",
    },
    viewId: p.get("view"),
  };
}

/** True when the filters/sort/group are all at their defaults (an "empty" view). */
export function isDefaultView(view: RosterView): boolean {
  return encodeRosterUrl(view) === "";
}

export { DEFAULT_FILTERS };
