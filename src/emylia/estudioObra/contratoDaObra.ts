// 23/11 (Rúben: «também gostaria de ter uma visão destas numa das tabs do estúdio de gestão de obra»). As linhas do contrato (o
// orçamento aceite do negócio), como a tabela «a proposta igual ao contrato»: por linha, o serviço e os produtos que ele instala juntos
// (a base de duche: a instalação e a base), com a referência (SKU), a quantidade, o preço por unidade, o IVA e o total sem IVA. Os preços
// já levam o desconto, como no documento da proposta. Só para ler.
import { ivaDaLinha, linhaCalc, totaisIva, type Estado, type LinhaOrc, type Negocio } from "../motor";
import { itemCatalogo } from "../catalogo";
import { PREFIXO_CLIENTE, PREFIXO_PROD, catalogoLigado, textoProduto, type ProdVisita } from "../produtosVisita";
import { nomeCurtoTarefa } from "./planoVivo";
import { skuLido } from "@/pages/prototipo-estudio/produtosDoProjeto";

export interface LinhaContrato { sku?: string; nome: string; q: number; un: string; pu: number; iva: number; total: number; tipo: "servico" | "produto" | "livre"; cliente?: boolean }
export interface GrupoContrato { n: number; titulo: string; linhas: LinhaContrato[]; total: number }
export interface ContratoDaObra { grupos: GrupoContrato[]; desconto: number; base6: number; iva6: number; base23: number; iva23: number; semIva: number; total: number }

/** O produto da visita de uma linha de materiais (pela descrição «Produto · …»). */
function produtoDaLinha(d: Negocio, l: Extract<LinhaOrc, { t: "mat" }>): ProdVisita | null {
  return (d.visita.prod ?? []).find((x) => l.d === PREFIXO_PROD + textoProduto(x) || l.d === PREFIXO_CLIENTE + textoProduto(x)) ?? null;
}

/** As linhas do contrato, em grupos (o serviço e o que ele instala). Null sem orçamento. */
export function contratoDaObra(d: Negocio, S: Estado): ContratoDaObra | null {
  const o = d.orc;
  if (!o) return null;
  const k = 1 - (o.desconto || 0) / 100;
  // a referência do Catálogo carregado; sem ele, a lida pela pesquisa (ContratoObra.tsx: useSkus)
  const skuProduto = (id: string) => catalogoLigado()?.produtos.find((x) => x.id === id)?.sku ?? skuLido(id);
  type G = { pos: number; titulo: string; linhas: LinhaContrato[]; sid?: string };
  const grupos: G[] = [];
  const porServico = new Map<string, G>();
  // 1. os serviços, cada um no seu grupo
  o.linhas.forEach((l, i) => {
    if (l.t !== "svc") return;
    const x = linhaCalc(l, S), nome = x.s?.n ?? l.sid, total = x.preco * k;
    const linha: LinhaContrato = { sku: itemCatalogo(l.sid)?.sku, nome, q: l.q, un: x.s?.un ?? "un", pu: total / (l.q || 1), iva: ivaDaLinha(l, S), total, tipo: "servico" };
    const g: G = { pos: i, titulo: nomeCurtoTarefa(nome), linhas: [linha], sid: l.sid };
    grupos.push(g);
    if (!porServico.has(l.sid)) porServico.set(l.sid, g);
  });
  // 2. os produtos e as linhas livres: com o serviço que os instala, se ele está no contrato; senão, uma linha sua
  o.linhas.forEach((l, i) => {
    if (l.t !== "mat") return;
    const x = linhaCalc(l, S), total = x.preco * k, p = l.livre ? null : produtoDaLinha(d, l);
    const q = l.livre?.q ?? l.prod?.q ?? p?.q ?? 1, un = l.livre?.un ?? p?.un ?? "un";
    const nome = p?.n ?? l.d.replace(PREFIXO_PROD, "").replace(PREFIXO_CLIENTE, "");
    const linha: LinhaContrato = { ...(p ? { sku: skuProduto(p.id) } : {}), nome, q, un, pu: total / (q || 1), iva: ivaDaLinha(l, S), total,
      tipo: l.livre ? "livre" : "produto", ...(p?.cliente || l.d.startsWith(PREFIXO_CLIENTE) ? { cliente: true } : {}) };
    const g = p?.svc ? porServico.get(p.svc) : undefined;
    if (g) g.linhas.push(linha);
    else grupos.push({ pos: i, titulo: nomeCurtoTarefa(nome), linhas: [linha] });
  });
  const T = totaisIva(d, S);
  return {
    grupos: grupos.sort((a, b) => a.pos - b.pos).map((g, j) => ({ n: j + 1, titulo: g.titulo, linhas: g.linhas, total: g.linhas.reduce((s, x) => s + x.total, 0) })),
    desconto: o.desconto || 0, base6: T.mo, iva6: T.ivaMo, base23: T.mat, iva23: T.ivaMat, semIva: T.base, total: T.total,
  };
}
