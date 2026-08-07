// Repository for the 3 MEDDPICC tables (schema/edc_v2_intel.ts's F17
// section), ported onto Catalyst Data Store. See docs/CATALYST_SCHEMA.md.
// Column types for deal_meddpicc_scores (overall_score/strong_no_count/
// unknown_count are `int`, overall_pct/stage_pct are `double`) confirmed live
// via MCP List_All_Columns before writing this file — matching the
// established int-as-number / double-as-string write convention (see
// repositories/lookups.ts's FxRates repo for the double precedent).

import {
  fetchAllRows,
  insertRow,
  updateRow,
  parseNullableNumber,
  parseCatalystDateTime,
  formatCatalystDateTime,
  toJson,
  type CatalystApp,
  type RawRow,
} from "../sdk";

// All three live in the Postgres `edc_v2` schema, so their Data Store names
// carry the `v2_` prefix (docs/CATALYST_SCHEMA.md's naming convention). They
// were originally written here WITHOUT the prefix — three table names that do
// not exist in the Data Store, so every MEDDPICC read/write failed at runtime.
// Verified live against List_All_Columns: v2_meddpicc_questions (31210000000651544),
// v2_deal_meddpicc_answers (31210000000650489), v2_deal_meddpicc_scores (31210000000646093).
const TABLE = {
  meddpiccQuestions: "v2_meddpicc_questions",
  dealMeddpiccAnswers: "v2_deal_meddpicc_answers",
  dealMeddpiccScores: "v2_deal_meddpicc_scores",
} as const;

function optDate(raw: string | null | undefined): Date | null {
  return raw ? parseCatalystDateTime(raw) : null;
}

// -------------------------------------------------------------- Questions (read-only seed catalog)

export interface MeddpiccQuestionRow {
  id: string;
  questionOrder: number;
  pillar: string;
  stageTag: string;
  questionText: string;
  helpText: string | null;
}

function rowToQuestion(r: RawRow): MeddpiccQuestionRow {
  return {
    id: r["id"],
    questionOrder: Number(r["question_order"]),
    pillar: r["pillar"],
    stageTag: r["stage_tag"],
    questionText: r["question_text"],
    helpText: r["help_text"] || null,
  };
}

export function createMeddpiccQuestionsRepo(catalystApp: CatalystApp) {
  return {
    async listAll(): Promise<MeddpiccQuestionRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.meddpiccQuestions);
      return rows.map(rowToQuestion).sort((a, b) => a.questionOrder - b.questionOrder);
    },
  };
}

// -------------------------------------------------------------- Answers (per-deal, one row per question)

export interface MeddpiccAnswerRow {
  id: string;
  dealId: string;
  questionId: string;
  score: number | null;
  note: string | null;
  answeredAt: Date | null;
  answeredBy: string | null;
}

function rowToAnswer(r: RawRow): MeddpiccAnswerRow {
  return {
    id: r["id"],
    dealId: r["deal_id"],
    questionId: r["question_id"],
    score: parseNullableNumber(r["score"]),
    note: r["note"] || null,
    answeredAt: optDate(r["answered_at"]),
    answeredBy: r["answered_by"] || null,
  };
}

export function createDealMeddpiccAnswersRepo(catalystApp: CatalystApp) {
  return {
    async listByDealId(dealId: string): Promise<MeddpiccAnswerRow[]> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealMeddpiccAnswers);
      return rows.filter((r) => r["deal_id"] === dealId).map(rowToAnswer);
    },
    /**
     * Insert-or-update by (dealId, questionId) via the `natural_key` column
     * (`"<dealId>:<questionId>"`) — mirrors the original Drizzle
     * `onConflictDoUpdate` targeting `deal_meddpicc_answer_uq`. Hand-rolled
     * (not the shared `upsert()` sdk helper): `id` must be freshly generated
     * on insert and left untouched on update.
     */
    async upsertByDealAndQuestion(
      dealId: string,
      questionId: string,
      input: { score: number; note: string | null; answeredBy: string },
    ): Promise<void> {
      const naturalKey = `${dealId}:${questionId}`;
      const shared = {
        score: input.score,
        note: input.note,
        answered_at: formatCatalystDateTime(new Date()),
        answered_by: input.answeredBy,
      };
      const rows = await fetchAllRows(catalystApp, TABLE.dealMeddpiccAnswers);
      const existing = rows.find((r) => r["natural_key"] === naturalKey);
      if (existing) {
        await updateRow(catalystApp, TABLE.dealMeddpiccAnswers, existing["ROWID"], shared);
        return;
      }
      await insertRow(catalystApp, TABLE.dealMeddpiccAnswers, {
        id: crypto.randomUUID(),
        deal_id: dealId,
        question_id: questionId,
        natural_key: naturalKey,
        ...shared,
      });
    },
  };
}

// -------------------------------------------------------------- Scores (append-only history)

export interface MeddpiccScoreInput {
  dealId: string;
  overallScore: number;
  overallPct: number;
  stagePct: number;
  ragStatus: string;
  pillarBreakdown: unknown[];
  strongNoCount: number;
  unknownCount: number;
}

export interface LatestMeddpiccScore {
  overallPct: number;
  stagePct: number;
  ragStatus: string;
}

export function createDealMeddpiccScoresRepo(catalystApp: CatalystApp) {
  return {
    async create(input: MeddpiccScoreInput): Promise<void> {
      await insertRow(catalystApp, TABLE.dealMeddpiccScores, {
        id: crypto.randomUUID(),
        deal_id: input.dealId,
        overall_score: input.overallScore,
        overall_pct: String(input.overallPct),
        stage_pct: String(input.stagePct),
        rag_status: input.ragStatus,
        pillar_breakdown: toJson(input.pillarBreakdown),
        strong_no_count: input.strongNoCount,
        unknown_count: input.unknownCount,
        computed_at: formatCatalystDateTime(new Date()),
      });
    },
    /** Newest row for a deal, or null if it has never been scored. Mirrors the original `orderBy(desc(computedAt)).limit(1)`. */
    async latestByDealId(dealId: string): Promise<LatestMeddpiccScore | null> {
      const rows = await fetchAllRows(catalystApp, TABLE.dealMeddpiccScores);
      const forDeal = rows.filter((r) => r["deal_id"] === dealId);
      if (forDeal.length === 0) return null;
      // Ties must resolve to the LATER row, and they are common: Data Store
      // datetimes are second-granularity (`formatCatalystDateTime` emits no
      // milliseconds), so two recomputes a few hundred ms apart carry the
      // IDENTICAL `computed_at`. A plain descending sort is stable, which would
      // then hand back the first-inserted — i.e. the OLDEST — row. The Drizzle
      // original could not hit this: its `orderBy(desc(computedAt))` ran on a
      // sub-second Postgres timestamp.
      //
      // `fetchAllRows` yields rows in ROWID order, so "last among the newest
      // timestamp" is the most recently written row.
      let latest = forDeal[0];
      let latestAt = parseCatalystDateTime(latest["computed_at"]).getTime();
      for (const row of forDeal.slice(1)) {
        const at = parseCatalystDateTime(row["computed_at"]).getTime();
        if (at >= latestAt) {
          latest = row;
          latestAt = at;
        }
      }
      return {
        overallPct: Number(latest["overall_pct"]),
        stagePct: latest["stage_pct"] != null && latest["stage_pct"] !== "" ? Number(latest["stage_pct"]) : 0,
        ragStatus: latest["rag_status"],
      };
    },
  };
}
