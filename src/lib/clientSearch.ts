import { supabase } from "@/integrations/supabase/client";

const MAX_MATCHED_IDS = 1000;
const FISCAL_BATCH = 200;

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function sanitizeWord(raw: string): string {
  return escapeIlike(raw.trim().toLowerCase())
    .replace(/[,()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function entityIdsForWord(word: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data, error } = await (supabase as any).rpc("search_visible_entity_ids", {
    p_search: word,
    p_limit: 200,
  });
  if (error) {
    console.error("[clientSearch] search_visible_entity_ids error:", error);
    return ids;
  }
  (data || []).forEach((r: any) => {
    const id = r?.entity_id ?? r?.id ?? r;
    if (id) ids.add(id);
  });
  return ids;
}


export interface SearchEntityIdsResult {
  ids: string[];
  truncated: boolean;
}

/**
 * Resolve `entity_id`s that match the search term across name, email, phone and NIF.
 * AND between words (tolerates order); OR between fields per word.
 * Returns up to `MAX_MATCHED_IDS` ids; sets `truncated=true` if more matched.
 */
export async function searchEntityIds(search: string): Promise<SearchEntityIdsResult> {
  const words = search
    .toLowerCase()
    .split(/\s+/)
    .map(sanitizeWord)
    .filter((w) => w.length > 0);

  if (words.length === 0) return { ids: [], truncated: false };

  const perWord = await Promise.all(words.map(entityIdsForWord));
  if (perWord.some((s) => s.size === 0)) return { ids: [], truncated: false };

  let intersection = perWord[0];
  for (let i = 1; i < perWord.length; i++) {
    const next = new Set<string>();
    for (const id of intersection) if (perWord[i].has(id)) next.add(id);
    intersection = next;
  }

  const all = Array.from(intersection);
  if (all.length > MAX_MATCHED_IDS) {
    console.warn(
      `[clientSearch] matched ${all.length} entities for "${search}"; truncating to ${MAX_MATCHED_IDS}. ` +
        `Pagination/hasMore will reflect only this subset. Follow-up: dedicated search_clients RPC.`
    );
    return { ids: all.slice(0, MAX_MATCHED_IDS), truncated: true };
  }
  return { ids: all, truncated: false };
}
