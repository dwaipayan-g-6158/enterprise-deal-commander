# Todo: Clickable Weighted Pipeline & Avg Score tiles

See `tasks/plan.md` for full detail, acceptance criteria, and verification steps.

## Phase 1: Weighted Pipeline
- [x] Create `weighted-pipeline-dialog.tsx` (breakdown by health + top contributing deals)
- [x] Wire clickable card + `onOpenWeightedPipeline` prop in `vital-signs-bar.tsx`
- [x] Add `"weightedPipeline"` to `OpenDialog` union + render dialog in `dashboard.tsx`
- [x] Typecheck
- [x] Manual click-through + keyboard test in browser

## Checkpoint 1
- [x] Weighted Pipeline tile verified end-to-end; other tiles unaffected

## Phase 2: Avg Score
- [x] Create `avg-score-dialog.tsx` (distribution + lowest-scoring deals)
- [x] Wire clickable card + `onOpenAvgScore` prop in `vital-signs-bar.tsx`
- [x] Add `"avgScore"` to `OpenDialog` union + render dialog in `dashboard.tsx`
- [x] Typecheck
- [x] Manual click-through + keyboard test in browser

## Checkpoint 2 (Complete)
- [x] Both tiles clickable and keyboard-accessible
- [x] Typecheck + build clean
- [x] Ready for review
