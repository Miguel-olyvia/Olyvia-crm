/**
 * Shared Auth Helper for Edge Functions
 *
 * Provides reusable identity resolution and scope validation.
 * Handles both user JWT tokens and internal SERVICE_ROLE calls.
 */

import { withRetry } from "./retry.ts";

export interface CallerIdentity {
  authUid: string;
  anewUserId: string;
  isServiceRole: boolean;
}

/**
 * Resolves the caller's identity from the request Authorization header.
 * 
 * - For SERVICE_ROLE tokens: returns a special marker that bypasses scope checks.
 * - For user JWTs: extracts auth.uid() and resolves the internal anew_users.id.
 * 
 * @throws Error if no valid token or user not found.
 */
export async function resolveCallerIdentity(
  req: Request,
  supabaseAdmin: any
): Promise<CallerIdentity> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AuthError("Authorization header required", 401);
  }

  const token = authHeader.replace("Bearer ", "");

  // Check if this is a SERVICE_ROLE call (internal function-to-function)
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token === serviceRoleKey) {
    return { authUid: "service_role", anewUserId: "service_role", isServiceRole: true };
  }

  // Validate user JWT
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    throw new AuthError("Invalid or expired token", 401);
  }

  // Resolve anew_users.id from auth_user_id
  const { data: anewUser } = await supabaseAdmin
    .from("anew_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!anewUser) {
    throw new AuthError("User profile not found", 403);
  }

  return { authUid: user.id, anewUserId: anewUser.id, isServiceRole: false };
}

/**
 * Validates that the caller has visibility over the given organization.
 *
 * Delegates to the canonical DB function get_user_visible_org_ids(_auth_uid)
 * which handles all cases: direct membership, hierarchy ancestors/descendants,
 * cross-associations, and the system_admin full-access shortcut.
 *
 * SERVICE_ROLE callers always pass (internal calls).
 *
 * @returns true if authorized, false otherwise.
 */
export async function validateOrgScope(
  supabaseAdmin: any,
  caller: CallerIdentity,
  organizationId: string | null | undefined
): Promise<boolean> {
  // Service role bypasses scope checks
  if (caller.isServiceRole) return true;

  // If no organization_id provided, we can't validate scope
  if (!organizationId) return false;

  const { data, error } = await supabaseAdmin.rpc(
    "get_user_visible_org_ids",
    { _auth_uid: caller.authUid }
  );

  if (error) {
    console.error("validateOrgScope: RPC get_user_visible_org_ids failed", error);
    return false;
  }

  // data is an array of UUIDs (SETOF uuid returned as rows by PostgREST)
  const visibleOrgIds: string[] = Array.isArray(data) ? data : [];
  return visibleOrgIds.includes(organizationId);
}

/**
 * Checks whether an anew_user (identified by anewUserId) holds a specific
 * permission code via their active memberships in a given organization.
 *
 * Looks up: anew_memberships → anew_role_permissions
 * Does NOT fall back to system-wide permissions — the organization_id scope
 * is intentional for the portal RBAC gate.
 *
 * anew_memberships has no FK constraints (contype='f' returns zero rows in
 * pg_constraint), so PostgREST cannot resolve an embedded
 * `anew_role_permissions!inner(permission_code)` select — it fails with
 * PGRST200 ("Could not find a relationship..."). Resolved with a decoupled
 * two-step lookup instead, same pattern as create-client-portal-access's
 * hasNonClientRole() and export-data's authorizeExport().
 *
 * @returns true if the user has the permission in the org, false otherwise.
 */
export async function checkUserPermission(
  supabaseAdmin: any,
  anewUserId: string,
  permissionCode: string,
  organizationId?: string
): Promise<boolean> {
  let membershipQuery = supabaseAdmin
    .from("anew_memberships")
    .select("role_id")
    .eq("user_id", anewUserId)
    .eq("status", "active");

  if (organizationId) {
    membershipQuery = membershipQuery.eq("organization_id", organizationId);
  }

  const { data: memberships, error: membershipsError } = await membershipQuery;

  if (membershipsError) {
    console.error("checkUserPermission: memberships query failed", { permissionCode, error: membershipsError });
    return false;
  }

  const roleIds = [...new Set((memberships || []).map((m: any) => m.role_id).filter(Boolean))];
  if (roleIds.length === 0) return false;

  const { data: rolePermissions, error: rolePermissionsError } = await supabaseAdmin
    .from("anew_role_permissions")
    .select("permission_code")
    .in("role_id", roleIds)
    .eq("permission_code", permissionCode)
    .limit(1);

  if (rolePermissionsError) {
    console.error("checkUserPermission: role_permissions query failed", { permissionCode, error: rolePermissionsError });
    return false;
  }

  return Array.isArray(rolePermissions) && rolePermissions.length > 0;
}

/**
 * Checks if the caller has the global system_admin role.
 * Used for maintenance/admin-only endpoints that operate across all tenants
 * with no organization_id filter — super_admin is intentionally excluded
 * because it is a tenant-scoped role, not a global one.
 */
export async function requireAdminRole(
  supabaseAdmin: any,
  caller: CallerIdentity
): Promise<boolean> {
  if (caller.isServiceRole) return true;

  const { data: memberships } = await supabaseAdmin
    .from("anew_memberships")
    .select("role_id")
    .eq("user_id", caller.anewUserId)
    .eq("status", "active");

  if (!memberships || memberships.length === 0) return false;

  const roleIds = memberships.map((m: any) => m.role_id);

  const { data: adminRoles } = await supabaseAdmin
    .from("anew_roles")
    .select("id")
    .in("id", roleIds)
    .eq("code", "system_admin");

  return adminRoles && adminRoles.length > 0;
}

/**
 * Validates that a SERVICE_ROLE key is being used (for CRON/internal functions).
 */
export function requireServiceRole(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

/**
 * Custom error class for auth failures with HTTP status codes.
 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Helper to create a standardized error response from AuthError.
 */
export function authErrorResponse(error: unknown, corsHeaders: Record<string, string>): Response {
  if (error instanceof AuthError) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: error.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
  throw error; // Re-throw non-auth errors
}
