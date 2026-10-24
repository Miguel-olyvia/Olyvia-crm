// Lógica pura da página "Utilizadores e perfis": filtros, contagens, permissões efetivas, âmbito e proteção.
import { PERMISSOES } from "./permissoesExemplo";
import type { Ambito, FiltrosUtilizadores, Permissao, Role, Utilizador } from "./tipos";

const ORDEM_AMBITO: Ambito[] = ["NONE", "OWNED", "TEAM", "ORG"];
const AMBITO_PADRAO: Ambito = "OWNED";

/** Minúsculas e sem acentos, para a pesquisa não depender deles. */
export const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt").trim();

/** Os utilizadores que passam nos filtros (texto no nome ou email, estado, role e organização num mesmo vínculo). */
export function filtrarUtilizadores(utilizadores: Utilizador[], f: FiltrosUtilizadores): Utilizador[] {
  const texto = normalizar(f.texto);
  return utilizadores.filter((u) => {
    if (f.estado === "ativos" && !u.ativo) return false;
    if (f.estado === "inativos" && u.ativo) return false;
    if (texto && !normalizar(`${u.nome} ${u.email}`).includes(texto)) return false;
    if (!f.roleId && !f.organizacaoId) return true;
    return u.vinculos.some((v) => (!f.roleId || v.roleId === f.roleId) && (!f.organizacaoId || v.organizacaoId === f.organizacaoId));
  });
}

/** Os utilizadores com a role (em qualquer vínculo), sem repetir quem a tem em duas organizações. */
export const utilizadoresDaRole = (utilizadores: Utilizador[], roleId: string): Utilizador[] =>
  utilizadores.filter((u) => u.vinculos.some((v) => v.roleId === roleId));

/** Quantos utilizadores tem cada role (todas as roles aparecem, mesmo com zero). */
export function contarUtilizadoresPorRole(utilizadores: Utilizador[], roles: Role[]): Record<string, number> {
  return Object.fromEntries(roles.map((r) => [r.id, utilizadoresDaRole(utilizadores, r.id).length]));
}

export interface Editor {
  administradorSistema: boolean;
  codigos: string[];
}

/** Só se mostram as permissões que quem edita já tem; um administrador de sistema vê todas (regra de Roles.tsx). */
export function permissoesVisiveis(catalogo: Permissao[], editor: Editor): Permissao[] {
  if (editor.administradorSistema) return catalogo;
  const dele = new Set(editor.codigos);
  return catalogo.filter((p) => dele.has(p.codigo));
}

/** Quantas das permissões visíveis tem cada role. Códigos que a role guarda e que não estão no catálogo não contam. */
export function contarPermissoesPorRole(roles: Role[], visiveis: Permissao[]): Record<string, number> {
  const codigos = new Set(visiveis.map((p) => p.codigo));
  return Object.fromEntries(roles.map((r) => [r.id, r.permissoes.filter((c) => codigos.has(c)).length]));
}

/** Um super administrador não se edita por esta página. */
export const ehProtegido = (u: Utilizador, roles: Role[]): boolean =>
  u.vinculos.some((v) => roles.find((r) => r.id === v.roleId)?.codigo === "super_admin");

/** As roles que se podem atribuir: a de super administrador nunca se dá daqui. */
export const rolesAtribuiveis = (roles: Role[]): Role[] => roles.filter((r) => r.codigo !== "super_admin");

/** As roles de sistema não se eliminam. */
export const podeEliminarRole = (r: Role): boolean => !r.sistema;

export interface PermissaoEfetiva {
  permissao: Permissao;
  /** As roles (de vínculos ativos) de onde a permissão vem. */
  origens: Role[];
}

/** As permissões que o utilizador tem de facto: a união das roles dos vínculos ativos, com a origem de cada uma. */
export function permissoesEfetivas(
  u: Utilizador, roles: Role[], catalogo: Permissao[] = PERMISSOES,
): PermissaoEfetiva[] {
  const ativas = u.vinculos.filter((v) => v.ativo).map((v) => roles.find((r) => r.id === v.roleId));
  const unicas = [...new Map(ativas.flatMap((r) => (r ? [[r.id, r] as const] : []))).values()];
  return catalogo.flatMap((permissao) => {
    const origens = unicas.filter((r) => r.permissoes.includes(permissao.codigo));
    return origens.length > 0 ? [{ permissao, origens }] : [];
  });
}

const maisLargo = (a: Ambito, b: Ambito): Ambito => (ORDEM_AMBITO.indexOf(a) >= ORDEM_AMBITO.indexOf(b) ? a : b);

/** O âmbito de uma permissão: o mais largo entre os vínculos ativos cuja role a dá. `NONE` se o utilizador não a tem. */
export function ambitoDe(u: Utilizador, roles: Role[], codigo: string): Ambito {
  return u.vinculos
    .filter((v) => v.ativo && roles.find((r) => r.id === v.roleId)?.permissoes.includes(codigo))
    .reduce<Ambito>((acc, v) => maisLargo(acc, v.ambitos[codigo] ?? AMBITO_PADRAO), "NONE");
}

/** O âmbito resumido do utilizador: o mais largo entre as suas permissões com âmbito. */
export function resumoAmbito(u: Utilizador, roles: Role[], catalogo: Permissao[] = PERMISSOES): Ambito {
  return catalogo
    .filter((p) => p.comAmbito)
    .reduce<Ambito>((acc, p) => maisLargo(acc, ambitoDe(u, roles, p.codigo)), "NONE");
}

/** O utilizador com as roles escolhidas no ecrã (organização -> role) no lugar das originais; sem mexer no original. */
export function aplicarEscolhas(u: Utilizador, escolhas: Record<string, string>): Utilizador {
  return { ...u, vinculos: u.vinculos.map((v) => ({ ...v, roleId: escolhas[v.organizacaoId] ?? v.roleId })) };
}

/** Dias inteiros entre `iso` e `hoje` (AAAA-MM-DD); `null` se nunca houve acesso. */
export function diasDesde(iso: string | null, hoje: string): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.parse(hoje) - Date.parse(iso)) / 86_400_000));
}

export const haFiltros = (f: FiltrosUtilizadores): boolean =>
  f.texto.trim() !== "" || f.roleId !== "" || f.organizacaoId !== "" || f.estado !== "ativos";
