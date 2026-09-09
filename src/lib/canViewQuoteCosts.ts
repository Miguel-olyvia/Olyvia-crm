/**
 * Whether the current user is allowed to see cost/margin figures for quotes.
 *
 * A proposal carries its originating quote's lines (see ProposalDetailsDialog),
 * so this gate has to be identical wherever cost/margin data can surface —
 * Quotes and Proposals today — otherwise the Quotes-side restriction is
 * trivially bypassed by opening the same data through a proposal instead.
 *
 * "quotes.view_costs" is not a real permission code granted to any role in
 * production (phantom permission, unreachable by any real role). "quotes.manage"
 * is the real DB write gate for the quotes domain and is already used elsewhere
 * to protect sensitive quote data (see 20260627050000_quotes_security_fixes.sql),
 * which matches the sensitivity of cost/margin figures here.
 */
export function canViewQuoteCosts(
  hasPermission: (permissionCode: string) => boolean,
  isSystemAdmin: boolean,
): boolean {
  return hasPermission("quotes.manage") || isSystemAdmin;
}
