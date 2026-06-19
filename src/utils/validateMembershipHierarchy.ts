import { supabase } from "@/integrations/supabase/client";

/**
 * Role priority map — higher number = higher privilege.
 * A user should NEVER be assigned a role in a child org that is
 * lower than the role they already hold in a parent org.
 */
const ROLE_PRIORITY: Record<string, number> = {
  org_viewer: 0,
  org_editor: 1,
  org_admin: 2,
  super_admin: 3,
  system_admin: 4,
};

interface ValidationResult {
  allowed: boolean;
  /** Human-readable reason when blocked */
  reason?: string;
  /** The higher role code found in a parent org */
  parentRoleCode?: string;
  /** The parent org name where the higher role exists */
  parentOrgName?: string;
}

/**
 * Checks whether a membership assignment is valid by verifying that
 * the user does not already hold a higher-priority role in any
 * ancestor organization. If they do, the new (lower) role is redundant
 * and should be blocked.
 *
 * @param userId   - anew_users.id of the target user
 * @param orgId    - the organization where the new role would be assigned
 * @param newRoleId - the role_id being assigned
 */
export async function validateMembershipHierarchy(
  userId: string,
  orgId: string,
  newRoleId: string
): Promise<ValidationResult> {
  try {
    // 1. Resolve the code of the role being assigned
    const { data: newRole } = await supabase
      .from("anew_roles")
      .select("code")
      .eq("id", newRoleId)
      .maybeSingle();

    if (!newRole?.code) {
      // Can't validate — allow by default
      return { allowed: true };
    }

    const newPriority = ROLE_PRIORITY[newRole.code] ?? -1;

    // 2. Walk up the hierarchy from the target org
    let currentOrgId = orgId;
    for (let depth = 0; depth < 10; depth++) {
      const { data: parentLink } = await (supabase as any)
        .from("anew_hierarchy")
        .select("parent_org_id")
        .eq("child_org_id", currentOrgId)
        .maybeSingle();

      if (!parentLink?.parent_org_id) break;

      const parentOrgId = parentLink.parent_org_id;

      // Check if the user has a membership in this ancestor org
      const { data: membership } = await supabase
        .from("anew_memberships")
        .select("role_id")
        .eq("user_id", userId)
        .eq("organization_id", parentOrgId)
        .eq("status", "active")
        .maybeSingle();

      if (membership?.role_id) {
        const { data: parentRole } = await supabase
          .from("anew_roles")
          .select("code")
          .eq("id", membership.role_id)
          .maybeSingle();

        const parentPriority = parentRole?.code
          ? (ROLE_PRIORITY[parentRole.code] ?? -1)
          : -1;

        if (parentPriority > newPriority) {
          // Fetch parent org name for a friendlier message
          const { data: parentOrg } = await (supabase as any)
            .from("anew_organizations")
            .select("name")
            .eq("id", parentOrgId)
            .maybeSingle();

          return {
            allowed: false,
            reason: `Este utilizador já possui o cargo "${parentRole?.code}" na organização "${parentOrg?.name || parentOrgId}", que é superior ao cargo que está a tentar atribuir. O acesso é herdado automaticamente.`,
            parentRoleCode: parentRole?.code ?? undefined,
            parentOrgName: parentOrg?.name ?? undefined,
          };
        }
      }

      currentOrgId = parentOrgId;
    }

    return { allowed: true };
  } catch (error) {
    console.error("[validateMembershipHierarchy] Error:", error);
    // On error, allow — don't block the operation
    return { allowed: true };
  }
}
