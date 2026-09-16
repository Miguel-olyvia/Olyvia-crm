/**
 * Shared helper: checks if a notification type is enabled for an organization.
 *
 * Uses `alert_settings` with `kind = 'notification'`.
 * If no row exists for a given type, falls back to a code-level default:
 *   - `client_viewed_*` → inactive by default
 *   - everything else   → active by default
 *
 * IMPORTANT (opt-out, not opt-in): a type does NOT need a row in
 * `alert_settings` to fire. No row => the code default applies, which for every
 * type outside `INACTIVE_BY_DEFAULT` is "enabled". So a brand-new notification
 * type works in every organization with no migration and no seeded rows; a row
 * only ever appears once someone toggles it in the settings screen.
 */

const INACTIVE_BY_DEFAULT = [
  "client_viewed_proposal",
  "client_viewed_quote",
  "client_viewed_contract",
];

/**
 * Portal action notification types, for call sites that would otherwise repeat
 * the raw string. Same family and same default (active) as
 * `client_signed_proposal`: none of them is listed in `INACTIVE_BY_DEFAULT`.
 *
 * `client_accepted_direct_sale` is fired when a client accepts a Venda Direta
 * in the portal — the direct-sale counterpart of `client_signed_proposal`.
 */
export const NOTIFY_CLIENT_SIGNED_PROPOSAL = "client_signed_proposal";
export const NOTIFY_CLIENT_ACCEPTED_DIRECT_SALE = "client_accepted_direct_sale";

export async function isNotificationEnabled(
  supabase: any,
  organizationId: string | null | undefined,
  notificationType: string,
): Promise<boolean> {
  // If no org, allow (we can't filter)
  if (!organizationId) return true;

  const { data } = await supabase
    .from("alert_settings")
    .select("is_active")
    .eq("organization_id", organizationId)
    .eq("alert_type", notificationType)
    .eq("kind", "notification")
    .maybeSingle();

  if (data) return data.is_active;

  // No row — use code default
  return !INACTIVE_BY_DEFAULT.includes(notificationType);
}
