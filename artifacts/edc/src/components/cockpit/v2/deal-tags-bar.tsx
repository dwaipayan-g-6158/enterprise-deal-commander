import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDealTags,
  useListTags,
  useApplyDealTag,
  useRemoveDealTag,
} from "@workspace/api-client-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

export function DealTagsBar({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const dealTags = useGetDealTags(dealId);
  const allTags = useListTags();
  const apply = useApplyDealTag();
  const remove = useRemoveDealTag();

  const applied = dealTags.data?.data ?? [];
  const appliedIds = new Set(applied.map((t) => t.id));
  const available = (allTags.data?.data ?? []).filter((t) => !appliedIds.has(t.id));
  const invalidate = () => qc.invalidateQueries({ queryKey: dealTags.queryKey });

  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {applied.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: t.color }}
        >
          {t.tagName}
          <button
            onClick={async () => {
              await remove.mutateAsync({ dealId, tagId: t.id });
              await invalidate();
            }}
            aria-label={`Remove ${t.tagName}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
            <Plus className="h-3 w-3 mr-1" /> Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="start">
          {available.length === 0 && (
            <p className="text-xs text-muted-foreground p-2">All tags applied.</p>
          )}
          {available.map((t) => (
            <button
              key={t.id}
              className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted text-left"
              onClick={async () => {
                await apply.mutateAsync({ dealId, tagId: t.id });
                await invalidate();
              }}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
              {t.tagName}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
