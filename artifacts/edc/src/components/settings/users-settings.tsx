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

/**
 * UX-only mirror of the server's corporate-domain rule
 * (api-server's lib/email-domain.ts), so a rejected address is obvious while
 * typing instead of after a round trip. The allowlist is env-configurable and
 * therefore cannot be hardcoded here — it arrives on the session from
 * /auth/me. When it is absent (an older server, or offline), this returns true
 * and the server's 400 is the only check, which is the correct fallback: this
 * one is advisory and the server's is the real control.
 *
 * Exact domain match, never endsWith — same reasoning as the server's.
 */
function isAllowedEmail(email: string, allowedDomains: string[] | undefined): boolean {
  if (!allowedDomains?.length) return true;
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return false;
  return allowedDomains.includes(email.slice(at + 1).trim().toLowerCase());
}

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
  // `!u.isPending` matches the server's isEffectiveAdmin: an admin who was
  // invited but has never signed in does not count as an admin.
  const adminCount = users.filter((u) => u.role === "admin" && u.isActive && !u.isPending).length;
  const isSelf = (u: User) => u.id === me?.id;
  const isLastAdmin = (u: User) => u.role === "admin" && u.isActive && !u.isPending && adminCount <= 1;

  const allowedDomains = me?.allowedEmailDomains;
  const domainHint = allowedDomains?.length ? allowedDomains.map((d) => `@${d}`).join(", ") : null;
  const emailTyped = form.email.trim();
  const emailRejected = emailTyped.length > 0 && !isAllowedEmail(emailTyped, allowedDomains);

  const addUser = async () => {
    if (!emailTyped || !form.display_name.trim()) {
      toast({ title: "Email and display name are required", variant: "destructive" });
      return;
    }
    if (emailRejected) {
      toast({ title: `Only ${domainHint} email addresses can be invited`, variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ data: { ...form, email: emailTyped } });
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
                    {/* An invite nobody has accepted yet is neither active nor
                        deactivated — showing "Active" made it indistinguishable
                        from someone who actually signs in. Deactivating a
                        never-claimed invite would mean nothing, so there is no
                        switch here; cancel it with Delete instead. */}
                    {u.isPending ? (
                      <Badge variant="secondary">Invited</Badge>
                    ) : canWrite && !locked ? (
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
                    {u.isPending
                      ? "Invite pending"
                      : u.lastDashboardVisitAt
                        ? relativeTime(u.lastDashboardVisitAt)
                        : "Never"}
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
                aria-invalid={emailRejected || undefined}
                aria-describedby="new-user-email-hint"
              />
              {domainHint && (
                <p
                  id="new-user-email-hint"
                  className={emailRejected ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                >
                  {emailRejected
                    ? `Only ${domainHint} addresses can be invited.`
                    : `Must be a ${domainHint} address.`}
                </p>
              )}
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
            <Button onClick={addUser} disabled={create.isPending || emailRejected}>
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
