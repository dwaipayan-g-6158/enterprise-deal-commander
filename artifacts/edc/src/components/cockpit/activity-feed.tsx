import { useListAudit, useListChanges } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ActivityFeed({ dealId }: { dealId: string }) {
  const { data: audit } = useListAudit(dealId);
  const { data: changes } = useListChanges(dealId);

  const auditList = audit?.data ?? [];
  const changeList = changes?.data ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Changes</CardTitle>
        </CardHeader>
        <CardContent>
          {changeList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded yet. This deal's been steady.</p>
          ) : (
            <ul className="space-y-3">
              {changeList.map((c, idx) => (
                <li key={idx} className="text-sm border-l-2 border-primary/40 pl-3">
                  <p>{c.line}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.field} · {new Date(c.at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Audit Trail</CardTitle>
        </CardHeader>
        <CardContent>
          {auditList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet. Clean record so far.</p>
          ) : (
            <ul className="space-y-3">
              {auditList.map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{a.fieldChanged}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.changedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {a.oldValue ?? "—"} → {a.newValue ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">by {a.changedBy}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
