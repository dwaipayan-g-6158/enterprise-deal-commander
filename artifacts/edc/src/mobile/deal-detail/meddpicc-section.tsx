import type { MeddpiccAssessment } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { HEALTH_CLASS, type Health } from "@/lib/semantic-colors";
import { CollapsibleSection } from "@/mobile/components/collapsible-section";

/** The assessment's RAG string maps onto the app's health traffic light. */
const RAG_TO_HEALTH: Record<string, Health> = {
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  AMBER: "YELLOW",
  RED: "RED",
};

/** 0–3 per question, the same scale the cockpit scores on. */
const ANSWER_LABEL: Record<number, string> = {
  0: "Strong no",
  1: "Weak",
  2: "Partial",
  3: "Strong yes",
};

const ANSWER_TONE: Record<number, string> = {
  0: HEALTH_CLASS.RED.text,
  1: HEALTH_CLASS.RED.text,
  2: HEALTH_CLASS.YELLOW.text,
  3: HEALTH_CLASS.GREEN.text,
};

/**
 * Qualification at a glance: one percentage, then the eight questions behind
 * it. Answers the app computed for itself are marked as such, so a reader can
 * tell what a human asserted from what the engine inferred.
 */
export function MeddpiccSection({ assessment }: { assessment: MeddpiccAssessment }) {
  const { score, questions, answers } = assessment;
  const health = RAG_TO_HEALTH[score.ragStatus?.toUpperCase()] ?? "YELLOW";
  const byOrder = new Map(answers.map((a) => [a.questionOrder, a]));

  const verdict = (
    <>
      <p className={cn("m-h3", HEALTH_CLASS[health].text)}>
        <span className="font-mono text-2xl font-semibold tracking-[-0.03em]">
          {Math.round(score.overallPct)}%
        </span>
        <span className="m-muted ml-2 text-sm font-medium">qualified</span>
      </p>
      <p className="m-data m-muted mt-1">
        {score.unknownCount > 0 ? `${score.unknownCount} unanswered` : "All questions answered"}
        {score.strongNoCount > 0 ? ` · ${score.strongNoCount} strong no` : ""}
      </p>
    </>
  );

  return (
    <CollapsibleSection anchorId="meddpicc" label="MEDDPICC" verdict={verdict}>
      <ul className="space-y-3">
        {questions.map((q) => {
          const answer = byOrder.get(q.questionOrder);
          const value = answer?.score ?? null;
          return (
            <li key={q.questionOrder}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="m-eyebrow">{q.pillar}</p>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    value == null ? "m-muted" : ANSWER_TONE[value],
                  )}
                >
                  {value == null ? "Unanswered" : ANSWER_LABEL[value]}
                </span>
              </div>
              <p className="m-body mt-0.5 text-sm">{q.questionText}</p>
              {answer?.source === "computed" && answer.reason ? (
                <p className="m-data m-muted mt-0.5">Computed — {answer.reason}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </CollapsibleSection>
  );
}
