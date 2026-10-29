// F3 (28/10/2026): a prontidão da encomenda de cliente REAL (as Encomendas de cliente da Olyvia), para o passo «À espera dos materiais».
// Quem lê é o ecrã ligado à base (real/financeiroReal.ts: rpc_client_order_list_readiness); aqui só se guarda e se diz em texto, sem rede,
// para o motor e os passos da obra (preparacaoObra.ts) não dependerem do supabase-js.

/** O que rpc_client_order_list_readiness devolve por contrato (as unidades, sem as linhas). */
export interface ProntidaoReal {
  contrato: string; linhasProntas: number; reservadas: number; aChegar: number; emFalta: number; servidas: number; precisas: number;
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
  if (p.emFalta > 0) F.push(`encomendar ao fornecedor ${un(p.emFalta)} («Pedir o que falta», nas Encomendas de cliente)`);
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
