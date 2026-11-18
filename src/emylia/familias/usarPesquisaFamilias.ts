// Famílias (interface): a pesquisa de produtos do passo «Escolher produtos», NO SERVIDOR (a base tem dezenas de milhares de produtos: nunca se carregam todos).
// Faz o mesmo que a página de Produtos (ProdutosPagina): cat_ler_produtos_pagina, 50 por página, com os filtros categoria > subcategoria > modelo > marca em ids da base,
// e as marcas do conjunto escolhido (cat_ler_marcas_do_filtro). O texto da pesquisa chega já «atrasado» (useAtrasado): quem chama decide quando vai ao servidor.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ItemCombo } from "../ComboPesquisa";
import { normalizarMarca } from "../filtroProdutosCatalogo";
import { SEM_FILTRO_SERVIDOR, lerMarcasDoFiltro, lerProdutosPagina, type LinhaPaginaProduto, type MarcasDoFiltro, type PaginaProdutos } from "../real/produtosPaginados";

export const ESPERA_PESQUISA_MS = 300;

/** O que o ecrã filtra, já em ids da base (product_categories, product_models) e a marca pelo nome. */
export interface FiltroPesquisa { q: string; categoria: string; subcategoria: string; modelo: string; marca: string }
export const SEM_FILTRO_PESQUISA: FiltroPesquisa = { q: "", categoria: "", subcategoria: "", modelo: "", marca: "" };

const textoDoErro = (e: unknown, omissao: string): string => (e instanceof Error && e.message ? e.message : omissao);

/** O valor só «assenta» depois de `ms` sem mudar (a pesquisa de texto vai ao servidor ~300 ms depois da última tecla). */
export function useAtrasado<T>(valor: T, ms: number = ESPERA_PESQUISA_MS): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    if (Object.is(valor, atrasado)) return undefined;
    const t = window.setTimeout(() => setAtrasado(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, atrasado, ms]);
  return atrasado;
}

export interface PesquisaFamilias {
  linhas: LinhaPaginaProduto[]; total: number; pagina: number; paginas: number; limite: number;
  aCarregar: boolean; erro: string | null; irPara: (pagina: number) => void; tentar: () => void;
}
interface Lido { chave: string; pagina: number; tentativa: number; erro: string | null }

/** A página da lista para estes filtros. Mudar um filtro volta à página 1; uma resposta de um pedido antigo descarta-se. Sem organização, ou com `ativa` false (à espera de
 *  outra leitura), não pede. Enquanto lê, a ÚLTIMA página lida continua em `linhas` (`aCarregar` true: quem desenha esbate-a); um erro esvazia-a. */
export function usePesquisaFamilias(org: string | null, f: FiltroPesquisa, op: { ativa?: boolean } = {}): PesquisaFamilias {
  const { ativa = true } = op, { q, categoria, subcategoria, modelo, marca } = f;
  const chave = JSON.stringify([org, q, categoria, subcategoria, modelo, marca]);
  const [pedida, setPedida] = useState({ chave: "", pagina: 1 });
  const pagina = pedida.chave === chave ? pedida.pagina : 1;
  const [dados, setDados] = useState<PaginaProdutos | null>(null);
  const [lido, setLido] = useState<Lido | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!org || !ativa) return undefined;
    let vivo = true;
    const fim = (d: PaginaProdutos | null, erro: string | null) => { if (!vivo) return; setDados(d); setLido({ chave, pagina, tentativa, erro }); };
    lerProdutosPagina(org, { ...SEM_FILTRO_SERVIDOR, q, categoria, subcategoria, modelo, marca }, pagina).then(
      (r) => ("erro" in r ? fim(null, r.erro) : fim(r.v, null)),
      (e: unknown) => fim(null, textoDoErro(e, "Não foi possível ler os produtos.")),
    );
    return () => { vivo = false; };
  }, [org, ativa, chave, q, categoria, subcategoria, modelo, marca, pagina, tentativa]);

  const irPara = useCallback((p: number) => setPedida({ chave, pagina: Math.max(1, p) }), [chave]);
  const tentar = useCallback(() => setTentativa((n) => n + 1), []);
  const atual = lido && lido.chave === chave && lido.pagina === pagina && lido.tentativa === tentativa ? lido : null;
  // os produtos diminuíram e a página pedida já não existe: volta à última
  useEffect(() => { if (atual && dados && dados.paginas > 0 && pagina > dados.paginas) irPara(dados.paginas); }, [atual, dados, pagina, irPara]);
  return {
    linhas: dados?.produtos ?? [], total: dados?.total ?? 0, pagina: dados?.pagina ?? pagina, paginas: dados?.paginas ?? 0, limite: dados?.limite ?? 50,
    aCarregar: !!org && !atual, erro: atual?.erro ?? null, irPara, tentar,
  };
}

export interface MarcasEscolha { itens: ItemCombo[]; aLer: boolean; /** as marcas são as do conjunto lido (e não as do arranque) */ doConjunto: boolean }

/** As marcas que existem no que já se escolheu (sem a própria marca), com o nº de produtos de cada uma. Sem a função na base, ou com a leitura a falhar,
 *  ficam as marcas do arranque (K.marcas), sem erro visível; enquanto lê, mantém as anteriores. */
export function useMarcasDoFiltro(org: string | null, arranque: readonly string[], f: FiltroPesquisa): MarcasEscolha {
  const { q, categoria, subcategoria, modelo } = f;
  const chave = JSON.stringify([org, q, categoria, subcategoria, modelo]);
  const [estado, setEstado] = useState<{ chave: string; dados: MarcasDoFiltro | null }>({ chave: "", dados: null });
  useEffect(() => {
    if (!org) return undefined;
    let vivo = true;
    const fim = (dados: MarcasDoFiltro | null) => { if (vivo) setEstado({ chave, dados }); };
    lerMarcasDoFiltro(org, { ...SEM_FILTRO_SERVIDOR, q, categoria, subcategoria, modelo, marca: "" }).then((r) => fim(r.ok ? r.v : null), () => fim(null));
    return () => { vivo = false; };
  }, [org, chave, q, categoria, subcategoria, modelo]);
  const itens = useMemo(() => {
    const vistas = new Set<string>();
    const brutas = estado.dados ? estado.dados.marcas.map((m) => ({ nome: m.nome.trim(), n: m.n })) : arranque.map((m) => ({ nome: m.trim(), n: -1 }));
    return brutas.filter((m) => { const k = normalizarMarca(m.nome); if (!k || vistas.has(k)) return false; vistas.add(k); return true; })
      .map((m): ItemCombo => ({ id: m.nome, nome: m.n >= 0 ? `${m.nome} · ${m.n}` : m.nome }));
  }, [estado.dados, arranque]);
  return { itens, aLer: !!org && estado.chave !== chave, doConjunto: !!estado.dados && estado.chave === chave };
}
