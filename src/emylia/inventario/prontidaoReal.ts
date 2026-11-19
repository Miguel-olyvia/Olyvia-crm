// F3 (28/10/2026): a prontidão da encomenda de cliente REAL (as Encomendas de cliente da Olyvia), para o passo «À espera dos materiais».
// Quem lê é o ecrã ligado à base (real/financeiroReal.ts: rpc_client_order_list_readiness); aqui só se guarda e se diz em texto, sem rede,
// para o motor e os passos da obra (preparacaoObra.ts) não dependerem do supabase-js.

/** O que rpc_client_order_list_readiness devolve por contrato (as unidades, sem as linhas). */
export interface ProntidaoReal {
  contrato: string; linhasProntas: number; reservadas: number; aChegar: number; emFalta: number; servidas: number; precisas: number;
  /** 19/11 (rpc_client_order_missing_causes, 20270124010000): do que está em falta, o que se pode pedir ao fornecedor, e quantas linhas
   *  estão presas sem fornecedor preferido ou com a unidade do fornecedor incompatível. Ausentes: a base ainda não o diz. */
  aPedir?: number; semFornecedor?: number; unidadeIncompativel?: number;
}

import { encomendaReal } from "../real/encomendaReal";

const prontidoes = new Map<string, ProntidaoReal>();
const ouvintes = new Set<() => void>();

/** Guarda as prontidões lidas (substitui as dos mesmos contratos) e avisa quem desenha. */
export function definirProntidoes(lidas: readonly ProntidaoReal[]): void {
  for (const p of lidas) prontidoes.set(p.contrato, p);
  for (const f of [...ouvintes]) f();
}
/** A prontidão de um contrato; `undefined` enquanto não se leu. */
export const prontidaoDe = (contrato: string): ProntidaoReal | undefined => prontidoes.get(contrato);
export function aoMudarProntidao(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
/** A encomenda de cliente real sem o resumo completo da base carregado (encomendaReal.ts: as linhas e as encomendas a fornecedor, no
 *  /negocios): aí usa-se a prontidão (unidades). Com o resumo, os ecrãs usam-no, como no Inventário da V1. */
export const usarProntidao = (ec: { contrato?: string; ref?: string } | null | undefined): ec is { contrato: string; ref?: string } =>
  !!ec?.contrato && !encomendaReal(ec.ref);
/** Só para testes. */
export function limparProntidoes(): void { prontidoes.clear(); }

const un = (n: number) => `${n.toLocaleString("pt-PT")} ${n === 1 ? "unidade" : "unidades"}`;

/** Pronta: nada em falta nem a chegar do fornecedor (o que é preciso está reservado ou já saiu). */
export const prontaReal = (p: ProntidaoReal | undefined): boolean => !!p && p.emFalta <= 0 && p.aChegar <= 0;

/** O que falta, nas palavras do passo «À espera dos materiais» (vazio: pronta). */
export function faltaMateriaisReal(p: ProntidaoReal | undefined): string[] {
  if (!p) return ["confirmar os materiais nas Encomendas de cliente (a ler)"];
  const F: string[] = [];
  const mat = (n: number) => `${n} ${n === 1 ? "material" : "materiais"}`;
  if (p.emFalta > 0 && p.aPedir === undefined) F.push(`encomendar ao fornecedor ${un(p.emFalta)} («Pedir o que falta ao fornecedor», nas Encomendas de cliente)`);
  // 19/11: com as causas da base, o botão só aparece para o que se pode mesmo pedir; o resto diz porquê e onde se resolve
  if (p.emFalta > 0 && p.aPedir !== undefined) {
    if (p.aPedir > 0) F.push(`encomendar ao fornecedor ${un(p.aPedir)} («Pedir o que falta ao fornecedor»)`);
    if (p.semFornecedor) F.push(`escolher o fornecedor preferido de ${mat(p.semFornecedor)} no Catálogo (sem ele, o que falta não se pode pedir)`);
    if (p.unidadeIncompativel) F.push(`corrigir a unidade do fornecedor de ${mat(p.unidadeIncompativel)} no Catálogo (é incompatível com a do produto)`);
    // salvaguarda: a falta sem causa nem nada a pedir (a leitura mudou entre as duas chamadas): como antes
    if (!p.aPedir && !p.semFornecedor && !p.unidadeIncompativel) F.push(`encomendar ao fornecedor ${un(p.emFalta)} («Pedir o que falta ao fornecedor»)`);
  }
  if (p.aChegar > 0) F.push(`receber no armazém ${un(p.aChegar)} encomendadas ao fornecedor`);
  return F;
}

/** A frase dos materiais da obra com a encomenda real. */
export function textoProntidaoReal(numero: string, p: ProntidaoReal | undefined): string {
  if (!p) return `Encomenda de cliente ${numero} emitida.`;
  if (prontaReal(p)) return `Encomenda de cliente ${numero}: materiais garantidos${p.reservadas > 0 ? ` (${un(p.reservadas)} reservadas)` : ""}.`;
  const partes = [p.reservadas > 0 ? `${un(p.reservadas)} reservadas` : "", p.aChegar > 0 ? `${un(p.aChegar)} a chegar` : "", p.emFalta > 0 ? `${un(p.emFalta)} por encomendar` : ""].filter(Boolean);
  return `Encomenda de cliente ${numero}: ${partes.join(" · ")}.`;
}
