-- Playbook Catalog Expansion (2026-07)
--
-- Expands the edc_v2 stage-keyed playbook catalog from 3 playbooks / 12 steps
-- to 5 playbooks / 26 steps: adds a Discovery/Qualification playbook and a
-- Closed-Won Onboarding/Handoff playbook, and enriches the existing three.
-- Mirrors seedPlaybooks() in artifacts/api-server/src/seed.ts (source of truth
-- for fresh installs); this file applies the same catalog to an already-seeded
-- database, whose seed guard would otherwise skip the change.
--
-- PURE DATA. Touches only the edc_v2 playbook tables. Does NOT touch technical
-- gates, engine thresholds, scores, health, trajectory, or any risk-engine input
-- (playbooks feed none of those). Deal playbook step-progress (demo data only) is
-- intentionally reset — each deal re-assigns to the correct playbook for its stage
-- on the next `GET /v2/deals/:dealId/playbook` (autoAssignPlaybookIfMissing).
--
-- Safe to re-run: it fully clears and rebuilds the catalog each time.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-playbook-catalog-expansion.sql

BEGIN;

-- 1) Clear assignments (cascades edc_v2.playbook_step_completions) and the old
--    catalog (cascades edc_v2.playbook_steps via ON DELETE CASCADE).
DELETE FROM edc_v2.deal_playbook_assignments;
DELETE FROM edc_v2.playbooks;

-- 2) Re-insert the full catalog. One CTE per playbook: insert the playbook, then
--    fan its steps out from the returned id.

-- Discovery / Qualification Playbook  (stage: Discovery)
WITH pb AS (
  INSERT INTO edc_v2.playbooks (playbook_name, description, applicable_stage, created_by)
  VALUES ('Discovery / Qualification Playbook',
          'Qualify hard and confirm a champion before investing SE and deal resources.',
          'Discovery', 'migration')
  RETURNING id
)
INSERT INTO edc_v2.playbook_steps (playbook_id, step_order, step_name, recommended_action, expected_duration_days, is_critical)
SELECT pb.id, s.step_order, s.step_name, s.recommended_action, s.expected_duration_days, s.is_critical
FROM pb, (VALUES
  (1, 'MEDDPICC qualification scored', 'Complete a MEDDPICC qualification (metrics, economic buyer, decision criteria/process, paper process, pain, champion, competition) and record the score.', 3, true),
  (2, 'Champion validated', 'Confirm a named internal advocate with power, access, and willingness to sell on your behalf.', 3, true),
  (3, 'Economic buyer identified & engaged', 'Identify who controls budget/final authority and confirm direct engagement has occurred.', 4, false),
  (4, 'Technical decision criteria mapped', 'Document the prospect''s technical requirements, evaluation criteria, and scoring rubric.', 4, false)
) AS s(step_order, step_name, recommended_action, expected_duration_days, is_critical);

-- POC / Evaluation Playbook  (stage: Validation)
WITH pb AS (
  INSERT INTO edc_v2.playbooks (playbook_name, description, applicable_stage, created_by)
  VALUES ('POC / Evaluation Playbook',
          'Drive a proof-of-concept to a clean go/no-go with locked success criteria.',
          'Validation', 'migration')
  RETURNING id
)
INSERT INTO edc_v2.playbook_steps (playbook_id, step_order, step_name, recommended_action, expected_duration_days, is_critical)
SELECT pb.id, s.step_order, s.step_name, s.recommended_action, s.expected_duration_days, s.is_critical
FROM pb, (VALUES
  (1, 'Lock success criteria', 'Run a success-criteria workshop and get written sign-off on the PoC exit criteria (Gate 1).', 3, true),
  (2, 'Secure executive sponsor', 'Confirm an executive sponsor agrees on the evaluation criteria and timeline.', 5, true),
  (3, 'Demonstrate core workflow', 'Validate the primary use-case workflows in the customer''s environment.', 7, false),
  (4, 'Demo delivered & feedback captured', 'Deliver a formal demo and capture structured feedback from all stakeholders.', 3, false),
  (5, 'Architecture review & sign-off', 'Run a technical architecture review with the prospect''s infra/DevOps team (deployment design, integrations, data flows, scalability) and capture documented sign-off.', 5, false),
  (6, 'Run performance / scale test', 'Stress the platform under production-representative load and capture the results.', 5, false),
  (7, 'Go/no-go decision', 'Hold a decision review against the locked criteria and set the next-stage plan.', 2, true)
) AS s(step_order, step_name, recommended_action, expected_duration_days, is_critical);

-- Negotiation / Commercial Playbook  (stage: Commercial)
WITH pb AS (
  INSERT INTO edc_v2.playbooks (playbook_name, description, applicable_stage, created_by)
  VALUES ('Negotiation / Commercial Playbook',
          'Protect price integrity and attach services while closing the commercial.',
          'Commercial', 'migration')
  RETURNING id
)
INSERT INTO edc_v2.playbook_steps (playbook_id, step_order, step_name, recommended_action, expected_duration_days, is_critical)
SELECT pb.id, s.step_order, s.step_name, s.recommended_action, s.expected_duration_days, s.is_critical
FROM pb, (VALUES
  (1, 'Confirm technical win', 'Verify Gate 3 (performance) is passed before opening commercial discussions.', 2, true),
  (2, 'Build services-attached business case', 'Draft a Professional Services / Premium Support SOW to protect the deployment.', 4, false),
  (3, 'Business case / ROI delivered', 'Deliver a quantified business case showing the prospect''s expected return, savings, or revenue impact.', 4, false),
  (4, 'Present pricing & anchor value', 'Walk the customer through the value-anchored pricing model and ROI.', 3, false),
  (5, 'Formal proposal / price quote delivered', 'Deliver the official pricing document: SKU breakdown, discount justification, term length, and payment schedule.', 2, true),
  (6, 'Lock mutual close plan', 'Agree a mutual action plan with a hard decision date and procurement owners.', 3, true)
) AS s(step_order, step_name, recommended_action, expected_duration_days, is_critical);

-- Procurement / Legal Playbook  (stage: Procurement)
WITH pb AS (
  INSERT INTO edc_v2.playbooks (playbook_name, description, applicable_stage, created_by)
  VALUES ('Procurement / Legal Playbook',
          'Clear legal and security review to a signed contract.',
          'Procurement', 'migration')
  RETURNING id
)
INSERT INTO edc_v2.playbook_steps (playbook_id, step_order, step_name, recommended_action, expected_duration_days, is_critical)
SELECT pb.id, s.step_order, s.step_name, s.recommended_action, s.expected_duration_days, s.is_critical
FROM pb, (VALUES
  (1, 'Submit security questionnaire', 'Provide the completed security questionnaire and architecture docs to InfoSec.', 5, false),
  (2, 'NDA, DPA & compliance evidence provided', 'Ensure NDA and (for personal/regulated data) a DPA are signed, and deliver required compliance evidence (SOC 2, ISO 27001, HIPAA BAA) for InfoSec acceptance.', 4, false),
  (3, 'Resolve legal redlines', 'Work counsel through liability, data-processing, and SLA redlines.', 7, true),
  (4, 'Vendor registration / procurement onboarding', 'Complete vendor registration in the buyer''s procurement system (Ariba/Coupa/Oracle) so a PO can be issued.', 5, false),
  (5, 'Purchase order received', 'Confirm a formal PO matching the order form/quote has been received.', 3, true),
  (6, 'Obtain final sign-off', 'Secure CTO/VP Engineering and procurement sign-off for execution.', 3, true)
) AS s(step_order, step_name, recommended_action, expected_duration_days, is_critical);

-- Onboarding / Handoff Playbook  (stage: Closed-Won)
WITH pb AS (
  INSERT INTO edc_v2.playbooks (playbook_name, description, applicable_stage, created_by)
  VALUES ('Onboarding / Handoff Playbook',
          'Convert a signed deal into a clean sales-to-delivery handoff and a confirmed go-live.',
          'Closed-Won', 'migration')
  RETURNING id
)
INSERT INTO edc_v2.playbook_steps (playbook_id, step_order, step_name, recommended_action, expected_duration_days, is_critical)
SELECT pb.id, s.step_order, s.step_name, s.recommended_action, s.expected_duration_days, s.is_critical
FROM pb, (VALUES
  (1, 'Customer success handoff prepared', 'Complete a structured sales-to-CS handoff: deal context, key contacts, technical requirements, promised deliverables.', 3, true),
  (2, 'Onboarding kickoff scheduled', 'Calendar the implementation kickoff with the right attendees from both sides.', 2, false),
  (3, 'Go-live date confirmed', 'Confirm the go-live date explicitly with the customer, not just inferred from a timeline.', 3, false)
) AS s(step_order, step_name, recommended_action, expected_duration_days, is_critical);

COMMIT;
