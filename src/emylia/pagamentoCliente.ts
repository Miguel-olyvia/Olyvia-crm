// Os dados para o cliente pagar uma fatura no portal (15/10/2026): a referência Multibanco e a transferência.
// No protótipo são de exemplo, mas estáveis: a mesma fatura dá sempre a mesma referência. Na app real vêm do
// fornecedor de pagamentos (ex.: entidade e referência geradas por fatura) e do IBAN da empresa.

import { useSyncExternalStore } from "react";

/** 4/11: os dados da empresa para o cliente pagar (negocio_dados_pagamento, 20270106700000). Um campo vazio é nulo. */
export interface DadosPagamento { titular: string | null; iban: string | null; mbEntidade: string | null; mbway: string | null; sepaCredor: string | null }

/** Os de exemplo, só para o protótipo (e os testes): no CRM real e no portal vêm da base. */
export const PAGAMENTO_EXEMPLO: DadosPagamento = { titular: "Mudelar, Lda.", iban: "PT50 0035 0000 1234 5678 9015 4", mbEntidade: "21312", mbway: "912 345 678", sepaCredor: "PT12ZZZ123456" };

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** O que a base devolve (neg_dados_pagamento_ler / portal_neg_dados_pagamento), ou null se a empresa ainda não indicou nada. */
export function lerDadosPagamento(raw: unknown): DadosPagamento | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const d = { titular: txt(r.titular), iban: txt(r.iban), mbEntidade: txt(r.mb_entidade), mbway: txt(r.mbway), sepaCredor: txt(r.sepa_credor) };
  return Object.values(d).some(Boolean) ? d : null;
}
/** Para gravar (neg_dados_pagamento_guardar). */
export const paraGravar = (d: DadosPagamento) => ({ titular: d.titular ?? "", iban: d.iban ?? "", mb_entidade: d.mbEntidade ?? "", mbway: d.mbway ?? "", sepa_credor: d.sepaCredor ?? "" });

/** O IBAN em grupos de 4, como no banco. */
export const ibanAVista = (iban: string) => iban.replace(/\s/g, "").toUpperCase().replace(/(.{4})(?=.)/g, "$1 ");

// Os dados em uso no ecrã: o protótipo fica com os de exemplo; a página real e o portal trocam-nos pelos da empresa (ou null).
let atual: DadosPagamento | null = PAGAMENTO_EXEMPLO;
const ouvintes = new Set<() => void>();
/** Troca os dados em uso e devolve como desfazer (volta aos de antes). */
export function definirDadosPagamento(d: DadosPagamento | null): () => void {
  const antes = atual;
  atual = d;
  ouvintes.forEach((f) => f());
  return () => { if (atual === d) { atual = antes; ouvintes.forEach((f) => f()); } };
}
export const dadosPagamento = () => atual;
export function useDadosPagamento(): DadosPagamento | null {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, () => atual, () => atual);
}

/** Agrupa os dígitos de 3 em 3 (como aparece no talão Multibanco). */
export const em3 = (s: string) => s.replace(/(\d{3})(?=\d)/g, "$1 ");

/** A referência Multibanco (9 dígitos) de uma fatura: o número do negócio, o da fatura e 3 dígitos de controlo. */
export function referenciaMb(negocio: number, fatura: string): string {
  const nFat = Number((fatura.match(/(\d+)\s*$/) ?? ["", "0"])[1]) % 1000;
  const base = String(negocio % 1000).padStart(3, "0") + String(nFat).padStart(3, "0");
  // controlo simples (soma ponderada), só para a referência não parecer sequencial
  const ctl = [...base].reduce((a, c, i) => a + Number(c) * (i + 3) * 7, 0) % 1000;
  return base + String(ctl).padStart(3, "0");
}

/** A data em que vence: a emissão mais os dias do vencimento ("15 dias" por omissão), em dd/mm. */
export function vencimento(emitida: Date, prazo = "15 dias"): string {
  const dias = Number((prazo.match(/\d+/) ?? ["15"])[0]);
  const v = new Date(emitida);
  v.setDate(v.getDate() + dias);
  return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}`;
}

/** 21/10 (4/11 com o MB Way): as formas de pagar uma fatura, à escolha do cliente no portal. */
export const METODOS_PAGAMENTO = ["Transferência", "Referência MB", "MB Way", "Débito direto"] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];
/** O método guardado no negócio, ou a transferência quando ainda não há escolha (ou era um método antigo, ex.: cheque). */
export const metodoDe = (m?: string): MetodoPagamento => (METODOS_PAGAMENTO as readonly string[]).includes(m ?? "") ? (m as MetodoPagamento) : "Transferência";
/** As formas que a empresa pode receber: a transferência está sempre (sem IBAN, o portal diz que falta); as outras só com os seus dados. */
export const metodosDe = (d: DadosPagamento | null): MetodoPagamento[] => METODOS_PAGAMENTO.filter((m) =>
  m === "Transferência" || (m === "Referência MB" ? !!d?.mbEntidade : m === "MB Way" ? !!d?.mbway : !!d?.sepaCredor));

/** Um IBAN português para o débito direto: PT50 e 21 dígitos (espaços à parte). */
export const ibanValido = (iban: string) => /^PT50\d{21}$/.test(iban.replace(/\s/g, "").toUpperCase());
/** O IBAN como fica à vista depois de autorizado: só os últimos 4 dígitos. */
export const ibanCurto = (iban: string) => "PT50 ···· " + iban.replace(/\s/g, "").slice(-4);
