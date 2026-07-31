// House style for surfacing the server's real message on a failed mutation,
// instead of a generic "Failed to X" toast that throws away useful detail —
// e.g. threshold-validation.ts's `risk_weight_technical must be a positive
// number, got abc`. Originally defined inline in settings/users-settings.tsx;
// several other pages (deals.tsx, technical-gates.tsx, blockers-panel.tsx,
// risk-governance.tsx) independently grew their own copy of this same shape
// before this one existed as a shared export — this is the version new
// callers should import rather than re-inlining.
//
// customFetch (lib/api-client-react) rejects with the parsed JSON error body
// on a non-2xx response, shaped `{ error: { message } }` by the API's
// central error middleware (see app.ts). A network failure or thrown
// exception instead lands here as a plain `Error`.
export function serverMessage(err: unknown, fallback: string): string {
  return (
    (err as { data?: { error?: { message?: string } } })?.data?.error?.message ??
    (err instanceof Error ? err.message : undefined) ??
    fallback
  );
}
