import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTeamMembers,
  useCreateTeamMember,
  useDeleteTeamMember,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Users } from "lucide-react";

export function TeamSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useListTeamMembers();
  const create = useCreateTeamMember();
  const del = useDeleteTeamMember();

  const [form, setForm] = useState({ name: "", can_be_am: true, can_be_tl: false });

  const members = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const add = async () => {
    const name = form.name.trim();
    if (!name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!form.can_be_am && !form.can_be_tl) {
      toast({ title: "Select at least one role", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ data: { name, can_be_am: form.can_be_am, can_be_tl: form.can_be_tl } });
      await invalidate();
      setForm({ name: "", can_be_am: true, can_be_tl: false });
      toast({ title: "Team member added" });
    } catch {
      toast({ title: "Failed to add team member", variant: "destructive" });
    }
  };

  const remove = async (id: number) => {
    try {
      await del.mutateAsync({ id });
      await invalidate();
      toast({ title: "Team member removed" });
    } catch {
      toast({ title: "Failed to remove team member", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-md">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage Account Manager and Technical Lead names that appear in the New Deal form.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-md border p-3">
            <div className="flex-1">
              <p className="font-medium">{m.name}</p>
              <div className="flex gap-1 flex-wrap mt-1">
                {m.can_be_am && <Badge variant="outline" className="text-[10px]">AM</Badge>}
                {m.can_be_tl && <Badge variant="outline" className="text-[10px]">TL</Badge>}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={del.isPending}
              onClick={() => remove(m.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">No team members yet. Add one below.</p>
        )}

        <div className="rounded-md border border-dashed p-3 space-y-3">
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.can_be_am}
                onCheckedChange={(c) => setForm((f) => ({ ...f, can_be_am: c === true }))}
              />
              Account Manager
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.can_be_tl}
                onCheckedChange={(c) => setForm((f) => ({ ...f, can_be_tl: c === true }))}
              />
              Technical Lead
            </label>
          </div>
          <Button size="sm" onClick={add} disabled={create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
