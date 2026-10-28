// Regras puras do formulário de utilizador: que roles se podem atribuir, que organizações sobram e como se ajusta o âmbito.
import type { Editor } from "./logica";
import type { Ambito, Organizacao, Permissao, Role, Vinculo } from "./tipos";

const NIVEL: Record<Ambito, number> = { NONE: 0, OWNED: 1, TEAM: 2, ORG: 3 };
const PADRAO: Ambito = "OWNED";

/**
 * Regra do ecrã atual: só se atribui uma role cujas permissões todas quem atribui já tem. Um administrador de sistema
 * passa sempre (a verificação do subconjunto é saltada, como em UserFormEnhanced.tsx).
 */
export function podeAtribuirRole(role: Pick<Role, "permissoes">, editor: Editor): boolean {
  if (editor.administradorSistema) return true;
  const dele = new Set(editor.codigos);
  return role.permissoes.every((c) => dele.has(c));
}

/** As roles que o formulário oferece: nunca a de super administrador, e só as que quem edita pode atribuir. */
export const rolesOferecidas = (roles: readonly Role[], editor: Editor): Role[] =>
  roles.filter((r) => r.codigo !== "super_admin" && podeAtribuirRole(r, editor));

/** A organização e as ascendentes (as roles da holding também valem nas empresas dela), da mais próxima para cima. */
function organizacaoEAscendentes(organizacaoId: string, organizacoes: readonly Organizacao[]): Set<string> {
  const ids = new Set<string>();
  let atual: string | undefined = organizacaoId;
  while (atual && !ids.has(atual)) {
    ids.add(atual);
    atual = organizacoes.find((o) => o.id === atual)?.paiId;
  }
  return ids;
}

/**
 * As roles que uma organização oferece (UserFormEnhanced): as dela e as das ascendentes, nunca as eliminadas. Sem organização
 * escolhida não há roles para escolher. As roles de sistema (sem organização) só aparecem se já estiverem atribuídas (ver `rolesDoVinculo`).
 */
export function rolesDaOrganizacao(roles: readonly Role[], organizacaoId: string, organizacoes: readonly Organizacao[]): Role[] {
  if (!organizacaoId) return [];
  const ids = organizacaoEAscendentes(organizacaoId, organizacoes);
  return roles.filter((r) => !r.eliminada && !!r.organizacaoId && ids.has(r.organizacaoId));
}

/** As roles de um vínculo: as que a organização oferece e quem edita pode atribuir, mais a que o vínculo já tem (que nunca fica em branco). */
export function rolesDoVinculo(
  roles: readonly Role[], vinculo: Pick<Vinculo, "organizacaoId" | "roleId">, organizacoes: readonly Organizacao[], editor: Editor,
): Role[] {
  const oferecidas = rolesOferecidas(rolesDaOrganizacao(roles, vinculo.organizacaoId, organizacoes), editor);
  const atual = roles.find((r) => r.id === vinculo.roleId);
  return atual && !oferecidas.some((r) => r.id === atual.id) ? [atual, ...oferecidas] : oferecidas;
}

/** As organizações que ainda se podem escolher nesta linha: as livres mais a que a própria linha já tem. */
export function organizacoesLivres(
  organizacoes: readonly Organizacao[], vinculos: readonly Pick<Vinculo, "organizacaoId">[], indice: number,
): Organizacao[] {
  const usadas = new Set(vinculos.filter((_, i) => i !== indice).map((v) => v.organizacaoId).filter(Boolean));
  return organizacoes.filter((o) => !usadas.has(o.id));
}

/** Há alguma organização por ligar? (o botão de acrescentar vínculo desliga-se quando não há.) */
export const haOrganizacaoLivre = (organizacoes: readonly Organizacao[], vinculos: readonly Pick<Vinculo, "organizacaoId">[]): boolean =>
  organizacoes.some((o) => !vinculos.some((v) => v.organizacaoId === o.id));

/** As permissões com âmbito configurável que a role dá (as que se mostram por vínculo). */
export const permissoesComAmbito = (role: Pick<Role, "permissoes"> | undefined, catalogo: readonly Permissao[]): Permissao[] =>
  catalogo.filter((p) => p.comAmbito && role?.permissoes.includes(p.codigo));

/**
 * Muda o âmbito de uma permissão com a regra de MembershipScopesDialog: subir uma que não é "ver" sobe a de ver do módulo
 * até esse nível; baixar a de ver limita as outras do módulo a esse nível. O que não está no registo é OWNED.
 */
export function ajustarAmbito(
  ambitos: Readonly<Record<string, Ambito>>, codigo: string, nivel: Ambito, doVinculo: readonly Permissao[],
): Record<string, Ambito> {
  const resultado: Record<string, Ambito> = { ...ambitos, [codigo]: nivel };
  const modulo = codigo.split(".")[0];
  const ver = `${modulo}.view`;
  const atual = (c: string): Ambito => resultado[c] ?? PADRAO;
  if (codigo !== ver && NIVEL[nivel] > 0 && doVinculo.some((p) => p.codigo === ver) && NIVEL[nivel] > NIVEL[atual(ver)]) {
    resultado[ver] = nivel;
  }
  if (codigo === ver) {
    doVinculo
      .filter((p) => p.codigo.split(".")[0] === modulo && p.codigo !== ver && NIVEL[atual(p.codigo)] > NIVEL[nivel])
      .forEach((p) => { resultado[p.codigo] = nivel; });
  }
  return resultado;
}

/** O âmbito a mostrar de uma permissão: o escolhido, ou OWNED por omissão. */
export const ambitoAtual = (ambitos: Readonly<Record<string, Ambito>>, codigo: string): Ambito => ambitos[codigo] ?? PADRAO;
