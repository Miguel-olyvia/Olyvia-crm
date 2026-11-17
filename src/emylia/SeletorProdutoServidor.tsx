// 17/11: o seletor de produtos com pesquisa NO SERVIDOR (cat_ler_produtos_pagina, páginas de 50, debounce). Com o Catálogo leve K.produtos não tem os 29 785 produtos
// da Mudelar; este seletor procura-os na base e, ao escolher, lê o produto inteiro (cat_ler_produto) e entrega-o como Produto, no formato de sempre.
// `noCatalogo`: o produto entra também no Catálogo em memória (e os gravadores sabem que já existe: ver catalogoLeve.ts); sem ele só se lê.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { SeletorPesquisa, type OpcaoSeletor } from "./pecasFicha";
import { usePesquisaProdutos } from "./real/pesquisaProdutos";
import { escolherProdutoDoServidor, lerProdutoEscolhido } from "./real/pesquisaProdutos";
import type { LinhaPaginaProduto } from "./real/produtosPaginados";
import type { Produto } from "./v2/catalogoModelo";

const eur = (n: number | null) => (n == null ? "" : `${n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

export function SeletorProdutoServidor({ org, rotulo, gatilho, aoEscolher, aoErro, noCatalogo = false, categoria, subcategoria, excluir, valorDe, placeholder = "Nome, marca ou referência", className }: {
  org: string; rotulo: string; gatilho: ReactNode; aoEscolher: (p: Produto) => void;
  /** A leitura do produto escolhido falhou (a mensagem da base). */
  aoErro?: (mensagem: string) => void;
  noCatalogo?: boolean;
  /** Ids de categoria e subcategoria (product_categories) a que a pesquisa se limita. */
  categoria?: string; subcategoria?: string;
  /** Produtos que não se oferecem (já juntos). */
  excluir?: (l: LinhaPaginaProduto) => boolean;
  /** O texto à direita de cada resultado (por omissão o PVP, ou o custo se não houver). */
  valorDe?: (l: LinhaPaginaProduto) => string;
  placeholder?: string; className?: string;
}) {
  const [aberto, setAberto] = useState(false), [q, setQ] = useState("");
  const pesquisa = usePesquisaProdutos(org, { q, categoria, subcategoria }, { ativo: aberto });
  const opcoes = useMemo<OpcaoSeletor[]>(() => pesquisa.linhas.filter((l) => !excluir?.(l)).map((l) => ({
    v: l.id, t: l.nome, sub: [l.marca, l.sku].filter(Boolean).join(" · ") || l.fornecedor || undefined, valor: valorDe ? valorDe(l) : eur(l.pvp ?? l.custo),
  })), [pesquisa.linhas, excluir, valorDe]);
  // um toque durante a leitura do produto não o lê outra vez (nem o junta duas vezes)
  const ocupado = useRef(false);
  const [aLer, setALer] = useState(false);
  const escolher = async (id: string) => {
    if (ocupado.current) return;
    ocupado.current = true; setALer(true);
    try {
      const r = await (noCatalogo ? escolherProdutoDoServidor(org, id) : lerProdutoEscolhido(org, id));
      if (r.ok) aoEscolher(r.v); else aoErro?.(r.erro);
    } finally { ocupado.current = false; setALer(false); }
  };
  return (
    <>
    <SeletorPesquisa rotulo={rotulo} gatilho={gatilho} placeholder={placeholder} className={className} opcoes={opcoes} max={opcoes.length || 1}
      aoMudar={(texto, abre) => { setQ(texto); setAberto(abre); }} totalServidor={pesquisa.total} aProcurar={pesquisa.aCarregar}
      vazio={pesquisa.erro ? `Não foi possível procurar: ${pesquisa.erro}` : "Nenhum produto."}
      onEscolher={(id) => { void escolher(id); }} />
    {aLer && <span role="status" className="text-[14px] text-muted-foreground">A ler o produto…</span>}
    </>
  );
}
