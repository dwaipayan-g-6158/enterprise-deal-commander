// Natural Language Command parser (V2 F19) — pure, deterministic, NO LLM.
//
// Translates Commander phrases into a structured query. Deliberately keyword/
// regex based for zero hallucination and offline operation. Anything it cannot
// confidently parse falls back to a full-text SEARCH.

export type NlcOperator = "gt" | "lt" | "gte" | "lte" | "eq" | "neq" | "in" | "is_null";

export interface NlcCondition {
  field: string;
  operator: NlcOperator;
  value: string | number;
}

export type NlcQuery =
  | {
      type: "LIST" | "COUNT";
      entity: "deals";
      conditions: NlcCondition[];
      sort?: { field: string; direction: "ASC" | "DESC" };
      limit?: number;
    }
  | { type: "COMPARE"; entities: string[] }
  | { type: "SEARCH"; query: string };

const DATE_EXPRESSIONS = [
  "this quarter",
  "next quarter",
  "this month",
  "this year",
  "this week",
  "today",
];

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Parse "$1M", "500k", "1,450,000", "50%" → number. */
export function parseAmount(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/[$,%\s]/g, "");
  const mult = s.endsWith("m") ? 1_000_000 : s.endsWith("k") ? 1_000 : 1;
  const num = parseFloat(s.replace(/[mk]$/, ""));
  return Number.isNaN(num) ? 0 : num * mult;
}

function comparator(word: string): NlcOperator {
  const w = word.trim();
  if (/^(>=|at least)$/.test(w)) return "gte";
  if (/^(<=|at most)$/.test(w)) return "lte";
  if (/^(>|above|over|greater|greater than|more than)$/.test(w)) return "gt";
  if (/^(<|below|under|less|less than|fewer than)$/.test(w)) return "lt";
  return "eq";
}

export function parseNLC(input: string): NlcQuery | null {
  const original = input.trim();
  if (!original) return null;
  const q = original.toLowerCase();

  // COMPARE <a> and <b>
  const cmp = q.match(/^compare\s+(.+?)\s+and\s+(.+)$/);
  if (cmp) {
    return { type: "COMPARE", entities: [cmp[1].trim(), cmp[2].trim()] };
  }

  const type: "LIST" | "COUNT" = q.startsWith("count") ? "COUNT" : "LIST";
  const conditions: NlcCondition[] = [];
  let sort: { field: string; direction: "ASC" | "DESC" } | undefined;
  let limit: number | undefined;

  // Health (RED / YELLOW / GREEN)
  const health = q.match(/\b(red|yellow|green)\b/);
  if (health) conditions.push({ field: "health", operator: "eq", value: health[1].toUpperCase() });

  // Stage is X
  const stage = q.match(/stage\s+(?:is\s+)?(\w+)/);
  if (stage) conditions.push({ field: "stage", operator: "eq", value: titleCase(stage[1]) });

  // No close date
  if (/no close date/.test(q)) {
    conditions.push({ field: "close_date", operator: "is_null", value: "" });
  }

  // Closing <date expression>
  const closing = q.match(/clos(?:e|ing)\s+(this quarter|next quarter|this month|this year|this week|today)/);
  if (closing) {
    conditions.push({ field: "close_date", operator: "in", value: closing[1].replace(/\s+/g, "_") });
  } else {
    for (const expr of DATE_EXPRESSIONS) {
      if (q.includes(expr) && /clos/.test(q)) {
        conditions.push({ field: "close_date", operator: "in", value: expr.replace(/\s+/g, "_") });
        break;
      }
    }
  }

  // Days in stage: "over 30 days", "stale ... 30 days"
  const days = q.match(/(>|<|>=|<=|above|over|more than|greater than|below|under|less than)\s+(\d+)\s+days/);
  if (days) {
    conditions.push({ field: "days_in_stage", operator: comparator(days[1]), value: Number(days[2]) });
  }

  // Progress: "less than 50% progress" / "progress below 30"
  const progress =
    q.match(/(>|<|>=|<=|above|over|more than|below|under|less than)\s+(\d+)\s*%?\s*progress/) ||
    q.match(/progress\s+(>|<|>=|<=|above|over|below|under|less than|more than)\s+(\d+)/);
  if (progress) {
    conditions.push({ field: "progress", operator: comparator(progress[1]), value: Number(progress[2]) });
  }

  // Blockers: "blockers > 2", "more than 2 high blockers"
  const blockers =
    q.match(/blockers?\s*(>|<|>=|<=|above|over|below|under|more than|less than)\s*(\d+)/) ||
    q.match(/(>|<|>=|<=|above|over|below|under|more than|less than)\s*(\d+)\s+(?:high\s+)?blockers/);
  if (blockers) {
    const field = /high/.test(q) ? "high_blockers" : "blockers";
    conditions.push({ field, operator: comparator(blockers[1]), value: Number(blockers[2]) });
  }

  // Competitor: "snowflake as competitor", "with snowflake as competitor"
  const competitor = q.match(/(?:with\s+)?([a-z][\w-]+)\s+as\s+(?:a\s+)?competitor/);
  if (competitor) {
    conditions.push({ field: "competitor", operator: "eq", value: titleCase(competitor[1]) });
  }

  // TCV / revenue with comparator + amount (avoid double-counting % progress)
  const amount = q.match(/(above|over|greater than|more than|below|under|less than|at least|at most)\s*\$?([\d.,]+\s*[mk]?)\b/);
  if (amount && !/progress|days|blockers/.test(amount[0])) {
    conditions.push({ field: "tcv", operator: comparator(amount[1]), value: parseAmount(amount[2]) });
  }

  // Sort: "highest tcv", "lowest tcv", "sort by X asc/desc"
  const sortBy = q.match(/sort\s+(?:by\s+)?(\w+)\s*(asc|desc)?/);
  if (sortBy) {
    sort = { field: sortBy[1], direction: sortBy[2] === "asc" ? "ASC" : "DESC" };
    limit = 10;
  } else {
    const hi = q.match(/\b(highest|top|largest)\s+(\w+)/);
    const lo = q.match(/\b(lowest|smallest|bottom)\s+(\w+)/);
    if (hi) {
      sort = { field: hi[2], direction: "DESC" };
      limit = 10;
    } else if (lo) {
      sort = { field: lo[2], direction: "ASC" };
      limit = 10;
    }
  }

  if (conditions.length === 0 && !sort) {
    return { type: "SEARCH", query: original };
  }
  return { type, entity: "deals", conditions, sort, limit };
}
