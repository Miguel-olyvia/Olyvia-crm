// 18/11/2026: o porquê de faltar permissão (PERMWHY do mockup), com o que FALTA de facto.
// - «todas de» (requireAll): só as que faltam, ligadas com «e» → «Sem permissão: falta A e B. Peça acesso a um administrador.»
// - «qualquer de»: as alternativas, ligadas com «ou» → «Sem permissão: requer A ou B. Peça acesso a um administrador.»
// Cada permissão aparece pelo nome legível com o código entre parênteses («Editar inventário (inventory.edit)»); sem nome
// conhecido, só o código. Os nomes vêm do catálogo estático do editor de perfis (permissoesExemplo.ts), sem ir à base.
// Puro (sem React): RowActions > usePermissionGate, FrotaShell e os botões que calculam a permissão à mão usam-no.
import { PERMISSOES } from "@/components/utilizadores-perfis/permissoesExemplo";

type PermissionList = string | readonly string[];

const NOMES: ReadonlyMap<string, string> = new Map(PERMISSOES.map((p) => [p.codigo, p.nome]));

/** «Editar inventário (inventory.edit)»; sem nome conhecido, o código. */
export const permissionLabel = (code: string): string => {
  const nome = NOMES.get(code);
  return nome ? `${nome} (${code})` : code;
};

/** «A», «A e B», «A, B e C» (o mesmo com «ou»). */
const juntar = (itens: readonly string[], conjuncao: "e" | "ou"): string =>
  itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} ${conjuncao} ${itens[itens.length - 1]}`;

const SUFIXO = "Peça acesso a um administrador.";

/** «Sem permissão: requer A ou B…» — as alternativas (basta uma). */
export const permissionReason = (perms: readonly string[]): string =>
  `Sem permissão: requer ${juntar(perms.map(permissionLabel), "ou")}. ${SUFIXO}`;

/**
 * O motivo de não se poder fazer a ação, ou null se se pode. Com `requireAll` diz só as que faltam (ligadas com «e»); sem ele
 * (basta uma) diz as alternativas, ligadas com «ou».
 */
export function missingPermissionsReason(
  perms: PermissionList,
  requireAll: boolean | undefined,
  hasPermission: (code: string) => boolean,
): string | null {
  const list = typeof perms === "string" ? [perms] : [...perms];
  if (list.length === 0) return null;
  if (requireAll) {
    const faltam = list.filter((p) => !hasPermission(p));
    return faltam.length === 0 ? null : `Sem permissão: falta ${juntar(faltam.map(permissionLabel), "e")}. ${SUFIXO}`;
  }
  return list.some((p) => hasPermission(p)) ? null : permissionReason(list);
}
