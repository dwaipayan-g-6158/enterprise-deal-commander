/**
 * The engine prefixes most alert messages with their own pattern name in block
 * caps — `PREMATURE COMMERCIAL DISCONNECT: Sales line has moved to…`. Every
 * surface that shows an alert also shows `humanizeCode(alert.code)` above it,
 * so the reader gets the same words twice, the second time shouted.
 *
 * This strips the prefix, but only when it demonstrably *is* the code: the
 * head has to be all upper case and has to match the alert's own code once
 * both are reduced to letters and digits. A message that merely happens to
 * contain a colon ("TCV: 3.8M") is left alone, and so is one whose prefix
 * names something other than the pattern above it.
 */
export function alertBody(alert: { code: string; message: string }): string {
  const colon = alert.message.indexOf(":");
  if (colon <= 0) return alert.message;

  const head = alert.message.slice(0, colon);
  if (head !== head.toUpperCase()) return alert.message;

  const key = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const headKey = key(head);
  const codeKey = key(alert.code);
  if (!headKey || !codeKey) return alert.message;
  if (!headKey.startsWith(codeKey) && !codeKey.startsWith(headKey)) return alert.message;

  const rest = alert.message.slice(colon + 1).trim();
  // A prefix with nothing after it is the whole message; keep it rather than
  // rendering an empty line.
  return rest.length > 0 ? rest : alert.message;
}
