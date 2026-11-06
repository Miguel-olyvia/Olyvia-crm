// Edição da matriz de permissões de uma role (puro e imutável). 06/11/2026: as dependências deixaram de ser automáticas («tudo depende
// do Ver do módulo») e passaram a ser declaradas em dependenciasPermissoes.ts (DEPENDE_DE, «qualquer de»). Uma permissão só se marca
// com a de que depende; tirar uma tira em cascata as que dependiam dela (e já não têm outra alternativa marcada).
import { dependenciasDe } from "./dependenciasPermissoes";
import type { Permissao } from "./tipos";

/** O módulo de uma permissão: o que vem antes do ponto do código (leads.edit -> leads). */
export const moduloDe = (codigo: string): string => codigo.split(".")[0];

/**
 * As dependências de `codigo` que quem edita vê (estão no catálogo do editor). Uma dependência fora do catálogo não se pode marcar
 * aqui, por isso não bloqueia (como antes, quando o Ver do módulo não estava no catálogo).
 */
export function dependenciasNoCatalogo(codigo: string, catalogo: readonly Permissao[]): string[] {
  const deps = dependenciasDe(codigo);
  if (deps.length === 0) return [];
  const noCatalogo = new Set(catalogo.map((p) => p.codigo));
  return deps.filter((d) => noCatalogo.has(d));
}

const satisfeita = (deps: readonly string[], tem: ReadonlySet<string>): boolean => deps.length === 0 || deps.some((d) => tem.has(d));

/** Uma permissão fica bloqueada enquanto nenhuma das de que depende (no catálogo) estiver concedida; a já concedida tira-se sempre. */
export function podeAlterar(codigo: string, concedidas: readonly string[], catalogo: readonly Permissao[]): boolean {
  if (concedidas.includes(codigo)) return true;
  return satisfeita(dependenciasNoCatalogo(codigo, catalogo), new Set(concedidas));
}

/** O que falta para se poder marcar `codigo` (as alternativas, «qualquer de»); vazio se não está bloqueada. */
export function emFaltaPara(codigo: string, concedidas: readonly string[], catalogo: readonly Permissao[]): string[] {
  return podeAlterar(codigo, concedidas, catalogo) ? [] : dependenciasNoCatalogo(codigo, catalogo);
}

/**
 * Tira `retirar` e, em cascata, as concedidas que dependiam de alguma delas e ficam sem nenhuma alternativa marcada. Só arrasta
 * dependentes do que se tirou: uma concedida que já estava sem a dependência (papel antigo) não sai por se mexer noutra coisa.
 */
function tirarEmCascata(concedidas: readonly string[], retirar: readonly string[], catalogo: readonly Permissao[]): string[] {
  const saem = new Set(retirar);
  let mudou = true;
  while (mudou) {
    mudou = false;
    const ficam = new Set(concedidas.filter((c) => !saem.has(c)));
    for (const c of ficam) {
      const deps = dependenciasNoCatalogo(c, catalogo);
      if (deps.some((d) => saem.has(d)) && !satisfeita(deps, ficam)) {
        saem.add(c);
        mudou = true;
      }
    }
  }
  return concedidas.filter((c) => !saem.has(c));
}

/** Concede ou tira uma permissão. Tirar arrasta as que dependiam dela (em cascata). Uma bloqueada não muda. */
export function alternarPermissao(
  concedidas: readonly string[], codigo: string, catalogo: readonly Permissao[],
): string[] {
  if (!podeAlterar(codigo, concedidas, catalogo)) return [...concedidas];
  if (!concedidas.includes(codigo)) return [...concedidas, codigo];
  return tirarEmCascata(concedidas, [codigo], catalogo);
}

/**
 * Marca ou desmarca um conjunto qualquer (uma linha ou uma coluna da grelha), com as MESMAS regras de alternarPermissao:
 * - marcar concede as do conjunto que se podem conceder; uma dependência que vier no próprio conjunto conta (o «Tudo» da linha
 *   Leads marca leads.view e, com ele, as restantes; o da linha Ficha marca a ficha e depois as partes). As que continuam bloqueadas
 *   ficam por marcar;
 * - desmarcar tira as do conjunto e, em cascata, as que dependiam delas.
 */
export function definirConjunto(
  concedidas: readonly string[], conjunto: readonly Permissao[], marcar: boolean, catalogo: readonly Permissao[],
): string[] {
  const codigos = conjunto.map((p) => p.codigo);
  if (!marcar) return tirarEmCascata(concedidas, codigos, catalogo);
  const tem = new Set(concedidas);
  // Em voltas, até não mudar: cada volta pode desbloquear as que dependem das marcadas na anterior (a ordem do conjunto não importa).
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const c of codigos) {
      if (!tem.has(c) && satisfeita(dependenciasNoCatalogo(c, catalogo), tem)) {
        tem.add(c);
        mudou = true;
      }
    }
  }
  const novas = codigos.filter((c) => tem.has(c) && !concedidas.includes(c));
  return [...concedidas, ...new Set(novas)];
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
