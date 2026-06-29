import { useCallback, useEffect, useRef, useState } from "react";

// Reusable localStorage-backed state. SSR-safe (lazy init guarded), cross-tab
// synced via the `storage` event, and quota/parse-safe (degrades to in-memory
// state on any failure so the UI never crashes on a corrupt or full store).
//
// Pass a `version` + `migrate` to evolve the stored shape over time: a stored
// blob whose version differs is run through `migrate` (default: discard -> initial).

interface Options<T> {
  version?: number;
  migrate?: (persisted: unknown, fromVersion: number | undefined) => T;
}

interface Envelope<T> {
  v: number;
  data: T;
}

function read<T>(key: string, initial: T, opts: Options<T>): T {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return initial;
    const parsed = JSON.parse(raw) as Envelope<T> | T;
    const version = opts.version ?? 0;
    if (parsed && typeof parsed === "object" && "v" in parsed && "data" in parsed) {
      const env = parsed as Envelope<T>;
      if (env.v === version) return env.data;
      return opts.migrate ? opts.migrate(env.data, env.v) : initial;
    }
    // Legacy un-enveloped value.
    return opts.migrate ? opts.migrate(parsed, undefined) : (parsed as T);
  } catch {
    return initial;
  }
}

export function useLocalStorageState<T>(
  key: string,
  initial: T,
  opts: Options<T> = {},
): [T, (value: T | ((prev: T) => T)) => void] {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [state, setState] = useState<T>(() => read(key, initial, opts));

  const set = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          const env: Envelope<T> = { v: optsRef.current.version ?? 0, data: next };
          window.localStorage.setItem(key, JSON.stringify(env));
        } catch {
          // Quota exceeded / private mode: keep the value in memory only.
        }
        return next;
      });
    },
    [key],
  );

  // Cross-tab sync: adopt changes written by other tabs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      setState(read(key, initial, optsRef.current));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // `initial` intentionally excluded — it is the seed, not a live dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [state, set];
}
