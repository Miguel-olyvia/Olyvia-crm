// O Catálogo na base (26/10/2026): até aqui as mudanças ao Catálogo (preços e dados dos produtos, a árvore, os pacotes, as ligações)
// viviam só na memória do browser e perdiam-se ao recarregar. Agora vão na parte "catalogo" da sincronização, como o Inventário.
// O Catálogo inteiro tem milhares de produtos: grava-se só a DIFERENÇA para o Catálogo de base (catalogo0): os produtos mudados,
// novos ou tirados, pelo id, e as outras partes (árvore, pacotes, ligações…) que estejam diferentes. Funções puras, sem React.
import type { Catalogo, Produto } from "./catalogoModelo";

export interface ParteCatalogo {
  /** Os produtos diferentes da base: o produto (mudado ou novo) ou null (tirado). */
  produtos?: Record<string, Produto | null>;
  /** As outras chaves do Catálogo diferentes da base (null: a chave saiu). */
  resto?: Record<string, unknown>;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A diferença de `K` para a base (vazia: igual à base). */
export function diferencaCatalogo(base: Catalogo, K: Catalogo): ParteCatalogo {
  const out: ParteCatalogo = {};
  const porId = new Map(base.produtos.map((p) => [p.id, p]));
  const prods: Record<string, Produto | null> = {};
  const vistos = new Set<string>();
  for (const p of K.produtos) { vistos.add(p.id); const b = porId.get(p.id); if (!b || !igual(b, p)) prods[p.id] = p; }
  for (const p of base.produtos) if (!vistos.has(p.id)) prods[p.id] = null;
  if (Object.keys(prods).length) out.produtos = prods;
  const resto: Record<string, unknown> = {};
  const B = base as unknown as Record<string, unknown>, C = K as unknown as Record<string, unknown>;
  for (const k of new Set([...Object.keys(B), ...Object.keys(C)])) {
    if (k === "produtos") continue;
    if (!(k in C)) resto[k] = null;
    else if (!igual(B[k], C[k])) resto[k] = C[k];
  }
  if (Object.keys(resto).length) out.resto = resto;
  return out;
}

/** O Catálogo que resulta de aplicar a diferença à base (uma cópia nova; a base não muda). */
export function aplicarDiferenca(base: Catalogo, x: ParteCatalogo | null | undefined): Catalogo {
  const K = structuredClone(base);
  const prods = x?.produtos ?? {};
  if (Object.keys(prods).length) {
    const novos: Produto[] = [];
    const tirar = new Set<string>();
    for (const [id, p] of Object.entries(prods)) {
      if (p == null) { tirar.add(id); continue; }
      const i = K.produtos.findIndex((y) => y.id === id);
      if (i >= 0) K.produtos[i] = structuredClone(p); else novos.push(structuredClone(p));
    }
    K.produtos = [...K.produtos.filter((p) => !tirar.has(p.id)), ...novos];
  }
  const R = K as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(x?.resto ?? {})) {
    if (k === "produtos") continue;
    if (v === null) delete R[k]; else R[k] = structuredClone(v);
  }
  return K;
}
