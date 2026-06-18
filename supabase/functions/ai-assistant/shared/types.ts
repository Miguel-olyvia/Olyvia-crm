// Types shared across the ai-assistant function modules.
// Cut/paste from the previous monolithic index.ts — no behaviour change.

export interface Membership {
  role_id?: string;
  role_code?: string;
  organization_id: string;
}

export interface ExecCtx {
  supabase: any;
  authUid: string;                  // auth.users.id (for notifications)
  businessUserId: string;           // anew_users.id (for created_by / assigned_to)
  organizationId: string | null;
  visibleOrgIds: string[];
  userContext: any;
  permissions: string[];
  memberships: Membership[];
  isSystemAdmin: boolean;
  authHeader: string;               // original Bearer token forwarded to invoked edge functions
}

export type ToolResult = {
  success: boolean;
  message?: string;
  data?: any;
  requires_confirmation?: boolean;
  candidate_entity_id?: string;
  candidate_name?: string | null;
  match_field?: string;
  proposed_payload?: any;
  [k: string]: any;
};

export type Handler = (ctx: ExecCtx, args: any) => Promise<ToolResult>;

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
};
