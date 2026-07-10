import { supabase } from "@/integrations/supabase/client";

const MAX_MATCHED_IDS = 1000;
const NAME_MATCH_LIMIT = 200;
const NIF_SEARCH_LIMIT = 200;

interface SearchEntitiesResponse {
  success: boolean;
  data?: { fiscal_entity_ids: string[] };
  error?: string;
}

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function sanitizeWord(raw: string): string {
  return escapeIlike(raw.trim().toLowerCase())
    .replace(/[,()*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves `entity_id`s whose NIF matches `term`, via the `search-entities`
 * Edge Function (tokenized/encrypted NIF search — never exposes plaintext
 * NIF/hash to the client, unlike the legacy `fe.nif ILIKE` path it replaces).
 *
 * The Edge Function already restricts its `fiscal_entity_ids` response to
 * entities visible to the caller (see search-entities/handler.ts), so mapping
 * fiscal_entity_id -> entity_id via `anew_entity_fiscal_entities` here is a
 * pure join: RLS on that table (`is_entity_in_user_scope`) re-enforces the
 * same visibility rule, it does not relax it.
 */
export async function searchEntityIdsByNif(term: string, limit = NIF_SEARCH_LIMIT): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke<SearchEntitiesResponse>("search-entities", {
      body: { term, limit },
    });

    if (error || !data?.success) {
      if (error) console.error("[clientSearch] search-entities error:", error);
      return [];
    }

    const fiscalEntityIds = data.data?.fiscal_entity_ids ?? [];
    if (fiscalEntityIds.length === 0) return [];

    const { data: links, error: linkError } = await supabase
      .from("anew_entity_fiscal_entities")
      .select("entity_id")
      .in("fiscal_entity_id", fiscalEntityIds);

    if (linkError) {
      console.error("[clientSearch] anew_entity_fiscal_entities lookup error:", linkError);
      return [];
    }

    return Array.from(
      new Set((links || []).map((row: { entity_id: string | null }) => row.entity_id).filter(Boolean) as string[]),
    );
  } catch (err) {
    console.error("[clientSearch] search-entities invocation failed:", err);
    return [];
  }
}

async function entityIdsByNameEmailPhone(word: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const like = `%${word}%`;

  const [nameMatches, emailMatches, phoneMatches] = await Promise.all([
    supabase
      .from("anew_entities")
      .select("id")
      .or(`display_name.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`)
      .limit(NAME_MATCH_LIMIT),
    supabase.from("anew_entity_emails").select("entity_id").ilike("email", like).limit(NAME_MATCH_LIMIT),
    supabase.from("anew_entity_phones").select("entity_id").ilike("phone_number", like).limit(NAME_MATCH_LIMIT),
  ]);

  (nameMatches.data || []).forEach((r: { id: string }) => ids.add(r.id));
  (emailMatches.data || []).forEach((r: { entity_id: string | null }) => {
    if (r.entity_id) ids.add(r.entity_id);
  });
  (phoneMatches.data || []).forEach((r: { entity_id: string | null }) => {
    if (r.entity_id) ids.add(r.entity_id);
  });

  return ids;
}

async function entityIdsForWord(word: string): Promise<Set<string>> {
  const [nameEmailPhoneIds, nifEntityIds] = await Promise.all([
    entityIdsByNameEmailPhone(word),
    searchEntityIdsByNif(word),
  ]);
  return new Set<string>([...nameEmailPhoneIds, ...nifEntityIds]);
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
