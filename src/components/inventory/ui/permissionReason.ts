// 18/11/2026: o porquê de faltar permissão (PERMWHY do mockup), com o que FALTA de facto.
// - «todas de» (requireAll): só as que faltam, ligadas com «e» → «Sem permissão: falta A e B. Peça acesso a um administrador.»
// - «qualquer de»: as alternativas, ligadas com «ou» → «Sem permissão: requer A ou B. Peça acesso a um administrador.»
// Cada permissão aparece pelo nome legível com o código entre parênteses («Editar inventário (inventory.edit)»); sem nome
// conhecido, só o código. O nome vem primeiro da base (anew_permissions.name, o mesmo do servidor/fn_permissoes_rotulo),
// registado pelo PermissionsProvider com registerPermissionNames quando o catálogo chega; antes disso (ou se a leitura falhar),
// do catálogo estático do editor de perfis (permissoesExemplo.ts); sem nenhum, só o código.
// Sem React nem Supabase: RowActions > usePermissionGate, FrotaShell e os botões que calculam a permissão à mão usam-no.
import { PERMISSOES } from "@/components/utilizadores-perfis/permissoesExemplo";

type PermissionList = string | readonly string[];

const NOMES_ESTATICOS: ReadonlyMap<string, string> = new Map(PERMISSOES.map((p) => [p.codigo, p.nome]));

/** Nomes da base (anew_permissions). Substituído por inteiro a cada registo; vazio até o catálogo chegar. */
let nomesDaBase: ReadonlyMap<string, string> = new Map();

/**
 * Regista os nomes do catálogo da base (anew_permissions: code, name). Substitui os anteriores (o catálogo vem sempre inteiro);
 * nomes vazios ficam de fora (cai no estático). `registerPermissionNames([])` volta só ao estático.
 */
export function registerPermissionNames(rows: readonly { code: string; name: string | null }[]): void {
  const mapa = new Map<string, string>();
  for (const r of rows) {
    const nome = r.name?.trim();
    if (r.code && nome) mapa.set(r.code, nome);
  }
  nomesDaBase = mapa;
}

/** «Editar registos de inventário (inventory.edit)»: nome da base, senão o estático; sem nenhum, o código. */
export const permissionLabel = (code: string): string => {
  const nome = nomesDaBase.get(code) ?? NOMES_ESTATICOS.get(code);
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
