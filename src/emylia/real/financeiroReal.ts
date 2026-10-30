// CRM (28/10/2026): o Financeiro do negócio da Emylia grava-se pelas funções do servidor (migration 20261231999700): neg_registar_fatura e
// neg_validar_pagamento. Desde essa migration, o neg_guardar_negocio ignora do JSON a fatura, o pagamento, o recibo e a encomenda de
// cliente (com o aviso "só se registam no Financeiro"). Por isso, antes de gravar o negócio, o que o ecrã registou de novo vai por elas:
// · a fatura de cada prestação do contrato (as tranches, ou a fatura única da V1: a 1.ª prestação) e de cada parcela das adendas;
// · o pagamento validado de cada uma. O recibo é o do ERP, quando a leitura do Eticadata o trouxe; senão a base numera-o (RC aaaa/n).
// O que a base devolve volta ao negócio: o número do recibo e a chave da fatura (assim o JSON que se grava a seguir bate com a base e não
// há aviso). Com a 1.ª prestação paga, a base emite a encomenda de cliente e pede ao fornecedor o que falta (fn_neg_emitir_ec_se_pronta).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Negocio } from "../motor";
import { faturasAdenda } from "../adendas";

export type OpFinanceira =
  | { k: "fatura"; chave: string; numero: string; erp: Record<string, unknown> | null }
  | { k: "pagamento"; fatura: string; valor: number | null; data: string | null; referencia: string | null; conta: string | null; reciboErp: string | null }
  // F3: anular o contrato (ou a venda direta) no negócio: neg_anular_contrato cancela a encomenda de cliente (os gatilhos estornam)
  | { k: "anular"; motivo: string };

const dia = (s: string | null | undefined): string | null => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const num = (s: unknown): number | null => { const n = typeof s === "number" ? s : Number(String(s ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
const txt = (s: unknown): string | null => { const t = String(s ?? "").trim(); return t ? t : null; };

/** Tudo o que o negócio tem registado no Financeiro, pela ordem em que se grava (faturas antes dos pagamentos). */
export function financeiroDe(d: Pick<Negocio, "fin" | "f" | "adendas"> & { anulado?: Negocio["anulado"] }): OpFinanceira[] {
  const faturas: OpFinanceira[] = [], pagamentos: OpFinanceira[] = [];
  const fin = d.fin ?? { fatura: null, pago: false, recibo: null };
  const tranches = (fin.tranches ?? []).filter((t) => !t.daDemo && txt(t.numero));
  if (tranches.length) {
    // 29/10: validado pelo cartão Pagamento (A.validar) o negócio fica pago mas a tranche não: a da fatura do negócio (ou a 1.ª por pagar)
    // conta como paga, com os dados do passo Pagamento (a regra do ecrã, v2/estadoV2.ts: faturasDe). Senão o pagamento nunca ia à base.
    const alvo = fin.pago && fin.recibo && !tranches.some((t) => t.pagamento)
      ? tranches.find((t) => t.numero.trim() === fin.fatura?.n.trim()) ?? tranches[0] : undefined;
    const rcErp = fin.erp?.recibos?.length ? fin.erp.recibos[fin.erp.recibos.length - 1].n : null;
    for (const t of tranches) {
      faturas.push({ k: "fatura", chave: t.tranche, numero: t.numero.trim(), erp: null });
      if (t.pagamento) pagamentos.push({ k: "pagamento", fatura: t.numero.trim(), valor: num(t.valor), data: dia(t.pagamento.data), referencia: txt(t.pagamento.ref), conta: txt(t.pagamento.conta), reciboErp: null });
      else if (t === alvo) pagamentos.push({ k: "pagamento", fatura: t.numero.trim(), valor: num(t.valor), data: dia(d.f?.data_pag), referencia: txt(d.f?.comprovativo), conta: txt(d.f?.conta), reciboErp: txt(rcErp) });
    }
  } else if (fin.fatura && txt(fin.fatura.n)) {
    // a V1: uma fatura, a da 1.ª prestação ("unica" é a ordem 1 para a base)
    const erp = fin.erp ? { ...fin.erp } as Record<string, unknown> : null;
    faturas.push({ k: "fatura", chave: "unica", numero: fin.fatura.n.trim(), erp });
    if (fin.pago) {
      const rcErp = fin.erp?.recibos?.length ? fin.erp.recibos[fin.erp.recibos.length - 1].n : null;
      pagamentos.push({ k: "pagamento", fatura: fin.fatura.n.trim(), valor: num(d.f?.valor_recebido), data: dia(d.f?.data_pag), referencia: txt(d.f?.comprovativo), conta: null, reciboErp: txt(rcErp) });
    }
  }
  for (const a of d.adendas ?? []) for (const f of faturasAdenda(a)) {
    if (!txt(f.n)) continue;
    faturas.push({ k: "fatura", chave: `${a.n}#${f.i}`, numero: f.n.trim(), erp: null });
    if (f.recibo) pagamentos.push({ k: "pagamento", fatura: f.n.trim(), valor: num(f.v), data: null, referencia: null, conta: null, reciboErp: null });
  }
  // F3: a anulação feita no negócio (a do Inventário vem de lá) vai depois de tudo
  const anular: OpFinanceira[] = d.anulado && d.anulado.origem === "negocio" && txt(d.anulado.motivo) ? [{ k: "anular", motivo: d.anulado.motivo.trim() }] : [];
  return [...faturas, ...pagamentos, ...anular];
}

const chaveOp = (o: OpFinanceira) => (o.k === "fatura" ? `f|${o.chave}|${o.numero}` : o.k === "anular" ? "a|" : `p|${o.fatura}`);
/** O que há de novo no Financeiro entre a última gravação e agora. */
export function novasNoFinanceiro(antes: (Pick<Negocio, "fin" | "f" | "adendas"> & { anulado?: Negocio["anulado"] }) | null, depois: Pick<Negocio, "fin" | "f" | "adendas"> & { anulado?: Negocio["anulado"] }): OpFinanceira[] {
  const ja = new Set((antes ? financeiroDe(antes) : []).map(chaveOp));
  return financeiroDe(depois).filter((o) => !ja.has(chaveOp(o)));
}

/** A função ainda não está na base (a migration por aplicar): PostgREST PGRST202, Postgres 42883. */
const semFuncao = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";

/** Põe no negócio o que a base devolveu: o recibo (o da base) e a chave da fatura. */
function aplicarResposta(d: Negocio, o: OpFinanceira, r: Record<string, unknown>): void {
  if (o.k === "anular") return;
  if (o.k === "fatura") {
    const t = d.fin.tranches?.find((x) => x.numero.trim() === o.numero);
    if (t && typeof r.chave === "string") t.id = r.chave;
    return;
  }
  const rc = typeof r.recibo === "string" ? r.recibo : null;
  if (!rc) return;
  // 30/10 (visto no browser): o ecrã numera o recibo antes de a base responder (RC 2026/301) e escreve-o no histórico; fica o da base
  const antes = [d.fin.recibo?.n, ...(d.fin.tranches ?? []).map((x) => x.recibo)].filter((x): x is string => !!x && x !== rc);
  for (const h of d.hist ?? []) for (const v of antes) if (h.t.includes(v)) h.t = h.t.split(v).join(rc);
  const t = d.fin.tranches?.find((x) => x.numero.trim() === o.fatura);
  if (t) {
    // 29/10: a tranche paga pelo cartão Pagamento fica com o pagamento; a 1.ª paga é a do negócio, que fica com o recibo da base
    t.pagamento ??= { data: o.data ?? "", conta: o.conta ?? "", ref: o.referencia ?? "" };
    t.recibo = rc;
    if (d.fin.pago && d.fin.tranches!.find((x) => x.pagamento) === t) d.fin.recibo = { n: rc, q: d.fin.recibo?.q ?? "hoje" };
    return;
  }
  if (d.fin.fatura?.n.trim() === o.fatura) { d.fin.recibo = { n: rc, q: d.fin.recibo?.q ?? "hoje" }; return; }
  for (const a of d.adendas ?? []) for (const f of faturasAdenda(a)) if (f.n.trim() === o.fatura && f.recibo) f.recibo = { ...f.recibo, n: rc };
}

/** Grava pelas funções do servidor e devolve os avisos. Um erro para (a fatura seguinte pode depender desta) e lança-se. */
export async function gravarFinanceiro(sb: SupabaseClient, org: string, negocioId: string, d: Negocio, ops: readonly OpFinanceira[]): Promise<string[]> {
  const avisos: string[] = [];
  for (const o of ops) {
    const { data, error } = o.k === "anular"
      ? await sb.rpc("neg_anular_contrato" as never, { p_org: org, p_negocio: negocioId, p_motivo: o.motivo } as never)
      : o.k === "fatura"
      ? await sb.rpc("neg_registar_fatura" as never, { p_org: org, p_negocio: negocioId, p_chave: o.chave, p_numero: o.numero, p_erp: o.erp } as never)
      : await sb.rpc("neg_validar_pagamento" as never, { p_org: org, p_negocio: negocioId, p_fatura: o.fatura, p_valor: o.valor, p_data: o.data,
          p_referencia: o.referencia, p_recibo_erp: o.reciboErp, p_conta: o.conta } as never);
    if (error) {
      if (semFuncao(error)) { avisos.push("O Financeiro ainda não está na base: a fatura e o pagamento ficam só neste ecrã."); return avisos; }
      throw new Error(error.message || (o.k === "anular" ? "Não foi possível anular o contrato." : o.k === "fatura" ? `Não foi possível registar a fatura ${o.numero}.` : `Não foi possível validar o pagamento da ${o.fatura}.`));
    }
    aplicarResposta(d, o, (data ?? {}) as Record<string, unknown>);
    // a encomenda de cliente nasceu agora (nova): a base já pediu ao fornecedor o que falta
    const ec = (data as { ec?: { emitida?: boolean; nova?: boolean } } | null)?.ec;
    if (ec?.emitida && ec.nova) avisos.push("A encomenda de cliente foi emitida no Inventário e o que falta foi pedido ao fornecedor.");
  }
  return avisos;
}
