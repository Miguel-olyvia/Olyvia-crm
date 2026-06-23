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
 * Validates that the caller has an active membership in the given organization.
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

  const { data: membership } = await supabaseAdmin
    .from("anew_memberships")
    .select("id")
    .eq("user_id", caller.anewUserId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (membership) return true;

  // Check if user has access via hierarchy (parent org membership gives access to child orgs)
  const { data: userMemberships } = await supabaseAdmin
    .from("anew_memberships")
    .select("organization_id")
    .eq("user_id", caller.anewUserId)
    .eq("status", "active");

  if (!userMemberships || userMemberships.length === 0) return false;

  const userOrgIds = userMemberships.map((m: any) => m.organization_id);

  // Check if organizationId is a descendant of any of the user's orgs
  const { data: hierarchyMatch } = await supabaseAdmin
    .from("anew_hierarchy")
    .select("id")
    .eq("child_org_id", organizationId)
    .in("parent_org_id", userOrgIds)
    .maybeSingle();

  return !!hierarchyMatch;
}

/**
 * Checks if the caller has an admin role (system_admin or super_admin).
 * Used for maintenance/admin-only endpoints.
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
    .in("code", ["system_admin", "super_admin"]);

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
