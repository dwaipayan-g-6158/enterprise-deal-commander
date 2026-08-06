import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  type User,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useSession, useCanWrite } from "@/lib/auth/role-context";
import { AdminOnly, ReadOnlyNotice } from "@/components/auth/write-gate";
import { relativeTime } from "@/components/dashboard/widgets/_shared";
import { serverMessage } from "@/lib/server-message";
import { Plus, MoreHorizontal, Trash2, Users as UsersIcon } from "lucide-react";

const EMPTY_FORM = { email: "", display_name: "", role: "reader" as "admin" | "reader" };

export function UsersSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const { user: me } = useSession();

  const list = useListUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const del = useDeleteUser();

  const users = list.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: list.queryKey });

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  // These mirror the server's own guards (routes/users.ts) — they only keep
  // the UI from offering a click that is guaranteed to fail with a 409. The
  // server enforces them independently; this is UX, not the real control.
  const adminCount = users.filter((u) => u.role === "admin" && u.isActive).length;
  const isSelf = (u: User) => u.id === me?.id;
  const isLastAdmin = (u: User) => u.role === "admin" && u.isActive && adminCount <= 1;

  const addUser = async () => {
    if (!form.email.trim() || !form.display_name.trim()) {
      toast({ title: "Email and display name are required", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ data: { ...form, email: form.email.trim() } });
      await invalidate();
      setForm(EMPTY_FORM);
      setAddOpen(false);
      toast({ title: "Invite sent", description: "They'll get a Catalyst email to set up sign-in." });
    } catch (err) {
      toast({
        title: "Could not invite user",
        description: serverMessage(err, "Check the email isn't already in use."),
        variant: "destructive",
      });
    }
  };

  const changeRole = async (u: User, role: "admin" | "reader") => {
    try {
      await update.mutateAsync({ id: u.id, data: { role } });
      await invalidate();
      toast({ title: `${u.displayName || u.email} is now ${role}` });
    } catch (err) {
      toast({ title: "Could not change role", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  const toggleActive = async (u: User, isActive: boolean) => {
    try {
      await update.mutateAsync({ id: u.id, data: { is_active: isActive } });
      await invalidate();
      toast({ title: isActive ? "User reactivated" : "User deactivated" });
    } catch (err) {
      toast({ title: "Could not update user", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync({ id: deleteTarget.id });
      await invalidate();
      setDeleteTarget(null);
      toast({ title: "User deleted" });
    } catch (err) {
      toast({ title: "Could not delete user", description: serverMessage(err, ""), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Admins can change anything. Readers see every page and export, but can't make changes.
            </CardDescription>
          </div>
          <AdminOnly>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add user
            </Button>
          </AdminOnly>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!canWrite && <ReadOnlyNotice>You can see the full user list, but only an admin can add, change, or remove accounts.</ReadOnlyNotice>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="w-40">Role</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHead className="w-40">Last active</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const locked = isSelf(u) || isLastAdmin(u);
              return (
                <TableRow key={u.id} className={u.isActive ? undefined : "opacity-60"}>
                  <TableCell>
                    <p className="font-medium">
                      {u.displayName || u.email}
                      {isSelf(u) && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>

                  <TableCell>
                    {canWrite && !locked ? (
                      <Select value={u.role} onValueChange={(r) => changeRole(u, r as "admin" | "reader")}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="reader">Reader</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={u.role === "admin" ? "default" : "outline"}>{u.role}</Badge>
                    )}
                  </TableCell>

                  <TableCell>
                    {canWrite && !locked ? (
                      <label className="flex items-center gap-2 text-sm">
                        <Switch checked={u.isActive} onCheckedChange={(v) => toggleActive(u, v)} />
                        {u.isActive ? "Active" : "Off"}
                      </label>
                    ) : (
                      <Badge variant={u.isActive ? "outline" : "destructive"}>
                        {u.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {u.lastDashboardVisitAt ? relativeTime(u.lastDashboardVisitAt) : "Never"}
                  </TableCell>

                  <TableCell>
                    <AdminOnly>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${u.email}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={locked}
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setDeleteTarget(u)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </AdminOnly>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {users.length === 0 && !list.isLoading && (
          canWrite ? (
            <p className="text-sm text-muted-foreground">No users yet. Add one above.</p>
          ) : (
            <p className="text-sm text-muted-foreground">No users to show.</p>
          )
        )}
      </CardContent>

      {/* --- Add user --------------------------------------------------- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent animation="spotlight">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              They'll get a Catalyst email to set up sign-in at this address. Readers can see
              everything; only admins can make changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-name">Display name</Label>
              <Input
                id="new-user-name"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(role) => setForm({ ...form, role: role as "admin" | "reader" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reader">Reader — can view everything</SelectItem>
                  <SelectItem value="admin">Admin — full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addUser} disabled={create.isPending}>
              {create.isPending ? "Inviting…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Delete confirm ----------------------------------------------- */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent animation="spotlight">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.displayName || deleteTarget?.email} will lose access immediately.
              Deals and history they touched stay exactly as they are. This can't be undone —
              deactivate instead if you might want them back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
