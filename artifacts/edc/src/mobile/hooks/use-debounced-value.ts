import { useEffect, useState } from "react";

/**
 * Trails `value` by `delayMs`, so a search issues one request when typing
 * stops rather than one per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
