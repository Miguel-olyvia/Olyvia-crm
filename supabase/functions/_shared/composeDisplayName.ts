/**
 * Shared name composition helpers for entity intake.
 *
 * Defends against integrations (META Lead Ads, webhooks) that send the full
 * name in BOTH first_name and last_name, which would otherwise produce
 * display_name = "FIRST LAST FIRST LAST".
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
