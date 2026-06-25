import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  dealDecisions,
} from "@workspace/db";
import { runPipelineSimulation, type SimDeal } from "@workspace/engine";

/**
 * Non-JSON output routes (V2 F14 reports, F15 digest, F17 export). These return
 * CSV / HTML rather than the JSON envelope the codegen contract expects, so they
 * live outside openapi.yaml and are called directly by the client (download
 * links / print windows). The parent v2 router already applies requireAuth.
 */
const router: IRouter = Router();

const activeFilter = and(isNull(enterpriseDeals.deletedAt), isNull(enterpriseDeals.archivedAt));

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function activeDealRows() {
  return db
    .select({
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      accountManager: enterpriseDeals.accountManager,
      technicalLead: enterpriseDeals.technicalLead,
      stage: pipelineStages.stageName,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      currency: enterpriseDeals.dealCurrency,
      expectedCloseDate: enterpriseDeals.expectedCloseDate,
      winProbabilityPct: enterpriseDeals.winProbabilityPct,
    })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(activeFilter)
    .orderBy(desc(enterpriseDeals.productRevenue));
}

// F17 — Export deals as CSV or JSON.
router.get("/export/deals", async (req: Request, res: Response) => {
  const format = String(req.query.format ?? "csv").toLowerCase();
  const rows = await activeDealRows();
  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="deals-export.json"');
    res.send(JSON.stringify(rows, null, 2));
    return;
  }
  const headers = [
    "Deal Name",
    "Account",
    "Account Manager",
    "Technical Lead",
    "Stage",
    "Product Revenue",
    "Services Revenue",
    "Currency",
    "Expected Close",
    "Win %",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.dealName,
        r.accountName,
        r.accountManager,
        r.technicalLead,
        r.stage,
        r.productRevenue,
        r.servicesRevenue,
        r.currency,
        r.expectedCloseDate,
        r.winProbabilityPct,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="deals-export.csv"');
  res.send(lines.join("\n"));
});

function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

async function pipelineFacts() {
  const rows = await activeDealRows();
  let totalTcv = 0;
  const sim: SimDeal[] = [];
  for (const r of rows) {
    const tcv = (Number(r.productRevenue) || 0) + (Number(r.servicesRevenue) || 0);
    totalTcv += tcv;
    sim.push({ calculatedTCV: tcv, winProbabilityPct: r.winProbabilityPct ?? null });
  }
  const simulation = runPipelineSimulation(sim, 10000);
  return { rows, totalTcv, simulation };
}

const reportStyle =
  "<style>body{font-family:system-ui,Segoe UI,sans-serif;max-width:900px;margin:2rem auto;color:#111}" +
  "h1{font-size:1.6rem}h2{font-size:1.1rem;border-bottom:1px solid #ddd;padding-bottom:.3rem;margin-top:2rem}" +
  "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:.4rem .6rem;text-align:left;font-size:.9rem}" +
  ".metric{display:inline-block;margin-right:2rem}.metric b{display:block;font-size:1.4rem}" +
  "@media print{button{display:none}}</style>";

// F14 — Board-ready pipeline report (HTML; client prints to PDF).
router.get("/reports/pipeline", async (_req: Request, res: Response) => {
  const { rows, totalTcv, simulation } = await pipelineFacts();
  const top = rows.slice(0, 5);
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>EDC Pipeline Report</title>${reportStyle}</head><body>` +
    `<button onclick="window.print()">Print / Save as PDF</button>` +
    `<h1>Executive Pipeline Summary</h1>` +
    `<div><span class="metric">Total TCV<b>${fmtMoney(totalTcv)}</b></span>` +
    `<span class="metric">Active Deals<b>${rows.length}</b></span>` +
    `<span class="metric">Median Forecast (P50)<b>${fmtMoney(simulation.percentiles.p50)}</b></span></div>` +
    `<h2>Top Deals by TCV</h2><table><tr><th>Deal</th><th>Account</th><th>Stage</th><th>TCV</th></tr>` +
    top
      .map(
        (r) =>
          `<tr><td>${r.dealName}</td><td>${r.accountName}</td><td>${r.stage ?? ""}</td><td>${fmtMoney(
            (Number(r.productRevenue) || 0) + (Number(r.servicesRevenue) || 0),
          )}</td></tr>`,
      )
      .join("") +
    `</table>` +
    `<h2>Probabilistic Forecast (Monte Carlo, 10k runs)</h2><table>` +
    `<tr><th>P10</th><th>P25</th><th>P50</th><th>P75</th><th>P90</th></tr><tr>` +
    `<td>${fmtMoney(simulation.percentiles.p10)}</td><td>${fmtMoney(simulation.percentiles.p25)}</td>` +
    `<td>${fmtMoney(simulation.percentiles.p50)}</td><td>${fmtMoney(simulation.percentiles.p75)}</td>` +
    `<td>${fmtMoney(simulation.percentiles.p90)}</td></tr></table>` +
    `</body></html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// F15 — Email digest preview (HTML).
router.get("/digest/preview", async (_req: Request, res: Response) => {
  const { rows, totalTcv, simulation } = await pipelineFacts();
  const overdue = await db
    .select({ decisionText: dealDecisions.decisionText, owner: dealDecisions.owner, dueDate: dealDecisions.dueDate })
    .from(dealDecisions)
    .where(eq(dealDecisions.status, "Pending"))
    .limit(10);
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>Pipeline Digest</title>${reportStyle}</head><body>` +
    `<h1>Enterprise Pipeline Digest</h1>` +
    `<div><span class="metric">Total TCV<b>${fmtMoney(totalTcv)}</b></span>` +
    `<span class="metric">Active Deals<b>${rows.length}</b></span>` +
    `<span class="metric">Median Forecast<b>${fmtMoney(simulation.percentiles.p50)}</b></span></div>` +
    `<h2>Pending Decisions</h2>` +
    (overdue.length
      ? `<ul>${overdue.map((d) => `<li>${d.decisionText} — <i>${d.owner}</i>${d.dueDate ? ` (due ${d.dueDate})` : ""}</li>`).join("")}</ul>`
      : "<p>No pending decisions.</p>") +
    `</body></html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

export default router;
