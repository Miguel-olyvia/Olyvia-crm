// Famílias (interface): os filtros em cascata do passo «Escolher produtos» (Categoria > Subcategoria > Modelo > Marca) e a pesquisa de texto, como na página de Produtos.
// O ecrã trabalha com os nós da árvore do Catálogo leve; a base recebe os ids de product_categories (`origem`), como em ProdutosPagina (useIdsBase).
import { useEffect, useMemo, useState } from "react";
import type { Catalogo } from "../v2/catalogoModelo";
import type { ItemCombo } from "../ComboPesquisa";
import { categoriasDeProdutos, modelosDeProdutos, normalizarMarca, subcategoriasDeProdutos, type RamoFiltro } from "../filtroProdutosCatalogo";
import { useAtrasado, useMarcasDoFiltro, type FiltroPesquisa } from "./usarPesquisaFamilias";

export interface EscolhaFiltros { cat: string; sub: string; modelo: string; marca: string }
const SEM_ESCOLHA: EscolhaFiltros = { cat: "", sub: "", modelo: "", marca: "" };
const comoItem = (x: RamoFiltro, desativada: string): ItemCombo => ({ id: x.id, nome: x.inativa ? `${x.n} (${desativada})` : x.n });

export interface FiltrosFamilia {
  q: string; setQ: (q: string) => void;
  escolha: EscolhaFiltros; mudar: (p: Partial<EscolhaFiltros>) => void;
  cats: ItemCombo[]; subs: ItemCombo[]; modelos: ItemCombo[] | null; marcas: ItemCombo[];
  /** O filtro que vai ao servidor: ids da base e o texto já atrasado. */
  pesquisa: FiltroPesquisa;
  /** Há marca escolhida e as marcas do conjunto atual ainda não chegaram: a pesquisa espera (pedir já com a marca antiga e depois sem ela faria piscar «0 produtos»). */
  aEsperarMarcas: boolean;
}

export function useFiltrosFamilia(K: Catalogo, org: string | null): FiltrosFamilia {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<EscolhaFiltros>(SEM_ESCOLHA);
  const qAtraso = useAtrasado(q);
  const baseDe = useMemo(() => {
    const paraBase = new Map((K.categoriasProduto ?? []).map((c) => [c.id, c.origem ?? c.id]));
    return (no: string) => paraBase.get(no) ?? no;
  }, [K.categoriasProduto]);

  const cats = useMemo(() => categoriasDeProdutos(K).map((x) => comoItem(x, "desativada")), [K]);
  const cat = !sel.cat || cats.some((x) => x.id === sel.cat) ? sel.cat : "";
  const subs = useMemo(() => subcategoriasDeProdutos(K, cat).map((x) => comoItem(x, "desativada")), [K, cat]);
  const sub = cat && subs.some((x) => x.id === sel.sub) ? sel.sub : "";
  const modelos = useMemo(() => (K.modelos ? modelosDeProdutos(K, sub).map((x) => comoItem(x, "desativado")) : null), [K, sub]);
  const modelo = modelos?.some((x) => x.id === sel.modelo) ? sel.modelo : "";

  const pesquisa: FiltroPesquisa = { q: qAtraso, categoria: cat ? baseDe(cat) : "", subcategoria: sub ? baseDe(sub) : "", modelo, marca: sel.marca };
  const marcasLidas = useMarcasDoFiltro(org, K.marcas, pesquisa);
  // a marca escolhida deixa de valer quando o conjunto lido já não a tem (mudou a categoria, o modelo ou o texto)
  const marcaValida = !sel.marca || marcasLidas.aLer || !marcasLidas.doConjunto || marcasLidas.itens.some((m) => normalizarMarca(m.id) === normalizarMarca(sel.marca));
  useEffect(() => { if (!marcaValida) setSel((s) => ({ ...s, marca: "" })); }, [marcaValida]);

  const mudar = (p: Partial<EscolhaFiltros>) => setSel((s) => ({ ...s, ...p }));
  return { q, setQ, escolha: { cat, sub, modelo, marca: marcaValida ? sel.marca : "" }, mudar, cats, subs, modelos, marcas: marcasLidas.itens, pesquisa: { ...pesquisa, marca: marcaValida ? sel.marca : "" }, aEsperarMarcas: !!sel.marca && marcasLidas.aLer };
}
