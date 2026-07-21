import { useEffect, useState } from "react";
import { useAskDealMemory } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Send } from "lucide-react";

interface Citation { id: string; dealName: string; accountName: string }
interface AdvisorAnswer { answer: string; confidence: "high" | "medium" | "low" | "none"; citations: Citation[] }

interface Message {
  role: "user" | "advisor";
  text: string;
  confidence?: AdvisorAnswer["confidence"];
  citations?: Citation[];
}

const CONFIDENCE_LABEL: Record<AdvisorAnswer["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "Nothing found",
};

const CONFIDENCE_CLASS: Record<AdvisorAnswer["confidence"], string> = {
  high: "text-emerald-600",
  medium: "text-amber-600",
  low: "text-muted-foreground",
  none: "text-destructive",
};

export function AdvisorTab() {
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const { data, isFetching } = useAskDealMemory(
    { q: submittedQuery } as never,
    { query: { enabled: submittedQuery.length > 0 } } as never,
  );

  // Fires once per distinct submitted query: `data` only gets a new object
  // reference when the query key changes and actually refetches, so asking the
  // exact same question twice in a row intentionally does not append a second
  // (identical, cached) answer bubble.
  useEffect(() => {
    if (!data) return;
    const payload = data.data as unknown as AdvisorAnswer;
    setMessages((prev) => [
      ...prev,
      { role: "advisor", text: payload.answer, confidence: payload.confidence, citations: payload.citations },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const ask = () => {
    const question = input.trim();
    if (!question) return;
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setSubmittedQuery(question);
  };

  return (
    <div className="flex flex-col h-[600px] rounded-lg border bg-card">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask about competitors ("How have we done against CloudBridge?"), pricing ("What's typical pricing for enterprise deals?"),
            or precedents ("What's the biggest deal we've closed?"). Answers are computed deterministically from your archived deals — no AI model is used, so answers are only as good as your archive's coverage.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "bg-primary/10 rounded-lg px-4 py-2 text-sm max-w-[80%]"
                  : "bg-card border border-border rounded-lg px-4 py-3 text-sm max-w-[90%] space-y-2"
              }
            >
              <p>{m.text}</p>
              {m.confidence && (
                <p className={`text-xs font-medium ${CONFIDENCE_CLASS[m.confidence]}`}>{CONFIDENCE_LABEL[m.confidence]}</p>
              )}
              {m.citations && m.citations.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {m.citations.map((c) => (
                    <Link key={c.id} href={`/memory/${c.id}`}>
                      <Badge variant="outline" className="cursor-pointer text-xs">{c.dealName}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-3 flex gap-2">
        <Input
          placeholder="Ask Deal Memory a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !isFetching) ask(); }}
        />
        <Button onClick={ask} disabled={isFetching || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
