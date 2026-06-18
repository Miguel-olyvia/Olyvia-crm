// Permission helpers — alinhados com src/lib/permissionAliases.ts via port 1:1.
import type { ExecCtx } from "./types.ts";
import { permissionSetHas } from "./permissionAliases.ts";

function permSet(ctx: ExecCtx): Set<string> {
  // Cache na própria ctx para evitar reconstruir a cada can() durante a mesma request.
  const anyCtx = ctx as ExecCtx & { _permSet?: Set<string> };
  if (!anyCtx._permSet) anyCtx._permSet = new Set(ctx.permissions);
  return anyCtx._permSet;
}

export function can(ctx: ExecCtx, permissionCode: string): boolean {
  if (ctx.isSystemAdmin) return true;
  return permissionSetHas(permSet(ctx), permissionCode);
}

export type ForbiddenResult = {
  success: false;
  code: "forbidden";
  missing_permission: string;
  message: string;
};

export function requirePermission(
  ctx: ExecCtx,
  permissionCode: string,
  action: string,
): ForbiddenResult | null {
  if (can(ctx, permissionCode)) return null;
  return {
    success: false,
    code: "forbidden",
    missing_permission: permissionCode,
    message: `Não tens permissão para ${action} (falta: ${permissionCode}).`,
  };
}

/**
 * requireActionPermission — modelo único para autorização de tools de escrita.
 *
 * Modos:
 *  - "edit-strict": só passa se `can(basePermission)`. Sem herança. Usar para
 *    alterações a registos existentes que não sejam sub-acções populadoras do user.
 *  - "terminal": semântica idêntica a edit-strict; nome dedicado para acções
 *    irreversíveis/de saída (send, accept, reject, close, delete) que NUNCA herdam.
 *  - "populate": sub-acção populadora. Passa se `can(basePermission)` OU
 *    (`can(inheritFrom)` E `record.created_by === ctx.businessUserId` E
 *    `mutableStatuses.includes(record.status)`). Sem `record`/`inheritFrom`,
 *    degrada para edit-strict (falha-fechado).
 *
 * Erro normalizado: `{ success:false, code:"forbidden", missing_permission, message }`.
 */
export type ActionMode = "edit-strict" | "terminal" | "populate";

export type ActionRecord = {
  created_by: string | null | undefined;
  status: string | null | undefined;
};

export type RequireActionOpts = {
  action: string;
  mode: ActionMode;
  basePermission: string;
  inheritFrom?: string;
  record?: ActionRecord;
  mutableStatuses?: readonly string[];
};

export function requireActionPermission(
  ctx: ExecCtx,
  opts: RequireActionOpts,
): ForbiddenResult | null {
  if (can(ctx, opts.basePermission)) return null;

  if (opts.mode === "populate" && opts.inheritFrom && opts.record) {
    const ownerOk =
      !!opts.record.created_by &&
      !!ctx.businessUserId &&
      opts.record.created_by === ctx.businessUserId;
    const statusOk =
      !!opts.record.status &&
      (opts.mutableStatuses ?? []).includes(opts.record.status);
    if (ownerOk && statusOk && can(ctx, opts.inheritFrom)) return null;
  }

  return {
    success: false,
    code: "forbidden",
    missing_permission: opts.basePermission,
    message: `Não tens permissão para ${opts.action} (falta: ${opts.basePermission}).`,
  };
}

// Backwards-compatible shim — passa pela expansão de aliases.
export function requireWrite(
  ctx: ExecCtx,
  permissionCode: string,
  message: string,
): { success: false; message: string } | null {
  if (!can(ctx, permissionCode)) {
    return { success: false, message: `Não tens permissão para ${message}.` };
  }
  return null;
}

export function hasRole(ctx: ExecCtx, roleCodes: string[]): boolean {
  return ctx.memberships.some(
    (m) => m.organization_id === ctx.organizationId && m.role_code && roleCodes.includes(m.role_code),
  );
}

export function permissionExists(ctx: ExecCtx, code: string): boolean {
  if (ctx.permissions.includes(code)) return true;
  const modulePrefix = code.split(".")[0] + ".";
  return ctx.permissions.some((p) => p.startsWith(modulePrefix));
}
