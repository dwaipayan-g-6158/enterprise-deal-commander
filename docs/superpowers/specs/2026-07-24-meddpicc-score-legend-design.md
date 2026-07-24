# MEDDPICC Score Button Color Legend Design

Date: 2026-07-24
Status: Approved, pending implementation plan.

## Problem

The MEDDPICC panel's 0/1/2/3 score buttons (`meddpicc-panel.tsx`) are plain numbers with no visual indication of what each value means (3 = Strong Yes, 2 = Neutral, 1 = Strong No, 0 = Unknown/not completed). A user has to already know the dealpad.io rubric to interpret them; nothing on screen explains it.

## Decision

Color-code the four buttons by meaning, plus a compact one-time legend line near the panel header — decided via a visual mockup comparison of four options (color-only, info-icon tooltip, legend-only, color+legend combo). Color+legend was selected: color gives instant visual scanning across all 43 rows / 8 pillars (a mostly-green pillar vs. a mostly-rose one is obvious without reading), and the legend line teaches the color code so meaning isn't color-only (accessibility).

An info-icon tooltip (reusing the existing `InfoTooltip` component from `playbook-panel.tsx`/`stakeholders-panel.tsx`) was considered and rejected as the primary mechanism — redundant once a legend is always visible, and would mean 43 tooltips instead of one line.

## Scope

Frontend-only, one file: `artifacts/edc/src/components/cockpit/v2/meddpicc-panel.tsx`. No backend, schema, or API changes — the legend text and colors are static, not deal-specific data.

## Color mapping

Adapted to this codebase's existing semantic-pill convention (`bg-{color}-500/10 border-{color}-500/20 text-{color}-700 dark:text-{color}-400` — the pattern already used for won/lost markers in `account-navigation-array.tsx`, risk severity in `portfolio-risk-heatmap.tsx`, etc., which already has dark-mode variants defined) rather than the solid `-50`/`-100` background shades initially proposed, since the wash+border+text form is what the rest of the app already uses consistently in both themes.

| Value | Meaning | Unselected (wash) | Selected (solid fill) |
|---|---|---|---|
| 3 | Strong Yes | `bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400` | `bg-emerald-600 text-white border-emerald-600` |
| 2 | Neutral | `bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-400` | `bg-slate-600 text-white border-slate-600` |
| 1 | Strong No | `bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400` | `bg-rose-600 text-white border-rose-600` |
| 0 | Unknown | `border-dashed border-slate-300 dark:border-slate-600 bg-transparent text-muted-foreground` | `bg-slate-400 text-white border-slate-400` |

Each button always shows its wash/dashed look (so the meaning is visible whether or not it's the current answer); the currently-selected button additionally upgrades to a solid fill, so "which one is my answer" is conveyed by fill-vs-wash (not color alone) — preserving the same selected/unselected distinction the buttons already had via `variant="default"` vs `"outline"`, just now tinted per value instead of monochrome. The `0` button's dashed look intentionally reads as "empty/pending" when unselected; once explicitly chosen it fills solid gray like the other three, since an explicit "rated Unknown" is a confirmed answer, not an empty state.

## Legend placement

One compact line — four colored dots + labels ("Strong Yes · Neutral · Strong No · Unknown") in the same emerald/slate/rose/slate colors as the buttons — shown once in the panel header area, replacing/merging with the existing "Strong No: N · Unknown: N" summary line (so the real per-deal counts and the static color legend live in the same spot, not two separate rows).

## Out of scope

- No change to the `Strong No`/`Unknown` counting logic itself (unchanged from the existing `MeddpiccScoreResult`).
- No per-question info icons.
- No change to any other panel (`playbook-panel.tsx`, `stakeholders-panel.tsx`) — this is scoped to the MEDDPICC panel's own score buttons only.
