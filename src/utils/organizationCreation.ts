import { supabase } from "@/integrations/supabase/client";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

const BASE_ROLES = [
  {
    name: "Admin",
    code: "org_admin",
    description_suffix: "Admin com acesso total",
    permissionFilter: () => true,
  },
  {
    name: "Editor",
    code: "org_editor",
    description_suffix: "Editor com permissões de criação e edição",
    permissionFilter: (code: string) => {
      const denied = ["organizations.delete", "users.delete", "roles.delete", "settings.update"];
      return !denied.includes(code);
    },
  },
  {
    name: "Viewer",
    code: "org_viewer",
    description_suffix: "Visualizador com acesso apenas de leitura",
    permissionFilter: (code: string) => code.endsWith(".view") || !code.includes("."),
  },
];

async function ensureBaseRoles(
  organizationId: string,
  organizationName: string,
  creatorBusinessUserId: string,
  allPermissions: { code: string }[]
): Promise<Record<string, string>> {
  const roleIds: Record<string, string> = {};

  for (const roleDef of BASE_ROLES) {
    const { data: existing } = await supabase
      .from("anew_roles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("code", roleDef.code)
      .maybeSingle();

    let roleId: string;
    if (existing) {
      roleId = existing.id;
    } else {
      const { data: newRole, error } = await supabase
        .from("anew_roles")
        .insert({
          name: roleDef.name,
          code: roleDef.code,
          description: `${roleDef.description_suffix} de ${organizationName}`,
          organization_id: organizationId,
          is_system: false,
          is_default: roleDef.code === "org_viewer",
          created_by: creatorBusinessUserId,
        })
        .select()
        .single();

      if (error) throw error;
      roleId = newRole.id;

      const filtered = allPermissions.filter(p => roleDef.permissionFilter(p.code));
      if (filtered.length > 0) {
        await supabase.from("anew_role_permissions").insert(
          filtered.map(p => ({
            role_id: roleId,
            permission_code: p.code,
            created_by: creatorBusinessUserId,
          }))
        );
      }
    }

    roleIds[roleDef.code] = roleId;
  }

  return roleIds;
}

export async function assignCreatorAsOrgAdmin(
  organizationId: string,
  organizationName: string,
  creatorAuthUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: anewUser, error: userError } = await supabase
      .from("anew_users" as any)
      .select("id")
      .eq("auth_user_id", creatorAuthUserId)
      .maybeSingle();

    if (userError) throw userError;
    if (!anewUser) return { success: false, error: "User profile not found" };

    // Canonical business user id for created_by columns (never auth_user_id).
    const creatorBusinessUserId = (anewUser as any).id as string;

    const { data: allPermissions } = await supabase
      .from("anew_permissions")
      .select("code");

    const roleIds = await ensureBaseRoles(organizationId, organizationName, creatorBusinessUserId, allPermissions || []);

    const creatorRoleId = roleIds["org_admin"];

    const { data: existingMembership } = await supabase
      .from("anew_memberships")
      .select("id")
      .eq("user_id", creatorBusinessUserId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (!existingMembership) {
      const { error: membershipError } = await supabase
        .from("anew_memberships")
        .insert({
          user_id: creatorBusinessUserId,
          organization_id: organizationId,
          role_id: creatorRoleId,
          status: "active",
          relationship_type: "MEMBER",
          join_method: "created_org",
          accepted_at: new Date().toISOString(),
          created_by: creatorBusinessUserId,
        });

      if (membershipError) throw membershipError;
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error assigning creator as org admin:", error);
    return { success: false, error: error.message };
  }
}

export async function assignCreatorAsAdminToHierarchy(
  rootOrgId: string,
  rootOrgName: string,
  creatorAuthUserId: string
): Promise<{ success: boolean; error?: string; failedOrgs?: string[] }> {
  try {
    const rootResult = await assignCreatorAsOrgAdmin(rootOrgId, rootOrgName, creatorAuthUserId);
    if (!rootResult.success) return { success: false, error: `Root org failed: ${rootResult.error}` };

    const allChildIds: string[] = [];
    let currentParentIds = [rootOrgId];

    while (currentParentIds.length > 0) {
      const { data: children, error } = await (supabase as any)
        .from("anew_hierarchy")
        .select("child_org_id")
        .in("parent_org_id", currentParentIds);

      if (error) throw error;
      if (!children || children.length === 0) break;

      const childIds = children.map((c: any) => c.child_org_id);
      allChildIds.push(...childIds);
      currentParentIds = childIds;
    }

    if (allChildIds.length === 0) return { success: true };

    const { data: childOrgs, error: orgsError } = await (supabase as any)
      .from("anew_organizations")
      .select("id, name")
      .in("id", allChildIds);

    if (orgsError) throw orgsError;

    const failedOrgs: string[] = [];
    for (const childOrg of (childOrgs || [])) {
      const result = await assignCreatorAsOrgAdmin(childOrg.id, childOrg.name, creatorAuthUserId);
      if (!result.success) failedOrgs.push(childOrg.name);
    }

    return failedOrgs.length > 0
      ? { success: true, error: `Some orgs failed: ${failedOrgs.join(", ")}`, failedOrgs }
      : { success: true };
  } catch (error: any) {
    console.error("Error assigning creator to hierarchy:", error);
    return { success: false, error: error.message };
  }
}
