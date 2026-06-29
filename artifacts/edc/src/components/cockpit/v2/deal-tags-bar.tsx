import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDealTags,
  useListTags,
  useApplyDealTag,
  useRemoveDealTag,
  useCreateTag,
  useDeleteTag,
} from "@workspace/api-client-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, X, Trash2 } from "lucide-react";

// Palette offered when creating a tag — mirrors the app's chart/accent colors.
const TAG_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#ec4899", "#64748b"];

export function DealTagsBar({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const dealTags = useGetDealTags(dealId);
  const allTags = useListTags();
  const apply = useApplyDealTag();
  const remove = useRemoveDealTag();
  const create = useCreateTag();
  const del = useDeleteTag();

  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const applied = dealTags.data?.data ?? [];
  const appliedIds = new Set(applied.map((t) => t.id));
  const available = (allTags.data?.data ?? []).filter((t) => !appliedIds.has(t.id));

  const refreshDeal = () => qc.invalidateQueries({ queryKey: dealTags.queryKey });
  const refreshAll = () => qc.invalidateQueries({ queryKey: allTags.queryKey });

  const handleCreate = async () => {
    const tagName = name.trim();
    if (!tagName || create.isPending) return;
    const res = await create.mutateAsync({ data: { tag_name: tagName, color } });
    setName("");
    await refreshAll();
    // Newly created tags are immediately applied to the deal in view.
    const newId = res?.data?.id;
    if (newId) {
      await apply.mutateAsync({ dealId, tagId: newId });
      await refreshDeal();
    }
  };

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
              await refreshDeal();
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
        <PopoverContent className="w-56 p-2" align="start">
          {available.length > 0 && (
            <div className="space-y-0.5 mb-2">
              {available.map((t) =>
                pendingDelete === t.id ? (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-sm bg-destructive/10 px-2 py-1.5 text-xs"
                  >
                    <span className="flex-1 truncate">
                      Delete “{t.tagName}” everywhere?
                    </span>
                    <button
                      className="font-medium text-destructive hover:underline"
                      disabled={del.isPending}
                      onClick={async () => {
                        await del.mutateAsync({ tagId: t.id });
                        setPendingDelete(null);
                        await refreshAll();
                        await refreshDeal();
                      }}
                    >
                      Delete
                    </button>
                    <button
                      className="text-muted-foreground hover:underline"
                      onClick={() => setPendingDelete(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div key={t.id} className="flex items-center rounded-sm hover:bg-muted">
                    <button
                      className="flex flex-1 items-center gap-2 px-2 py-1.5 text-sm text-left"
                      onClick={async () => {
                        await apply.mutateAsync({ dealId, tagId: t.id });
                        await refreshDeal();
                      }}
                    >
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      {t.tagName}
                    </button>
                    <button
                      className="px-2 py-1.5 text-muted-foreground/60 hover:text-destructive"
                      aria-label={`Delete tag ${t.tagName}`}
                      title="Delete this tag everywhere"
                      onClick={() => setPendingDelete(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ),
              )}
            </div>
          )}

          {/* Create a new tag — the only place tag definitions are minted. */}
          <div className={cn("space-y-2", available.length > 0 && "border-t pt-2")}>
            <p className="px-1 text-[11px] font-medium text-muted-foreground">
              {available.length === 0 ? "No tags yet — create one" : "Create a tag"}
            </p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tag name"
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            <div className="flex items-center gap-1.5 px-1">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use color ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-4 w-4 rounded-full border border-black/10 transition-transform",
                    color === c && "ring-2 ring-ring ring-offset-1 ring-offset-popover scale-110",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button
              size="sm"
              className="h-7 w-full text-xs"
              disabled={!name.trim() || create.isPending}
              onClick={handleCreate}
            >
              {create.isPending ? "Creating…" : "Create & apply"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
