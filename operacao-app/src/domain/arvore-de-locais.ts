/**
 * A árvore de sítios, em funções puras.
 *
 * Isto existe porque a ficha de um sítio passou a ser **uma só página**. Quem
 * a usou disse o que havia a dizer: "não faz sentido cada sítio e cada espaço
 * ter a sua página". Tinha razão — para meter um extintor na box 12 da
 * garagem eram três cliques e três carregamentos de página, e no fim
 * ninguém sabia onde estava.
 *
 * Agora abre-se a morada e vê-se tudo: os pisos, os espaços dentro deles, e
 * os equipamentos de cada um. Para isso é preciso saber, a partir de uma lista
 * plana, qual é a raiz e o que pende dela.
 *
 * Puro de propósito: ordena-se, corta-se e testa-se sem base de dados. Todas
 * as funções aguentam dados errados — um pai que não existe, ou um ciclo — sem
 * pendurar o ecrã. Numa árvore que qualquer pessoa edita, isso acontece.
 */

/** O mínimo para pertencer a uma árvore. */
export interface ComPai {
  id: string;
  parent_id: string | null;
}

/** Um nó com os filhos já pendurados. */
export type ComFilhos<T> = T & { filhos: ComFilhos<T>[] };

/**
 * O sítio no topo — a morada de que este espaço faz parte.
 *
 * É a página que se abre. Um espaço nunca tem página própria: tem um degrau
 * dentro da página da morada dele.
 */
export function raizDe<T extends ComPai>(todos: readonly T[], id: string): T | null {
  const porId = new Map(todos.map((l) => [l.id, l]));
  const vistos = new Set<string>();

  let atual = porId.get(id);
  if (!atual) return null;

  while (atual.parent_id && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    const pai = porId.get(atual.parent_id);
    // Um pai que não está na lista (apagado, ou de outra empresa) faz de
    // conta que não existe: o filho passa a ser a raiz, em vez de nada.
    if (!pai) break;
    atual = pai;
  }
  return atual;
}

/**
 * Este sítio e tudo o que pende dele, em largura.
 *
 * Serve para ir buscar os equipamentos de uma vez só: sete idas à base para
 * uma torre de sete pisos montavam o ecrã aos bocados à frente de quem olha.
 */
export function comTudoLaDentro<T extends ComPai>(
  todos: readonly T[],
  raizId: string
): T[] {
  const porPai = new Map<string, T[]>();
  for (const l of todos) {
    if (!l.parent_id) continue;
    const irmaos = porPai.get(l.parent_id);
    if (irmaos) irmaos.push(l);
    else porPai.set(l.parent_id, [l]);
  }

  const raiz = todos.find((l) => l.id === raizId);
  if (!raiz) return [];

  const saida: T[] = [];
  const vistos = new Set<string>();
  const fila: T[] = [raiz];

  while (fila.length > 0) {
    const atual = fila.shift() as T;
    if (vistos.has(atual.id)) continue;
    vistos.add(atual.id);
    saida.push(atual);
    for (const f of porPai.get(atual.id) ?? []) fila.push(f);
  }
  return saida;
}

/**
 * A árvore a partir de uma raiz, com os filhos por ordem alfabética.
 *
 * A ordem é a do `ordenarPor` que se der — quase sempre o nome. Sem isso a
 * lista muda de ordem entre visitas, e uma lista que salta é uma lista que
 * ninguém confia.
 */
export function arvoreDe<T extends ComPai>(
  todos: readonly T[],
  raizId: string,
  ordenarPor: (a: T, b: T) => number = () => 0
): ComFilhos<T> | null {
  const dentro = comTudoLaDentro(todos, raizId);
  if (dentro.length === 0) return null;

  const nos = new Map<string, ComFilhos<T>>(
    dentro.map((l) => [l.id, { ...l, filhos: [] } as ComFilhos<T>])
  );

  for (const l of dentro) {
    if (l.id === raizId) continue;
    const pai = l.parent_id ? nos.get(l.parent_id) : null;
    const eu = nos.get(l.id);
    if (pai && eu) pai.filhos.push(eu);
  }

  for (const n of nos.values()) n.filhos.sort(ordenarPor);
  return nos.get(raizId) ?? null;
}

/**
 * Os ids desde a raiz até um nó, sem o próprio.
 *
 * É o que se abre quando alguém chega por um link direto a um espaço lá no
 * fundo: a árvore abre-se até lá em vez de o esconder.
 */
export function ramoAte<T extends ComPai>(todos: readonly T[], id: string): string[] {
  const porId = new Map(todos.map((l) => [l.id, l]));
  const ramo: string[] = [];
  const vistos = new Set<string>();

  let atual = porId.get(id);
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    if (atual.id !== id) ramo.unshift(atual.id);
    atual = atual.parent_id ? porId.get(atual.parent_id) : undefined;
  }
  return ramo;
}
