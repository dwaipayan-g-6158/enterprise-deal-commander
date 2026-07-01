import { useLocalStorageState } from "./use-local-storage-state";

export interface SavedMemorySearch {
  id: string;
  label: string;
  q: string;
  outcome: string;
  competitor: string;
  pricingModel: string;
  servicesTier: string;
}

const MAX_HISTORY = 10;

export function useSavedMemorySearches() {
  const [saved, setSaved] = useLocalStorageState<SavedMemorySearch[]>("edc.memory.savedSearches", []);
  const [history, setHistory] = useLocalStorageState<string[]>("edc.memory.searchHistory", []);

  const save = (search: Omit<SavedMemorySearch, "id">) => {
    setSaved((prev) => [{ ...search, id: crypto.randomUUID() }, ...prev].slice(0, 20));
  };
  const remove = (id: string) => setSaved((prev) => prev.filter((s) => s.id !== id));
  const recordQuery = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setHistory((prev) => [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY));
  };

  return { saved, save, remove, history, recordQuery };
}
