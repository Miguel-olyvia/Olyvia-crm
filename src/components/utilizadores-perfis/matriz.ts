// Edição da matriz de permissões de uma role (puro e imutável). Regras copiadas de Roles.tsx: uma permissão que não é "ver"
// só se concede se a de ver do mesmo módulo estiver concedida; tirar "ver" tira as restantes desse módulo.
import type { Permissao } from "./tipos";

/** O módulo de uma permissão: o que vem antes do ponto do código (leads.edit -> leads). */
export const moduloDe = (codigo: string): string => codigo.split(".")[0];
const ehVer = (codigo: string): boolean => codigo.endsWith(".view");
const codigoVer = (codigo: string): string => `${moduloDe(codigo)}.view`;

/** Uma permissão que não é "ver" fica bloqueada enquanto a de ver do módulo (se existir no catálogo) não estiver concedida. */
export function podeAlterar(codigo: string, concedidas: readonly string[], catalogo: readonly Permissao[]): boolean {
  if (ehVer(codigo)) return true;
  const ver = codigoVer(codigo);
  if (!catalogo.some((p) => p.codigo === ver)) return true;
  return concedidas.includes(ver) || concedidas.includes(codigo);
}

/** Concede ou tira uma permissão. Tirar "ver" tira também as outras do módulo. Uma bloqueada não muda. */
export function alternarPermissao(
  concedidas: readonly string[], codigo: string, catalogo: readonly Permissao[],
): string[] {
  if (!podeAlterar(codigo, concedidas, catalogo)) return [...concedidas];
  if (!concedidas.includes(codigo)) return [...concedidas, codigo];
  const modulo = moduloDe(codigo);
  return concedidas.filter((c) => c !== codigo && !(ehVer(codigo) && moduloDe(c) === modulo));
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
