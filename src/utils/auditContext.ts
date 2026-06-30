import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Wraps a Supabase mutation in an audit context.
 *
 * Sets the audit context (user_id + source) before calling fn, and always
 * clears it in the finally block — even if fn throws — so the context is
 * never left dangling on the connection.
 *
 * NOTE: set_audit_context() accepts (p_user_id uuid, p_source text) only.
 * There is no p_org_id parameter. Organization scope is resolved on the DB
 * side by each audit trigger function (fn_audit_products, fn_audit_product_*,
 * etc.) via a JOIN on the affected table's organization_id or product_id →
 * products.organization_id. No org_id needs to be passed from the frontend.
 * See: supabase/migrations/20260625010000_entity_audit_log.sql §2.
 */
export async function withAuditContext<T>(
  supabase: SupabaseClient,
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  const { error: setCtxError } = await supabase.rpc('set_audit_context', { p_user_id: userId, p_source: 'web_app' });
  // set_audit_context failure must throw: mutations must NOT proceed without audit context.
  // This is the opposite contract to clear_audit_context (which is suppressed in finally).
  if (setCtxError) throw setCtxError;
  try {
    return await fn();
  } finally {
    try {
      await supabase.rpc('clear_audit_context');
    } catch {
      // Swallow: clear_audit_context failure must never mask the original error.
      // set_audit_context uses SET LOCAL so the GUC is transaction-scoped and
      // cleared automatically at transaction end regardless.
    }
  }
}
