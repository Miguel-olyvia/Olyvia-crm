// O catálogo real da Mudelar no protótipo (14/10/2026): lê os dados gerados por
// operacao-app/tools/catalogo-mudelar/gerar.mjs (mudelarServicos.ts e mudelarProdutos.ts) e dá-os já com tipos.
//
// REAL (da base da Mudelar): nomes, referências (sku), categorias, PVP e custo dos 358 serviços e dos produtos,
// e as marcas e os fornecedores quando existem.
// INVENTADO (com regras fixas no gerador): os perfis novos e os salários, os equipamentos, os consumíveis,
// a árvore ofício › sub, as receitas (calibradas para o custo do motor ficar perto do custo real), a medida da
// visita, os ícones, as ilustrações, as marcas e os fornecedores em falta, a descrição e as relações.
//
// Quem usa: catalogo.ts (os serviços novos entram no CATALOGO; os c1..c41 ganham o sku e a receita), custosModelo.ts
// (perfis, equipamentos, a receita dos serviços novos), catalogoModelo.ts (árvore, produtos, relações, ícones)
// e motor.ts (garantirServico usa o resumo da receita).
import type { MedKey } from "../motor";
import type { IconeServicoKey, IlustracaoKey } from "../ilustracoes";
import type { Equip, PassoMO, Perfil, UsoCons, UsoEquip } from "../v2/custosModelo";
import { BRUTO_SERVICOS } from "./mudelarServicos";
import { BRUTO_PRODUTOS } from "./mudelarProdutos";

/* ------------------------------------------------------------------ o formato gerado (compacto) */
type ConsBruto = [id: string, q: number, opcional: 0 | 1] | [n: string, un: string, preco: number, fornecedor: string, q: number];
export type ServicoBruto = [
  id: string, sku: string, n: string, oficio: string, sub: string, un: string, pvp: number, custo: number, medida: MedKey | "",
  icone: IconeServicoKey, linhas: string, cId: string, rs: [h: number, eh: number, eq: number, cons: number],
  mo: [n: string, perfil: string, h: number][], eq: [equip: string, h: number][], cs: ConsBruto[],
];
export interface BrutoServicos {
  resumo: Record<string, number | string>;
  perfis: [id: string, n: string, salario: number][];
  equip: [id: string, n: string, compra: number, vida: number, residual: number, manutAno: number, usoAno: number][];
  /** O 9.º campo (14/10) é o sku do artigo da Mudelar, quando o consumível vem da lista de produtos. */
  cons: [id: string, n: string, un: string, preco: number, fornecedor: string, marca: string, data: string, opcional: 0 | 1, sku?: string][];
  subsNovos: [oficio: string, subs: string[]][];
  oficiosNovos: [oficio: string, subs: string[]][];
  perfilDoOficio: Record<string, string>;
  servicos: ServicoBruto[];
  exige: [sid: string, oficio: string, sub: string, pergunta: string, regra: [MedKey, number, boolean] | null][];
  excluidos: { sku: string; n: string; motivo: string }[];
  /** Produtos que se instalam e ficam sem serviço, com a razão (14/10). */
  semServico: { sku: string; n: string; razao: string }[];
}
export type ProdutoBruto = [
  id: string, sku: string, n: string, no: number, sub: number, marca: number, fornecedor: number, un: string, custo: number, pvp: number,
  img: IlustracaoKey, desc: string, data: string, servico: string, fator: number,
];
export interface BrutoProdutos { nos: [string, string][]; subs: string[]; marcas: string[]; forns: string[]; produtos: ProdutoBruto[] }

/* ------------------------------------------------------------------ perfis, equipamentos, consumíveis */
/** Os perfis novos (o salário é inventado; a média é a mesma dos perfis de antes). */
export const PERFIS_MUDELAR: Perfil[] = BRUTO_SERVICOS.perfis.map(([id, n, salario]) => ({ id, n, salario }));
/** O ofício novo → o perfil que o faz (junta-se ao PERFIL_DO_OFICIO). */
export const PERFIL_DO_OFICIO_MUDELAR: Record<string, string> = BRUTO_SERVICOS.perfilDoOficio;
/** Os equipamentos novos (os 5 de receitas.ts continuam como estavam). */
export const EQUIP_MUDELAR: Equip[] = BRUTO_SERVICOS.equip.map(([id, n, compra, vida, residual, manutAno, usoAno]) => ({ id, n, compra, vida, residual, manutAno, usoAno }));
export interface ConsumivelMudelar {
  id: string; n: string; un: string; preco: number; fornecedor: string; marca: string; data: string; opcional: boolean;
  /** O artigo da Mudelar de onde veio (14/10: o material de consumo que estava na lista de produtos). */
  sku?: string;
}
/** Os consumíveis das receitas (alguns opcionais por omissão; as datas do preço variam). */
export const CONSUMIVEIS_MUDELAR: ConsumivelMudelar[] = BRUTO_SERVICOS.cons.map(([id, n, un, preco, fornecedor, marca, data, o, sku]) => ({
  id, n, un, preco, fornecedor, marca, data, opcional: o === 1, ...(sku ? { sku } : {}),
}));
const CONS = new Map(CONSUMIVEIS_MUDELAR.map((c) => [c.id, c]));

/* ------------------------------------------------------------------ árvore */
/** Os subs novos de ofícios que já existiam (pela ordem em que se juntam). */
export const SUBS_NOVOS_MUDELAR: [string, string[]][] = BRUTO_SERVICOS.subsNovos;
/** Os ofícios novos e os subs deles. */
export const OFICIOS_NOVOS_MUDELAR: [string, string[]][] = BRUTO_SERVICOS.oficiosNovos;

/* ------------------------------------------------------------------ serviços */
export interface ServicoMudelar {
  /** cN quando é um dos c1..c41 do protótipo (sem duplicar); senão "s-<sku>". */
  id: string;
  sku: string;
  n: string;
  oficio: string;
  sub: string | null;
  un: string;
  /** Preço de venda e custo reais da Mudelar (€ s/IVA, por unidade). */
  pvp: number;
  custoReal: number;
  /** De onde vem a quantidade na visita (null = escreve-se). */
  medida: MedKey | null;
  icone: IconeServicoKey;
  linhas: ("wc" | "coz")[];
  /** O cN do protótipo a que corresponde (ou null). */
  cId: string | null;
  /** Resumo da receita (por unidade, sem a estrutura): horas, €/h médio, equipamentos e consumíveis. */
  rs: { h: number; eh: number; eq: number; cons: number };
  /** A receita: passos de mão de obra, equipamentos e consumíveis (por unidade). */
  mo: PassoMO[];
  equip: UsoEquip[];
  cons: UsoCons[];
  /** Subempreitada sem preço na tabela (preço pedido por obra). */
  subempreitada: boolean;
}
/** A data da tabela de preços dos componentes e subempreitadas (consumíveis próprios da linha). */
const DATA_TABELA = "2026-09-01";
function consumivel(c: ConsBruto, i: number): UsoCons {
  if (c.length === 3) {
    const k = CONS.get(c[0])!;
    return { id: "c" + i, n: k.n, q: c[1], un: k.un, preco: k.preco, fornecedor: k.fornecedor, data: k.data, ...(c[2] ? { opcional: true } : {}) };
  }
  return { id: "c" + i, n: c[0], q: c[4], un: c[1], preco: c[2], fornecedor: c[3], data: DATA_TABELA };
}
export const SERVICOS_MUDELAR: ServicoMudelar[] = BRUTO_SERVICOS.servicos.map(
  ([id, sku, n, oficio, sub, un, pvp, custo, medida, icone, linhas, cId, rs, mo, eq, cs]) => ({
    id, sku, n, oficio, sub: sub || null, un, pvp, custoReal: custo, medida: medida || null, icone,
    linhas: (linhas ? linhas.split(",") : []) as ("wc" | "coz")[], cId: cId || null,
    rs: { h: rs[0], eh: rs[1], eq: rs[2], cons: rs[3] },
    mo: mo.map(([pn, perfil, h], i) => ({ id: "p" + (i + 1), n: pn, perfil, h })),
    equip: eq.map(([equip, h], i) => ({ id: "e" + i, equip, h })),
    cons: cs.map(consumivel),
    subempreitada: oficio === "Subempreitadas" && !(pvp > 0),
  }),
);
const POR_ID = new Map(SERVICOS_MUDELAR.map((s) => [s.id, s]));
/** O serviço da Mudelar com este id (cN ou s-…). */
export const servicoMudelar = (sid: string): ServicoMudelar | undefined => POR_ID.get(sid);
/** cN → sku real (os c1..c41 que têm correspondência na base da Mudelar). */
export const SKU_DOS_C: Record<string, string> = Object.fromEntries(SERVICOS_MUDELAR.filter((s) => s.cId).map((s) => [s.cId!, s.sku]));
/** Os serviços novos (os que não são c1..c41), pela ordem da árvore. */
export const SERVICOS_NOVOS_MUDELAR = SERVICOS_MUDELAR.filter((s) => !s.cId);
/** O ícone de cada serviço da Mudelar (pelo id do protótipo). */
export const ICONE_MUDELAR: Record<string, IconeServicoKey> = Object.fromEntries(SERVICOS_MUDELAR.map((s) => [s.id, s.icone]));

/**
 * A receita da Mudelar de um serviço (s-… ou um dos c1..c41), já com os ids de cada linha.
 * 14/10: os c1..c41 também passam a usá-la (passos, equipamentos, consumíveis, medida e o PVP real como preço de tabela).
 */
export function receitaMudelar(sid: string): ServicoMudelar | null {
  return POR_ID.get(sid) ?? null;
}

/* ------------------------------------------------------------------ serviço que exige produto */
export interface ExigeMudelar { sid: string; ramo: [string, string]; pergunta: string; regra: { med: MedKey; f: number; arred: boolean } | null }
/** Serviços que obrigam a escolher um produto de um ramo, com a pergunta "O cliente mantém…?". */
export const EXIGE_MUDELAR: ExigeMudelar[] = BRUTO_SERVICOS.exige.map(([sid, of, sub, pergunta, r]) => ({
  sid, ramo: [of, sub], pergunta, regra: r ? { med: r[0], f: r[1], arred: r[2] } : null,
}));

/* ------------------------------------------------------------------ produtos */
export interface ProdutoMudelar {
  id: string; sku: string; n: string;
  /** Ofício › sub da árvore (null = sem classificação). */
  ramo: [string, string | undefined] | null;
  /** A subcategoria real da Mudelar (ex.: "Toalheiros"). */
  sub: string | undefined;
  marca: string; fornecedor: string; un: string;
  custo: number; pvp: number; img: IlustracaoKey; desc: string; data: string;
  /** O serviço que o instala (cN ou s-…) e o fator. */
  servico?: string; fatorServico?: number;
}
export const PRODUTOS_MUDELAR: ProdutoMudelar[] = BRUTO_PRODUTOS.produtos.map(
  ([id, sku, n, no, sub, marca, forn, un, custo, pvp, img, desc, data, servico, fator]) => {
    const [of, s] = BRUTO_PRODUTOS.nos[no];
    return {
      id, sku, n, ramo: of ? [of, s || undefined] : null, sub: BRUTO_PRODUTOS.subs[sub] || undefined,
      marca: BRUTO_PRODUTOS.marcas[marca], fornecedor: BRUTO_PRODUTOS.forns[forn], un, custo, pvp, img, desc, data,
      ...(servico ? { servico, fatorServico: fator } : {}),
    };
  },
);

/* ------------------------------------------------------------------ o resumo */
/** Os números do gerador (serviços, produtos incluídos e excluídos, perfis, equipamentos, consumíveis, calibração). */
export const RESUMO_MUDELAR = BRUTO_SERVICOS.resumo;
/** Os produtos que ficaram de fora (artigos de teste e de outros negócios), com o motivo. */
export const EXCLUIDOS_MUDELAR = BRUTO_SERVICOS.excluidos;
/** Os produtos que se instalam e ficam sem serviço de instalação, com a razão (14/10: os termoacumuladores). */
export const SEM_SERVICO_MUDELAR = BRUTO_SERVICOS.semServico;
