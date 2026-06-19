/**
 * Frontend mirror of supabase/functions/_shared/composeDisplayName.ts
 *
 * Use ONLY when persisting display_name into anew_entities. Pure-visual name
 * composition should keep its existing logic.
 */

export function composeDisplayName(first?: string | null, last?: string | null): string {
  const f = (first || "").trim().replace(/\s+/g, " ");
  const l = (last || "").trim().replace(/\s+/g, " ");
  if (!f) return l;
  if (!l) return f;
  if (f.toLowerCase() === l.toLowerCase()) return f;
  if (l.toLowerCase().startsWith(f.toLowerCase() + " ")) return l;
  if (f.toLowerCase().endsWith(" " + l.toLowerCase())) return f;
  return `${f} ${l}`;
}

export function normalizeFirstLast(
  first?: string | null,
  last?: string | null,
): { first: string | null; last: string | null } {
  const f = (first || "").trim().replace(/\s+/g, " ");
  const l = (last || "").trim().replace(/\s+/g, " ");
  if (f && l && f.toLowerCase() === l.toLowerCase() && f.includes(" ")) {
    const parts = f.split(" ");
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }
  return { first: f || null, last: l || null };
}
