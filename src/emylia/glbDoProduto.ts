// 27/11: o GLB PRÓPRIO que vale para um produto, resolvido com os dados que o Catálogo já lê (as categorias e os Modelos de gestão: glbCatalogoCache.ts), uma leitura por organização
// e nunca um pedido por produto. A ordem é a do contrato do dono (resolverGlbProprio, planta3d/modelos3dEscolha.ts): escolha manual do produto > Modelo (GLB > id) > subcategoria
// (GLB > id) > categoria (GLB > id) > automático. De onde vem cada nível: o Modelo, do `model_id` do produto (`modeloId`); a subcategoria e a categoria, do Modelo se o produto tem um
// (a subcategoria dele é a do produto) e, senão, da árvore do Catálogo pelo nome (resolverCategoria: nunca adivinha, um nome repetido não resolve). A planta e o estúdio de obra não
// usam isto: passam sem GLB próprio, como sempre. Qualquer falha (sem permissão, base sem a migração) é «sem GLB próprio»: o 3D fica como estava.
import { useEffect, useMemo, useState } from "react";
import type { CategoriaGestao, SubcategoriaGestao } from "./categoriasMarcasGestao";
import { lerGlbsDoCatalogo, type LeituraGlbs } from "./glbCatalogoCache";
import { urlDoGlbProprio } from "./modeloGlbDados";
import type { NoCat } from "./planta3d/catalogo3d";
import { escolhaPorId, niveisDoNo, resolverGlbProprio, type NivelModelo, type ResolvidoGlb } from "./planta3d/modelos3dEscolha";
import { resolverCategoria } from "./skuDados";

export interface EntradaGlbProduto {
  /** a organização; sem ela (o protótipo, um formulário sem base) não há GLB próprio */
  org: string | null | undefined;
  /** o Modelo do Catálogo a que o produto pertence (products.model_id); sem ele o nível do Modelo não conta */
  modeloId?: string | null | undefined;
  /** o nó da árvore do Catálogo (a subcategoria, ou a categoria se o produto não tem subcategoria) */
  no: string | null;
  arvore: readonly NoCat[];
  /** a escolha manual do produto (products.modelo_3d): manda sobre qualquer GLB */
  modelo3d?: string | null | undefined;
}
/** O GLB que vale, com o URL público para o 3D o pedir. */
export interface GlbDoProduto extends ResolvidoGlb { url: string }

const nivel = (x: SubcategoriaGestao | undefined): NivelModelo | null => (x ? { nome: x.nome, modelo: x.modelo3d ?? null, glb: x.glbCaminho ?? null } : null);

/** A resolução pura sobre a leitura de gestão (testável sem React): null se nada vale ou a leitura não existe. */
export function resolverGlbDaLeitura(l: LeituraGlbs | null, e: Pick<EntradaGlbProduto, "modeloId" | "no" | "arvore" | "modelo3d">): ResolvidoGlb | null {
  if (!l) return null;
  const m = e.modeloId ? l.modelos.find((x) => x.id === e.modeloId) : undefined;
  let cat: CategoriaGestao | undefined, sub: SubcategoriaGestao | undefined;
  // o Modelo diz a subcategoria e a categoria exactas (um produto só se liga a um Modelo da sua subcategoria); sem Modelo, pelos nomes da árvore
  if (m?.categoria) { cat = l.categorias.find((c) => c.id === m.categoria?.id); sub = cat?.subcategorias.find((s) => s.id === m.subcategoria.id); }
  if (!cat) {
    const n = niveisDoNo(e.arvore, e.no);
    const r = n.categoria ? resolverCategoria(l.categorias, n.categoria.nome, n.subcategoria?.nome ?? null) : null;
    if (r?.k === "ok") { cat = l.categorias.find((c) => c.id === r.categoria); sub = r.subcategoria ? cat?.subcategorias.find((s) => s.id === r.subcategoria) : undefined; }
  }
  return resolverGlbProprio({
    produto: e.modelo3d, modelo: m ? { nome: m.nome, modelo: m.modelo3d, glb: m.glbCaminho ?? null } : null, subcategoria: nivel(sub), categoria: nivel(cat),
  });
}

/**
 * O GLB próprio do produto (null enquanto lê, se não há, ou se a leitura falhar: vale o 3D de sempre). Só vai à base se há organização e o produto não tem escolha manual
 * (que vence qualquer GLB); a leitura é uma por organização e fica em memória (glbCatalogoCache.ts).
 */
export function useGlbDoProduto({ org, modeloId, no, arvore, modelo3d }: EntradaGlbProduto): GlbDoProduto | null {
  const manda = !!escolhaPorId(modelo3d);
  const [leitura, setLeitura] = useState<{ org: string; l: LeituraGlbs | null } | null>(null);
  useEffect(() => {
    if (!org || manda) return;
    let vivo = true;
    void lerGlbsDoCatalogo(org).then((l) => { if (vivo) setLeitura({ org, l }); });
    return () => { vivo = false; };
  }, [org, manda]);
  return useMemo(() => {
    if (!org || manda || leitura?.org !== org) return null;
    const r = resolverGlbDaLeitura(leitura.l, { modeloId, no, arvore, modelo3d });
    const url = r ? urlDoGlbProprio(r.glb) : null;
    return r && url ? { ...r, url } : null;
  }, [org, manda, leitura, modeloId, no, arvore, modelo3d]);
}
