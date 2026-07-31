import { useEffect, useRef, useState } from "react";
import {
  useSearchDealMemory,
  useGetDeal,
  getSearchDealMemoryQueryKey,
  getGetDealQueryKey,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AutopsyForm } from "@/components/memory/autopsy-form";

// How long to keep polling for a just-archived post-mortem record before
// giving up and showing "not found". The board's close-lost flow opens this
// sheet immediately on a successful close, but the post-mortem subscriber
// (lib/subscribers/post-mortem.ts) writes the deal_memory row asynchronously
// off the event bus — without this, the form would flash "No post-mortem
// record found for this deal yet." while the row was still being written.
const ARCHIVING_POLL_MS = 1500;
const ARCHIVING_TIMEOUT_MS = 6000;

export function LossAutopsySheet({
  dealId,
  dealName,
  open,
  onOpenChange,
}: {
  dealId: string;
  dealName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  // Exact deal_id match (deal_memory.deal_id is unique) — was
  // useSearchDealMemory({ outcome: "Lost" }) + a client-side .find(), which
  // is capped at the search route's LIMIT 50 and silently missed any deal
  // whose post-mortem record fell outside the 50 most recently archived.
  const [pollCount, setPollCount] = useState(0);
  const {
    data: memorySearch,
    isLoading,
    isError,
    refetch,
  } = useSearchDealMemory({ dealId }, { query: { enabled: open, queryKey: getSearchDealMemoryQueryKey({ dealId }) } });
  const memoryRow = memorySearch?.data?.[0];
  const { data: dealRes } = useGetDeal(dealId, { query: { enabled: open, queryKey: getGetDealQueryKey(dealId) } });
  const lossArchetypeId = dealRes?.data?.lossArchetypeId ?? null;

  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!open) {
      startRef.current = null;
      setPollCount(0);
      return;
    }
    if (memoryRow || isLoading || isError) return;
    if (startRef.current == null) startRef.current = Date.now();
    if (Date.now() - startRef.current >= ARCHIVING_TIMEOUT_MS) return;
    const t = setTimeout(() => {
      refetch();
      setPollCount((n) => n + 1);
    }, ARCHIVING_POLL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memoryRow, isLoading, isError, pollCount]);

  const stillArchiving =
    !memoryRow && !isError && startRef.current != null && Date.now() - startRef.current < ARCHIVING_TIMEOUT_MS;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Complete Autopsy — {dealName}</SheetTitle>
          <SheetDescription>Structured loss capture beyond the reason dropdown.</SheetDescription>
        </SheetHeader>
        <div className="py-6">
          {isError ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Could not load the post-mortem record.</p>
              <button type="button" className="text-sm underline underline-offset-2" onClick={() => refetch()}>
                Try again
              </button>
            </div>
          ) : !memoryRow && (isLoading || stillArchiving) ? (
            <p className="text-sm text-muted-foreground py-6">Preparing post-mortem record…</p>
          ) : (
            <AutopsyForm
              dealId={dealId}
              dealName={dealName}
              memoryRow={memoryRow}
              lossArchetypeId={lossArchetypeId}
              onSaved={() => onOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
