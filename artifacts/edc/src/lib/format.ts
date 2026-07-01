export function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}
