import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMeddpiccAssessment, useUpsertMeddpiccAnswer } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface Question {
  questionOrder: number;
  pillar: string;
  stageTag: string;
  questionText: string;
  helpText?: string | null;
}
interface Answer {
  questionOrder: number;
  score: number | null;
  note: string | null;
  isAutoSuggested: boolean;
}
interface Suggestion {
  questionOrder: number;
  suggestedScore: number;
  reason: string;
}
interface PillarBreakdown {
  pillar: string;
  raw: number;
  max: number;
  pct: number;
}
interface Score {
  overallScore: number;
  overallPct: number;
  stagePct: number;
  ragStatus: "Red" | "Amber" | "Green";
  pillarBreakdown: PillarBreakdown[];
  strongNoCount: number;
  unknownCount: number;
}
interface Assessment {
  questions: Question[];
  answers: Answer[];
  suggestions: Suggestion[];
  score: Score;
}

const PILLAR_LABEL: Record<string, string> = {
  Metrics: "Metrics",
  EconomicBuyer: "Economic Buyer",
  DecisionCriteria: "Decision Criteria",
  DecisionProcess: "Decision Process",
  PaperProcess: "Paper Process",
  IdentifyPain: "Identify Pain & Value Drivers",
  Champion: "Champion(s)",
  Competition: "Competition",
};

const RAG_BADGE: Record<Score["ragStatus"], string> = {
  Red: "bg-destructive text-destructive-foreground",
  Amber: "bg-amber-500 text-white",
  Green: "bg-emerald-500 text-white",
};

function QuestionRow({
  question,
  answer,
  suggestion,
  onScore,
}: {
  question: Question;
  answer: Answer | undefined;
  suggestion: Suggestion | undefined;
  onScore: (score: number, note: string | null) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(answer?.note ?? "");

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">
          {question.questionText}
          {question.helpText && (
            <span className="ml-2 text-xs text-muted-foreground">{question.helpText}</span>
          )}
        </p>
        {suggestion && answer?.score == null && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Suggested: {suggestion.suggestedScore}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {[3, 2, 1, 0].map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant={answer?.score === n ? "default" : "outline"}
            className="h-7 w-9 px-0"
            onClick={() => onScore(n, noteDraft || null)}
          >
            {n}
          </Button>
        ))}
        {answer?.isAutoSuggested && (
          <span className="text-xs text-muted-foreground">accepted suggestion</span>
        )}
      </div>
      <Textarea
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          if (answer?.score != null && noteDraft !== (answer.note ?? "")) {
            onScore(answer.score, noteDraft || null);
          }
        }}
        placeholder="Notes (optional)"
        className="h-16 text-xs"
      />
    </div>
  );
}

function PillarSection({
  pillar,
  breakdown,
  questions,
  answers,
  suggestions,
  onScore,
}: {
  pillar: string;
  breakdown: PillarBreakdown | undefined;
  questions: Question[];
  answers: Answer[];
  suggestions: Suggestion[];
  onScore: (questionOrder: number, score: number, note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const answerByOrder = new Map(answers.map((a) => [a.questionOrder, a]));
  const suggestionByOrder = new Map(suggestions.map((s) => [s.questionOrder, s]));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-left">
        <span className="text-sm font-medium">{PILLAR_LABEL[pillar] ?? pillar}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {breakdown?.raw ?? 0}/{breakdown?.max ?? 0} · {breakdown?.pct ?? 0}%
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {questions.map((q) => (
          <QuestionRow
            key={q.questionOrder}
            question={q}
            answer={answerByOrder.get(q.questionOrder)}
            suggestion={suggestionByOrder.get(q.questionOrder)}
            onScore={(score, note) => onScore(q.questionOrder, score, note)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

const PILLAR_ORDER = [
  "Metrics",
  "EconomicBuyer",
  "DecisionCriteria",
  "DecisionProcess",
  "PaperProcess",
  "IdentifyPain",
  "Champion",
  "Competition",
];

export function MeddpiccPanel({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const query = useGetMeddpiccAssessment(dealId);
  const upsert = useUpsertMeddpiccAnswer();

  const invalidate = () =>
    qc.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && JSON.stringify(q.queryKey).includes(dealId),
    });

  const handleScore = async (questionOrder: number, score: number, note: string | null) => {
    try {
      await upsert.mutateAsync({ dealId, data: { questionOrder, score, note } as never });
      invalidate();
    } catch {
      toast({ title: "Couldn't save answer", variant: "destructive" });
    }
  };

  if (query.isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
      </Card>
    );
  }

  const assessment = (query.data?.data as Assessment | undefined) ?? undefined;
  if (!assessment) {
    return <Card className="p-4 text-sm text-muted-foreground">MEDDPICC assessment unavailable.</Card>;
  }

  const { questions, answers, suggestions, score } = assessment;
  const breakdownByPillar = new Map(score.pillarBreakdown.map((b) => [b.pillar, b]));
  const questionsByPillar = new Map<string, Question[]>();
  for (const q of questions) {
    const list = questionsByPillar.get(q.pillar) ?? [];
    list.push(q);
    questionsByPillar.set(q.pillar, list);
  }

  return (
    <Card className="p-4">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-3">
        <CardTitle className="text-base">MEDDPICC Qualification</CardTitle>
        <div className="flex items-center gap-2">
          <Badge className={RAG_BADGE[score.ragStatus]}>{score.overallPct}% overall</Badge>
          <Badge variant="outline">{score.stagePct}% at this stage</Badge>
        </div>
      </CardHeader>
      <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
        <span>Strong No: {score.strongNoCount}</span>
        <span>Unknown: {score.unknownCount}</span>
      </div>
      {PILLAR_ORDER.map((pillar) => (
        <PillarSection
          key={pillar}
          pillar={pillar}
          breakdown={breakdownByPillar.get(pillar)}
          questions={questionsByPillar.get(pillar) ?? []}
          answers={answers}
          suggestions={suggestions}
          onScore={handleScore}
        />
      ))}
    </Card>
  );
}
