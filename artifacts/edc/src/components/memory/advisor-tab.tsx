import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useAskDealMemory } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Send } from "lucide-react";

interface Citation { id: string; dealName: string; accountName: string }
interface AdvisorAnswer { answer: string; confidence: "high" | "medium" | "low" | "none"; citations: Citation[] }

export interface Message {
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

interface PendingAsk { id: number; q: string }

export function AdvisorTab({
  messages,
  onMessagesChange,
}: {
  messages: Message[];
  onMessagesChange: Dispatch<SetStateAction<Message[]>>;
}) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const { data, isFetching, isError } = useAskDealMemory(
    { q: pending?.q ?? "" } as never,
    { query: { enabled: pending != null } } as never,
  );

  // Keyed to `pending`, not to `data`'s object identity — this is what makes
  // re-asking the same question work (a new `pending.id` always re-enables the
  // query) and stops the double-append bug (once `pending` is cleared, further
  // background settlement of the same query is ignored).
  useEffect(() => {
    if (!pending || isFetching) return;
    if (isError) {
      onMessagesChange((prev) => [...prev, { role: "advisor", text: "Couldn't reach Deal Memory — try again." }]);
      setPending(null);
      return;
    }
    if (data) {
      const payload = data.data as unknown as Partial<AdvisorAnswer> | undefined;
      onMessagesChange((prev) => [
        ...prev,
        {
          role: "advisor",
          text: payload?.answer ?? "No answer text was returned.",
          confidence: payload?.confidence,
          citations: payload?.citations,
        },
      ]);
      setPending(null);
    }
  }, [pending, isFetching, isError, data, onMessagesChange]);

  const ask = () => {
    const question = input.trim();
    if (!question || pending) return;
    onMessagesChange((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setPending({ id: Date.now(), q: question });
  };

  return (
    <div className="flex flex-col h-[600px] rounded-lg border bg-card">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !pending && (
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
        {pending && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-lg px-4 py-3 text-sm italic text-muted-foreground">
              Thinking…
            </div>
          </div>
        )}
      </div>
      <div className="border-t p-3 flex gap-2">
        <Input
          placeholder="Ask Deal Memory a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !pending) ask(); }}
        />
        <Button onClick={ask} disabled={pending != null || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
