import { useGetMeddpiccAssessment } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { HEALTH_CLASS, type Health } from "@/lib/semantic-colors";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";

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
 * Qualification: one percentage, then the eight questions behind it.
 *
 * Answers the app computed for itself are marked as such, so a reader can tell
 * what a human asserted from what the engine inferred. That distinction is the
 * whole reason the assessment was cut from forty-three questions to eight —
 * seven of the eight are now derived from data the deal already holds, and only
 * one is genuinely a judgment somebody has to make.
 *
 * Read-only: answering is a form, and a form is desktop work.
 */
export function MeddpiccPanel({ dealId }: PanelBodyProps) {
  const query = useGetMeddpiccAssessment(dealId);
  const assessment = query.data?.data;

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && !assessment}
      emptyTitle="Not assessed yet"
      emptyBody="The assessment seeds itself the first time the deal is opened on desktop."
    >
      {assessment ? (
        <>
          <MobileCard>
            <CardHeader label="Qualified" />
            <p
              className={cn(
                "m-title m-num",
                HEALTH_CLASS[RAG_TO_HEALTH[assessment.score.ragStatus?.toUpperCase()] ?? "YELLOW"]
                  .text,
              )}
            >
              {Math.round(assessment.score.overallPct)}%
            </p>
            <p className="m-caption m-muted mt-1">
              {assessment.score.unknownCount > 0
                ? `${assessment.score.unknownCount} unanswered`
                : "All questions answered"}
              {assessment.score.strongNoCount > 0
                ? ` · ${assessment.score.strongNoCount} strong no`
                : ""}
            </p>
          </MobileCard>

          <MobileCard>
            <CardHeader label="Questions" />
            <ul className="space-y-4">
              {assessment.questions.map((question) => {
                const answer = assessment.answers.find(
                  (a) => a.questionOrder === question.questionOrder,
                );
                const value = answer?.score ?? null;
                return (
                  <li key={question.questionOrder}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="m-label m-muted">{question.pillar}</p>
                      <span
                        className={cn(
                          "m-label shrink-0",
                          value == null ? "m-muted" : ANSWER_TONE[value],
                        )}
                      >
                        {value == null ? "Unanswered" : ANSWER_LABEL[value]}
                      </span>
                    </div>
                    <p className="m-body mt-0.5 text-pretty">{question.questionText}</p>
                    {answer?.source === "computed" && answer.reason ? (
                      <p className="m-caption m-muted mt-0.5 text-pretty">
                        Computed — {answer.reason}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </MobileCard>
        </>
      ) : null}
    </PanelBody>
  );
}
