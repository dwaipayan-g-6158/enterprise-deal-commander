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

// Minimal HTML-escaping for the report/digest views below — dealName,
// accountName etc. are free-text fields a user can set, so they're escaped
// before being spliced into the HTML string (the CSV/JSON export path is
// unaffected; csvCell above already handles CSV-specific escaping).
function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function activeDealRows() {
  return db
    .select({
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      accountManager: enterpriseDeals.accountManager,
      technicalLead: enterpriseDeals.technicalLead,
      stage: pipelineStages.stageName,
      stageSortOrder: pipelineStages.sortOrder,
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
  let weightedTcv = 0;
  const sim: SimDeal[] = [];
  const byStage = new Map<string, { count: number; tcv: number }>();
  const stageOrder = new Map<string, number>();
  for (const r of rows) {
    const tcv = (Number(r.productRevenue) || 0) + (Number(r.servicesRevenue) || 0);
    totalTcv += tcv;
    if (r.winProbabilityPct != null) weightedTcv += tcv * (Number(r.winProbabilityPct) / 100);
    sim.push({ calculatedTCV: tcv, winProbabilityPct: r.winProbabilityPct ?? null });

    const key = r.stage ?? "Unstaged";
    if (!stageOrder.has(key)) stageOrder.set(key, r.stageSortOrder ?? 999);
    const cur = byStage.get(key) ?? { count: 0, tcv: 0 };
    cur.count += 1;
    cur.tcv += tcv;
    byStage.set(key, cur);
  }
  const simulation = runPipelineSimulation(sim, 10000);
  const stageBreakdown = [...byStage.entries()]
    .map(([stage, v]) => ({ stage, ...v }))
    .sort((a, b) => (stageOrder.get(a.stage) ?? 999) - (stageOrder.get(b.stage) ?? 999));
  return { rows, totalTcv, weightedTcv, simulation, stageBreakdown };
}

// ---------------------------------------------------------------------------
// Enterprise Deal Commander letterhead — shared by the board report and the
// digest preview so every externally-facing HTML document reads as one brand.
// The logo mark below is a static, flat-filled mirror of the four petal paths
// in artifacts/edc/src/components/edc-logo-mark.tsx: this route runs
// server-side (Express, no bundler/React), so the animated component can't be
// reused directly — the path data is copied and kept in sync by hand. Brand
// color is inlined as a literal (hsl(222,90%,67%), from index.css --primary)
// for the same reason: no access to the frontend's CSS custom properties.
const BRAND = {
  primary: "hsl(222, 90%, 67%)", // matches --primary in artifacts/edc/src/index.css
  primaryDark: "hsl(222, 90%, 38%)", // darker tint for print-safe text/borders on white
  ink: "#14161c",
  muted: "#5b6270",
  border: "#e3e6ee",
  tint: "hsla(222, 90%, 67%, 0.08)",
};

const LOGO_PETAL_PATHS = [
  "M40.595,105.669c-8.677-13.724-16.314-29.262-21.72-47.64C16.31,49.312,13.962,40,13.115,29.11c-0.969-12.44,0.386-26.477,10.559-28.92c3.232-0.776,7.688,1,10.08,2.28c7.774,4.161,13.416,10.982,18.96,18.12c2.741,3.529,5.02,7.154,7.2,11.4c2.485,4.842,4.94,10.979,4.08,17.76c-0.312,2.453-1.489,4.95-2.521,7.44C54.795,73.326,47.35,89.827,40.595,105.669z",
  "M47.434,108.669c5.987-13.801,11.193-27.285,17.4-40.92c1.929-4.237,3.477-9.505,6-13.32c6.917-10.458,24.385-14.367,41.04-15.12c10.341-0.468,25.571,1.158,25.92,11.76c0.169,5.148-3.074,9.834-5.641,12.96c-8.271,10.074-19.558,17.917-31.199,24.24C84.506,97.203,67.304,104.102,47.434,108.669z",
  "M17.075,75.669c5.155,12.605,11.332,24.187,18.119,35.16c-12.604,1.567-32.716,2.03-35.039-9.36c-0.56-2.747,0.491-6.64,1.68-9.12c1.536-3.207,4.096-6.138,6.6-9c2.44-2.79,5.543-5.281,8.16-7.44C16.731,75.797,16.807,75.681,17.075,75.669z",
  "M85.715,103.629c0.097,0.023,0.119,0.121,0.24,0.12c0.92,9.873,0.559,20.411-3.601,26.64c-4.016,6.015-11.721,5.081-17.76,1.56c-6.547-3.817-13.038-10.661-16.92-16.2C61.546,112.9,74.091,108.727,85.715,103.629z",
];
const LOGO_VIEWBOX = "-10.1 -11.6 158 158";

function logoSvg(size: number): string {
  const paths = LOGO_PETAL_PATHS.map(
    (d) => `<path d="${d}" fill-rule="evenodd" clip-rule="evenodd" fill="${BRAND.primaryDark}"/>`,
  ).join("");
  return `<svg width="${size}" height="${size}" viewBox="${LOGO_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex:none">${paths}</svg>`;
}

function letterhead(title: string, subtitle: string): string {
  const generated = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
  return (
    `<header class="ltr-head">` +
    `<div class="ltr-brand">${logoSvg(28)}<span class="ltr-word">Enterprise Deal Commander</span></div>` +
    `<div class="ltr-tag">Confidential &mdash; Board Distribution</div>` +
    `</header>` +
    `<h1>${esc(title)}</h1>` +
    `<div class="ltr-meta">${esc(subtitle)} &middot; Generated ${esc(generated)}</div>`
  );
}

// position:fixed so Chrome repeats this bar on every printed page (there is
// no reliable cross-browser way to render a true "page X of Y" counter via
// print CSS — @page margin-box content descriptors aren't implemented in
// Chromium — so this favors an honest, always-correct branded footer over a
// page count that would silently fail to render).
function reportFooter(): string {
  return (
    `<div class="rpt-footer">${logoSvg(13)}` +
    `<span>Enterprise Deal Commander</span><span class="rpt-footer-sep">&bull;</span>` +
    `<span>Confidential &mdash; Board Distribution</span></div>`
  );
}

const reportStyle = `<style>
  @page { size: A4; margin: 18mm 16mm 22mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    max-width: 900px; margin: 0 auto; padding: 8px 8px 28px; color: ${BRAND.ink};
    font-size: 13px; line-height: 1.5;
  }
  .print-btn {
    position: fixed; top: 16px; right: 16px; padding: .55rem 1.1rem; border-radius: 6px;
    border: 1px solid ${BRAND.border}; background: #fff; cursor: pointer; font-size: .85rem;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
  }
  @media print { .print-btn { display: none; } }

  .ltr-head {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2px solid ${BRAND.primary}; padding-bottom: 10px; margin-bottom: 2px;
  }
  .ltr-brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 1rem; }
  .ltr-tag { font-size: .68rem; letter-spacing: .05em; text-transform: uppercase; color: ${BRAND.muted}; }
  h1 { font-size: 1.6rem; margin: 18px 0 2px; letter-spacing: -0.01em; }
  .ltr-meta { font-size: .82rem; color: ${BRAND.muted}; margin-bottom: 22px; }

  h2 {
    font-size: 1rem; margin: 26px 0 10px; padding-left: 10px;
    border-left: 4px solid ${BRAND.primary}; color: ${BRAND.ink};
  }
  h2 .h2-sub { font-weight: 400; color: ${BRAND.muted}; font-size: .82rem; }

  .kpi-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .kpi {
    flex: 1 1 150px; border: 1px solid ${BRAND.border}; border-radius: 8px;
    padding: 12px 14px; background: ${BRAND.tint};
  }
  .kpi .label { font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; color: ${BRAND.muted}; }
  .kpi .value { font-size: 1.3rem; font-weight: 700; margin-top: 2px; }

  table { border-collapse: collapse; width: 100%; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  td, th { border: 1px solid ${BRAND.border}; padding: 6px 9px; text-align: left; font-size: .82rem; }
  th { background: ${BRAND.tint}; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafafe; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

  ul.digest-list { margin: 0; padding-left: 1.2rem; }
  ul.digest-list li { margin-bottom: 6px; font-size: .88rem; }

  /* On screen, the footer is a normal block at the end of the flowed content
     — position:fixed here would anchor to the browser viewport and overlap
     whatever content happens to be scrolled underneath it (there's no
     pagination to "repeat per page" outside of an actual print context). It
     only switches to position:fixed under @media print below, where each
     physical page gets its own fixed coordinate space within the @page
     bottom margin reserved for it, so it repeats per printed page without
     colliding with page content. */
  .rpt-footer {
    display: flex; align-items: center; gap: 6px; font-size: .66rem; color: ${BRAND.muted};
    border-top: 1px solid ${BRAND.border}; padding-top: 6px; margin-top: 28px;
  }
  .rpt-footer-sep { opacity: .5; }
  @media print {
    .rpt-footer { position: fixed; left: 16mm; right: 16mm; bottom: 8mm; margin-top: 0; }
  }
</style>`;

// F14 — Board-ready pipeline report (HTML; client prints to PDF).
router.get("/reports/pipeline", async (_req: Request, res: Response) => {
  const { rows, totalTcv, weightedTcv, simulation, stageBreakdown } = await pipelineFacts();
  const top = rows.slice(0, 8);
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>EDC Pipeline Report</title>${reportStyle}</head><body>` +
    `<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>` +
    letterhead("Executive Pipeline Summary", "Board-ready pipeline snapshot") +
    `<div class="kpi-row">` +
    `<div class="kpi"><div class="label">Total TCV</div><div class="value">${fmtMoney(totalTcv)}</div></div>` +
    `<div class="kpi"><div class="label">Active Deals</div><div class="value">${rows.length}</div></div>` +
    `<div class="kpi"><div class="label">Weighted Pipeline</div><div class="value">${fmtMoney(weightedTcv)}</div></div>` +
    `<div class="kpi"><div class="label">Forecast (P50)</div><div class="value">${fmtMoney(simulation.percentiles.p50)}</div></div>` +
    `</div>` +
    `<h2>Pipeline by Stage</h2>` +
    `<table><thead><tr><th>Stage</th><th class="num">Deals</th><th class="num">TCV</th></tr></thead><tbody>` +
    stageBreakdown
      .map(
        (s) =>
          `<tr><td>${esc(s.stage)}</td><td class="num">${s.count}</td><td class="num">${fmtMoney(s.tcv)}</td></tr>`,
      )
      .join("") +
    `</tbody></table>` +
    `<h2>Top Deals by TCV</h2>` +
    `<table><thead><tr><th>Deal</th><th>Account</th><th>Stage</th><th class="num">TCV</th></tr></thead><tbody>` +
    top
      .map(
        (r) =>
          `<tr><td>${esc(r.dealName)}</td><td>${esc(r.accountName)}</td><td>${esc(r.stage ?? "")}</td><td class="num">${fmtMoney(
            (Number(r.productRevenue) || 0) + (Number(r.servicesRevenue) || 0),
          )}</td></tr>`,
      )
      .join("") +
    `</tbody></table>` +
    `<h2>Probabilistic Forecast <span class="h2-sub">(Monte Carlo, 10,000 runs)</span></h2>` +
    `<table><thead><tr><th class="num">P10</th><th class="num">P25</th><th class="num">P50</th><th class="num">P75</th><th class="num">P90</th></tr></thead><tbody><tr>` +
    `<td class="num">${fmtMoney(simulation.percentiles.p10)}</td><td class="num">${fmtMoney(simulation.percentiles.p25)}</td>` +
    `<td class="num">${fmtMoney(simulation.percentiles.p50)}</td><td class="num">${fmtMoney(simulation.percentiles.p75)}</td>` +
    `<td class="num">${fmtMoney(simulation.percentiles.p90)}</td></tr></tbody></table>` +
    reportFooter() +
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
    `<!doctype html><html><head><meta charset="utf-8"><title>EDC Pipeline Digest</title>${reportStyle}</head><body>` +
    letterhead("Enterprise Pipeline Digest", "Weekly pipeline pulse") +
    `<div class="kpi-row">` +
    `<div class="kpi"><div class="label">Total TCV</div><div class="value">${fmtMoney(totalTcv)}</div></div>` +
    `<div class="kpi"><div class="label">Active Deals</div><div class="value">${rows.length}</div></div>` +
    `<div class="kpi"><div class="label">Median Forecast</div><div class="value">${fmtMoney(simulation.percentiles.p50)}</div></div>` +
    `</div>` +
    `<h2>Pending Decisions</h2>` +
    (overdue.length
      ? `<ul class="digest-list">${overdue
          .map(
            (d) =>
              `<li>${esc(d.decisionText)} &mdash; <i>${esc(d.owner)}</i>${d.dueDate ? ` (due ${esc(d.dueDate)})` : ""}</li>`,
          )
          .join("")}</ul>`
      : "<p>No pending decisions.</p>") +
    reportFooter() +
    `</body></html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

export default router;
