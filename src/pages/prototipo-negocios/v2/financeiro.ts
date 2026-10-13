// Financeiro da V2 (13/10/2026): as regras, sem React.
// A Olyvia NÃO emite faturas: a fatura é emitida num programa certificado pela AT (PHC, Moloni…) e aqui só se REGISTA
// (número, data, valor, tranche e, se houver, o PDF). Ver docs/melhorias-v2-2026-10-13/README.md, ponto 1.5.
// O contrato diz como se paga ("50% + 50% no fim"): cada parte é uma tranche, com a sua fatura, o seu pagamento e o seu recibo.
import { r2 } from "../motor";

export interface Tranche { id: string; nome: string; pct: number }

export interface Pagamento { data: string; conta: string; ref: string }

export interface FaturaReg {
  id: string;
  /** O número dado pelo programa certificado (ex.: "FT 2026/419"). */
  numero: string;
  /** Data da fatura, AAAA-MM-DD. */
  data: string;
  valor: number;
  tranche: string;
  /** Só o nome do ficheiro (protótipo: o PDF não sai do browser). */
  pdf?: string;
  pagamento?: Pagamento;
  recibo?: string;
  /** Vem da demonstração (a fatura única do motor), não foi registada aqui. */
  daDemo?: boolean;
}

/**
 * DECISÃO EM ABERTO (docs/negocios-2026-10-08, secção 6, pergunta 2; melhorias-v2, decisão 3): que pagamento põe a obra a andar
 * (Inventário + plano)? Fica "primeira": o adiantamento paga os materiais e a obra começa, e a tranche final só se paga no fim da
 * obra (se o disparo fosse na última, uma obra "50% + 50% no fim" nunca arrancava). Para mudar, basta trocar para "ultima".
 */
export type RegraDisparo = "primeira" | "ultima";
export const DISPARO: RegraDisparo = "primeira";

/** As tranches do plano de pagamento do contrato (o campo "pagamento" do negócio). */
export function tranchesDoPlano(pagamento: string | undefined): Tranche[] {
  const p = (pagamento || "").trim();
  if (!p || /^100\s*%/.test(p)) return [{ id: "unica", nome: "Única 100%", pct: 100 }];
  const pcts = [...p.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(",", ".")));
  if (pcts.length < 2) return [{ id: "unica", nome: "Única 100%", pct: 100 }];
  return pcts.map((pct, i) => {
    const nome = i === 0 ? "Adiantamento" : i === pcts.length - 1 ? "Final" : pcts.length === 3 ? "A meio" : `${i + 1}.ª tranche`;
    return { id: `t${i + 1}`, nome: `${nome} ${String(pct).replace(".", ",")}%`, pct };
  });
}

/** O valor de uma tranche, com IVA, arredondado ao cêntimo. A última leva o resto, para a soma bater certo com o total. */
export function valorTranche(total: number, tranches: Tranche[], id: string): number {
  const i = tranches.findIndex((t) => t.id === id);
  if (i < 0) return 0;
  if (i === tranches.length - 1) return r2(total - tranches.slice(0, i).reduce((a, t) => a + r2((total * t.pct) / 100), 0));
  return r2((total * tranches[i].pct) / 100);
}

export interface NovaFatura { numero: string; data: string; valor: number; tranche: string; pdf?: string }

/** O que impede registar a fatura (vazio: pode registar-se). */
export function errosRegisto(n: NovaFatura, faturas: FaturaReg[], tranches: Tranche[]): string[] {
  const e: string[] = [];
  const num = n.numero.trim();
  if (!num) e.push("Falta o número da fatura.");
  else if (faturas.some((f) => f.numero.trim().toLowerCase() === num.toLowerCase())) e.push(`A fatura ${num} já está registada.`);
  if (!n.data) e.push("Falta a data da fatura.");
  if (!n.tranche) e.push("Falta escolher a tranche.");
  else if (!tranches.some((t) => t.id === n.tranche)) e.push("Essa tranche não está no plano de pagamento.");
  else if (faturas.some((f) => f.tranche === n.tranche)) e.push("Essa tranche já tem fatura.");
  if (!(n.valor > 0)) e.push("O valor tem de ser maior do que zero.");
  return e;
}

export function registarFatura(faturas: FaturaReg[], n: NovaFatura): FaturaReg[] {
  const f: FaturaReg = { id: `f${faturas.length + 1}-${n.tranche}`, numero: n.numero.trim(), data: n.data, valor: r2(n.valor), tranche: n.tranche };
  if (n.pdf) f.pdf = n.pdf;
  return [...faturas, f];
}

export function errosPagamento(p: Pagamento): string[] {
  const e: string[] = [];
  if (!p.data) e.push("Falta a data do pagamento.");
  if (!p.conta) e.push("Falta escolher a conta.");
  if (!p.ref.trim()) e.push("Falta a referência ou o comprovativo.");
  return e;
}

/** Marca a fatura como paga, com o recibo. Não mexe numa fatura já paga. */
export function validarPagamento(faturas: FaturaReg[], id: string, p: Pagamento, recibo: string): FaturaReg[] {
  return faturas.map((f) => (f.id === id && !f.pagamento ? { ...f, pagamento: { ...p, ref: p.ref.trim() }, recibo } : f));
}

export interface ResumoFin {
  total: number;
  faturado: number;
  pago: number;
  porFaturar: Tranche[];
  porPagar: FaturaReg[];
  pagas: FaturaReg[];
  /** Todas as tranches faturadas e pagas. */
  completo: boolean;
}

export function resumoFin(total: number, tranches: Tranche[], faturas: FaturaReg[]): ResumoFin {
  const pagas = faturas.filter((f) => !!f.pagamento);
  return {
    total: r2(total),
    faturado: r2(faturas.reduce((a, f) => a + f.valor, 0)),
    pago: r2(pagas.reduce((a, f) => a + f.valor, 0)),
    porFaturar: tranches.filter((t) => !faturas.some((f) => f.tranche === t.id)),
    porPagar: faturas.filter((f) => !f.pagamento),
    pagas,
    completo: tranches.every((t) => faturas.some((f) => f.tranche === t.id && !!f.pagamento)),
  };
}

/** A tranche cujo pagamento põe a obra a andar, pela regra. */
export function trancheDoDisparo(tranches: Tranche[], regra: RegraDisparo = DISPARO): Tranche | undefined {
  return regra === "primeira" ? tranches[0] : tranches[tranches.length - 1];
}

/** Já se pode pôr a obra a andar? Com "primeira", basta a 1.ª tranche paga; com "ultima", têm de estar todas pagas. */
export function disparaObra(tranches: Tranche[], faturas: FaturaReg[], regra: RegraDisparo = DISPARO): boolean {
  if (!tranches.length) return false;
  const paga = (t: Tranche) => faturas.some((f) => f.tranche === t.id && !!f.pagamento);
  return regra === "primeira" ? paga(tranches[0]) : tranches.every(paga);
}

/** "22/09" ou "hoje" (como o motor guarda a data da fatura) → AAAA-MM-DD. */
export function isoDe(q: string, hoje: string): string {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(q);
  return m ? `${hoje.slice(0, 4)}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : hoje;
}

/** AAAA-MM-DD → DD/MM/AAAA. */
export const dataPT = (iso: string): string => (iso ? iso.split("-").reverse().join("/") : "");

/** As faturas do motor (a fatura única de fin) passadas para tranches: a fatura conta como a 1.ª tranche. */
export function daFaturaUnica(fin: { fatura: { n: string; q: string } | null; pago: boolean; recibo: { n: string; q: string } | null },
  tranches: Tranche[], total: number, hoje: string, dataPag?: string, conta?: string, ref?: string): FaturaReg[] {
  if (!fin.fatura || !tranches.length) return [];
  const t = tranches[0];
  const f: FaturaReg = { id: `demo-${t.id}`, numero: fin.fatura.n, data: isoDe(fin.fatura.q, hoje), valor: valorTranche(total, tranches, t.id), tranche: t.id, daDemo: true };
  if (fin.pago && fin.recibo) { f.pagamento = { data: dataPag || isoDe(fin.recibo.q, hoje), conta: conta || "", ref: ref || "" }; f.recibo = fin.recibo.n; }
  return [f];
}
