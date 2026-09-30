/**
 * Strict membership check for billing-relevant actions.
 *
 * `validateOrgScope` (auth.ts) accepts every organization the user can merely
 * SEE (hierarchy / cross-association). That is right for reading data, but
 * wrong for spending an organization's AI credits: a visible organization may
 * have a different payer. This helper returns true ONLY when the user holds an
 * ACTIVE `anew_memberships` row for exactly that organization — no hierarchy,
 * no association. Call it right after `validateOrgScope` and BEFORE any credit
 * charge. Fails closed on any error.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClientLike = any;

export async function requireActiveMembership(
  supabaseAdminClient: SupabaseClientLike,
  anewUserId: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<boolean> {
  if (!anewUserId || !organizationId) return false;
  try {
    const { data, error } = await supabaseAdminClient
      .from("anew_memberships")
      .select("id")
      .eq("user_id", anewUserId)
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(1);
    if (error) {
      console.error("[orgMembership] membership lookup failed:", error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.error("[orgMembership] membership lookup threw:", e);
    return false;
  }
}
