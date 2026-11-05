/**
 * Whether the current user is allowed to see cost/margin figures for quotes.
 *
 * A proposal carries its originating quote's lines (see ProposalDetailsDialog),
 * so this gate has to be identical wherever cost/margin data can surface —
 * Quotes and Proposals today — otherwise the Quotes-side restriction is
 * trivially bypassed by opening the same data through a proposal instead.
 *
 * 20270109100000: the server is now the gate. The cost columns of quote_lines
 * are no longer readable by `authenticated`; they come from
 * rpc_quote_lines_custos, which returns them only with quotes.view_costs or
 * quotes.manage in the quote's organization (fn_quote_custos_pode — also the
 * Papel no Negócio and system admins). This mirrors it on screen so nobody who
 * receives the costs has them hidden, and nobody without them sees empty cost
 * columns. (quotes.view_costs is a real, granted permission since 05/11 — it
 * is what the Negócio screens use.)
 */
export function canViewQuoteCosts(
  hasPermission: (permissionCode: string) => boolean,
  isSystemAdmin: boolean,
): boolean {
  return hasPermission("quotes.view_costs") || hasPermission("quotes.manage") || isSystemAdmin;
}
