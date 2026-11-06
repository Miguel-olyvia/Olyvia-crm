// Edição da matriz de permissões de uma role (puro e imutável). Regras copiadas de Roles.tsx: uma permissão que não é "ver"
// só se concede se a de ver do mesmo módulo estiver concedida; tirar "ver" tira as restantes desse módulo.
import type { Permissao } from "./tipos";

/** O módulo de uma permissão: o que vem antes do ponto do código (leads.edit -> leads). */
export const moduloDe = (codigo: string): string => codigo.split(".")[0];
const ehVer = (codigo: string): boolean => codigo.endsWith(".view");
const codigoVer = (codigo: string): string => `${moduloDe(codigo)}.view`;
/** A permissão de ver do MÓDULO (leads.view), a única de que as outras dependem; hr.pessoas.saude.view não o é. */
export const ehVerDoModulo = (codigo: string): boolean => codigo === codigoVer(codigo);
/**
 * 06/11: permissões que o editor mostra na linha «Negócio» (Fases do negócio), onde não há coluna Ver, e que o servidor não faz
 * depender do ver do módulo: os custos no Negócio vêm por fn_cat_pode(org, 'quotes.view_costs') e anular o contrato no Negócio
 * pergunta só client_contracts.cancel. Não ficam bloqueadas sem quotes.view / client_contracts.view, nem saem quando se tiram.
 */
export const SEM_DEPENDENCIA_DE_VER: ReadonlySet<string> = new Set(["quotes.view_costs", "client_contracts.cancel"]);
const arrastadaPeloVer = (c: string, modulo: string): boolean => moduloDe(c) === modulo && !SEM_DEPENDENCIA_DE_VER.has(c);

/** Uma permissão que não é "ver" fica bloqueada enquanto a de ver do módulo (se existir no catálogo) não estiver concedida. */
export function podeAlterar(codigo: string, concedidas: readonly string[], catalogo: readonly Permissao[]): boolean {
  if (ehVer(codigo)) return true;
  if (SEM_DEPENDENCIA_DE_VER.has(codigo)) return true;
  const ver = codigoVer(codigo);
  if (!catalogo.some((p) => p.codigo === ver)) return true;
  return concedidas.includes(ver) || concedidas.includes(codigo);
}

/**
 * Concede ou tira uma permissão. Tirar o "ver" do módulo (leads.view) tira também as outras do módulo. Uma bloqueada não muda.
 * 03/11: só o ver DO MÓDULO arrasta as outras (é o único de que podeAlterar as faz depender); antes, tirar hr.pessoas.saude.view
 * tirava todas as hr.*, sem que nenhuma delas dependesse dele.
 */
export function alternarPermissao(
  concedidas: readonly string[], codigo: string, catalogo: readonly Permissao[],
): string[] {
  if (!podeAlterar(codigo, concedidas, catalogo)) return [...concedidas];
  if (!concedidas.includes(codigo)) return [...concedidas, codigo];
  const modulo = moduloDe(codigo);
  return concedidas.filter((c) => c !== codigo && !(ehVerDoModulo(codigo) && arrastadaPeloVer(c, modulo)));
}

/**
 * Marca ou desmarca um conjunto qualquer (uma linha ou uma coluna da grelha), com as MESMAS regras de alternarPermissao:
 * - marcar concede as do conjunto que se podem conceder; o "ver" do módulo que vier no próprio conjunto conta (marcar a linha
 *   Leads concede leads.view e, com ele, as restantes); as que continuam bloqueadas (sem o ver do módulo) ficam por marcar;
 * - desmarcar tira as do conjunto e, se tirar o ver do módulo, também as outras desse módulo.
 */
export function definirConjunto(
  concedidas: readonly string[], conjunto: readonly Permissao[], marcar: boolean, catalogo: readonly Permissao[],
): string[] {
  const codigos = conjunto.map((p) => p.codigo);
  if (marcar) {
    const tem = new Set(concedidas);
    const comVer = [...concedidas, ...codigos.filter(ehVerDoModulo)];
    const novas = codigos.filter((c) => !tem.has(c) && podeAlterar(c, comVer, catalogo));
    return [...concedidas, ...new Set(novas)];
  }
  const tirar = new Set(codigos);
  const modulosSemVer = new Set(codigos.filter((c) => ehVerDoModulo(c) && concedidas.includes(c)).map(moduloDe));
  return concedidas.filter((c) => !tirar.has(c) && !(modulosSemVer.has(moduloDe(c)) && arrastadaPeloVer(c, moduloDe(c))));
}

/** Marca tudo ou limpa tudo num conjunto de permissões (um módulo do menu), sem tocar nas restantes. */
export function definirModulo(concedidas: readonly string[], doModulo: readonly Permissao[], marcar: boolean): string[] {
  const codigos = new Set(doModulo.map((p) => p.codigo));
  const resto = concedidas.filter((c) => !codigos.has(c));
  return marcar ? [...resto, ...doModulo.map((p) => p.codigo)] : resto;
}

/** Quantas das permissões da lista estão concedidas. */
export const contarConcedidas = (concedidas: readonly string[], lista: readonly Permissao[]): number => {
  const tem = new Set(concedidas);
  return lista.filter((p) => tem.has(p.codigo)).length;
};

/** As perigosas que passariam a estar concedidas se se concedesse `alvo` (as já concedidas não contam). */
export function perigosasNovas(concedidas: readonly string[], alvo: readonly Permissao[]): Permissao[] {
  const tem = new Set(concedidas);
  return alvo.filter((p) => p.perigosa && !tem.has(p.codigo));
}

/**
 * O que se guarda: as permissões editadas MAIS as que a role já tinha e quem edita não vê (não se perdem em silêncio).
 * Um editor que só vê parte do catálogo não pode apagar o que não vê.
 */
export function fundirPermissoes(
  originais: readonly string[], editadas: readonly string[], visiveis: readonly Permissao[],
): string[] {
  const vistas = new Set(visiveis.map((p) => p.codigo));
  const ocultas = originais.filter((c) => !vistas.has(c));
  return [...new Set([...ocultas, ...editadas.filter((c) => vistas.has(c))])];
}
