// Cópia de filterUsersByLeadScope (src/pages/anewLeadsHelpers.ts:94): a lista de comerciais que o âmbito leads.view de quem cria deixa atribuir.
// ORG vê todos; TEAM vê quem cria e a equipa; o resto (OWNED, NONE) vê só quem cria. É código da página de Leads, que deixa de existir.

export type AmbitoLeads = "ORG" | "TEAM" | "OWNED" | "NONE";

/**
 * `equipa` só se lê no ramo TEAM: é global da sessão e nunca pode alargar a visão de OWNED ou NONE.
 */
export function filtrarComerciaisPorAmbito<U extends { id: string }>(
  utilizadores: readonly U[],
  ambito: AmbitoLeads,
  utilizadorId: string | null | undefined,
  equipa: readonly string[] = [],
): U[] {
  if (ambito === "ORG") return [...utilizadores];
  if (ambito === "TEAM") {
    const permitidos = new Set([utilizadorId, ...equipa].filter(Boolean));
    return utilizadores.filter((u) => permitidos.has(u.id));
  }
  return utilizadores.filter((u) => u.id === utilizadorId);
}
