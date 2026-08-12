import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "wouter";
import { ArrowUp } from "lucide-react";
import { useAskDealMemory } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { HEALTH_CLASS } from "@/lib/semantic-colors";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MDock } from "@/mobile/shell/m-dock";
import { Shimmer } from "@/mobile/components/shimmer";
import {
  appendMessage,
  askThread,
  subscribeThread,
  type AdvisorConfidence,
  type ThreadMessage,
} from "@/mobile/screens/memory/ask-thread";

const CONFIDENCE_LABEL: Record<AdvisorConfidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "Nothing found",
};

const CONFIDENCE_TONE: Record<AdvisorConfidence, string> = {
  high: HEALTH_CLASS.GREEN.text,
  medium: HEALTH_CLASS.YELLOW.text,
  low: "m-muted",
  none: "text-destructive",
};

/** Three questions worth asking, for a thread nobody has started yet. */
const STARTERS = [
  "Why do we lose to our biggest competitor?",
  "What do our won deals have in common?",
  "Which lessons come up most often?",
];

interface Citation {
  id: string;
  dealName: string;
  accountName: string;
}

interface AdvisorAnswer {
  answer: string;
  confidence: AdvisorConfidence;
  citations: Citation[];
}

interface PendingAsk {
  id: number;
  q: string;
}

/**
 * Ask the archive a question.
 *
 * ## `useAskDealMemory` is a GET, and that mattered
 *
 * The old read-only guard classified it as a write purely because its name does
 * not start with get/list/search/compare, which made this screen unshippable
 * until the guard was rebuilt to derive the write surface from the generated
 * client's actual HTTP methods. That rebuild is why this exists at all.
 *
 * ## Built from primitives already here, not from the shadcn chat kit
 *
 * The plan called for `message` / `bubble` / `message-scroller`. They are real
 * registry items, but `bubble` pulls the unified `radix-ui` package (this app
 * uses the scoped `@radix-ui/react-*` ones) and `message-scroller` pulls
 * `@shadcn/react` — two new runtime dependencies, both subject to the 24-hour
 * supply-chain hold, for a list of bubbles and a composer. "No new runtime
 * dependencies" is one of this rebuild's stated constraints, and it outranks a
 * component preference. Written out, this is about sixty lines.
 *
 * The thread lives outside React (ask-thread.ts) so backing out to the archive
 * and returning does not discard the conversation.
 */
export function AskScreen() {
  const messages = useSyncExternalStore(subscribeThread, askThread, askThread);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isFetching, isError } = useAskDealMemory(
    { q: pending?.q ?? "" } as never,
    { query: { enabled: pending != null } } as never,
  );

  // Keyed to `pending`, not to `data`'s object identity — that is what makes
  // re-asking the same question work (a new `pending.id` re-enables the query)
  // and stops the double-append when the same query settles again in the
  // background. Lifted straight from the desktop tab, which got both wrong once.
  useEffect(() => {
    if (!pending || isFetching) return;
    if (isError) {
      appendMessage({ role: "advisor", text: "Couldn't reach Deal Memory — try again." });
      setPending(null);
      return;
    }
    if (data) {
      const payload = (data as { data?: Partial<AdvisorAnswer> }).data;
      appendMessage({
        role: "advisor",
        text: payload?.answer ?? "No answer text was returned.",
        confidence: payload?.confidence,
        citations: payload?.citations,
      });
      setPending(null);
    }
  }, [pending, isFetching, isError, data]);

  // Stick to the bottom as the thread grows. Six lines, and it scrolls the
  // shell's own container rather than fighting a component that brought its own.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, isFetching]);

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    appendMessage({ role: "user", text: trimmed });
    setInput("");
    setPending({ id: Date.now(), q: trimmed });
  };

  return (
    <>
      <MNavBar title="Ask the advisor" backHref="/memory" backLabel="Back to memory" />

      <div className="space-y-4 px-4 pb-6 pt-4">
        {messages.length === 0 ? (
          <div>
            <p className="m-body m-muted text-pretty">
              Answers come from archived deals only, and every one cites the records behind it.
            </p>
            <ul className="mt-4 space-y-2">
              {STARTERS.map((starter) => (
                <li key={starter}>
                  <button
                    type="button"
                    onClick={() => ask(starter)}
                    className="m-card m-tap m-press block w-full p-3.5 text-left"
                  >
                    <span className="m-body">{starter}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((message, i) => (
              <MessageRow key={i} message={message} />
            ))}
          </ul>
        )}

        {isFetching && pending ? (
          <div className="max-w-[85%]">
            <Shimmer className="h-4 w-40" />
            <Shimmer className="mt-2 h-4 w-56" />
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {/* The composer, docked above the tab bar — `--m-dock-bottom`, exactly like
          the Deals and Memory search bars.

          It used to sit at `bottom-0`, on the premise that "there is no tab bar on a
          pushed screen". There is: `MShell` renders `MTabBar` unconditionally and has
          no push-screen variant, so at 390x844 the bar (z-40) covered 65px of this
          bar's 69px (z-30) and neither the field nor the send button was on screen at
          all. The three starter prompts were the only way to ask anything, which is
          how it passed for a design rather than a bug.

          The safe-area inset is deliberately NOT in the padding any more: it belongs
          to the tab bar's own `pb-safe` below, and `--m-dock-bottom` already adds it
          as part of the offset. Keeping it here would count it twice.

          Through MDock like the search bars: this screen renders inside the
          scroller, and iOS composites a fixed element declared there with the
          list rather than pinning it. */}
      <MDock className="bottom-[var(--m-dock-bottom)] px-4 py-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="flex items-end gap-2"
        >
          <label className="sr-only" htmlFor="advisor-input">
            Ask the archive
          </label>
          <input
            id="advisor-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about past deals"
            // `send` rather than `enter`, so the keyboard's action key says what
            // it does. 16px minimum, or iOS zooms the viewport on focus.
            enterKeyHint="send"
            className="m-tap h-12 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-base outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!input.trim() || pending != null}
            aria-label="Send"
            className="m-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <ArrowUp className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>
      </MDock>
    </>
  );
}

function MessageRow({ message }: { message: ThreadMessage }) {
  const mine = message.role === "user";

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%]", mine && "text-right")}>
        <div
          className={cn(
            "inline-block rounded-2xl px-3.5 py-2.5 text-left",
            mine ? "bg-primary text-primary-foreground" : "m-card",
          )}
        >
          <p className="m-body whitespace-pre-wrap text-pretty">{message.text}</p>
        </div>

        {message.confidence ? (
          <p className={cn("m-caption mt-1", CONFIDENCE_TONE[message.confidence])}>
            {CONFIDENCE_LABEL[message.confidence]}
          </p>
        ) : null}

        {message.citations && message.citations.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {message.citations.map((citation) => (
              <li key={citation.id}>
                {/* The evidence, tappable. An answer nobody can check is an
                    assertion, and this one is drawn from records that exist. */}
                <Link
                  href={`/memory/${citation.id}`}
                  className="m-caption m-press m-tap inline-block rounded-full border border-border px-2.5 py-1"
                >
                  {citation.dealName}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
