/**
 * Shared helper: checks if a notification type is enabled for an organization.
 *
 * Uses `alert_settings` with `kind = 'notification'`.
 * If no row exists for a given type, falls back to a code-level default:
 *   - `client_viewed_*` → inactive by default
 *   - everything else   → active by default
 */

const INACTIVE_BY_DEFAULT = [
  "client_viewed_proposal",
  "client_viewed_quote",
  "client_viewed_contract",
];

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
