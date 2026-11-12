// 12/11 (Rúben: «falta no estúdio da gestão da obra também os documentos enviados ao cliente»). O que foi para o portal do cliente, a
// partir do negócio: a proposta, o contrato, as faturas e os recibos, as adendas (a proposta, o contrato e as faturas de cada uma) e o auto
// de receção. Para cada um: o número, quando foi, o estado (por responder, aceite, assinado, pago…) e o tipo do aviso que o reenvia.
// O «visto pelo cliente» não se regista em lado nenhum: não se mostra.
import type { Estado, Negocio } from "../motor";
import type { DocPortal } from "../acessosPortal";
import { faturasAdenda, nomeParcela, type Adenda, type FaturaAdenda } from "../adendas";
import type { FaturaReg } from "../v2/financeiro";

export type TomDoc = "ok" | "espera" | "mau" | "neutro";
export interface DocEnviado {
  id: string;
  /** o que se abre (o documento) */
  k: "proposta" | "contrato" | "fatura" | "faturaTranche" | "propostaAdenda" | "contratoAdenda" | "faturaAdenda" | "auto";
  titulo: string; numero: string;
  /** quando foi enviado (como o motor o guarda) */
  quando: string;
  estado: string; tom: TomDoc;
  /** o aviso ao cliente que o reenvia (o acesso ao portal com este documento) */
  reenvio: DocPortal;
  a?: Adenda; ft?: FaturaAdenda; reg?: FaturaReg;
}

/** Os documentos que o cliente tem no portal, do mais antigo para o mais recente. */
export function documentosEnviados(d: Negocio, _S?: Estado): DocEnviado[] {
  const o = d.orc, L: DocEnviado[] = [];
  if (o?.enviada) {
    const v = (o.versoes?.length ?? 0) + 1;
    const est: [string, TomDoc] = o.recusada ? ["Recusada", "mau"] : o.aceite ? [`Aceite a ${o.aceite}`, "ok"] : o.pedidoCliente ? ["O cliente pediu alterações", "espera"] : ["Por responder", "espera"];
    L.push({ id: "proposta", k: "proposta", titulo: v > 1 ? `Proposta (versão ${v})` : "Proposta", numero: `PR 2026/${d.id}`, quando: o.enviada, estado: est[0], tom: est[1], reenvio: "proposta" });
  }
  if (o?.contrato) {
    const est: [string, TomDoc] = o.contrato === "assinado" ? [`Assinado${o.assinatura?.q ? ` a ${o.assinatura.q}` : ""}`, "ok"] : o.contratoPedido ? ["Cláusulas no Jurídico", "espera"] : ["Por assinar", "espera"];
    L.push({ id: "contrato", k: "contrato", titulo: "Contrato de empreitada", numero: `CT 2026/${d.id}`, quando: o.aceite ?? "", estado: est[0], tom: est[1], reenvio: "contrato" });
  }
  // as faturas do contrato: as das prestações registadas (V2) ou a única do motor
  const regs = (d.fin.tranches ?? []).filter((x) => !x.daDemo);
  if (regs.length) {
    for (const r of regs) L.push({ id: `ft-${r.id}`, k: "faturaTranche", titulo: `Fatura · ${r.tranche}`, numero: r.numero, quando: r.data.split("-").reverse().join("/"),
      estado: r.pagamento ? `Paga${r.recibo ? ` (${r.recibo})` : ""}` : "Por pagar", tom: r.pagamento ? "ok" : "espera", reenvio: "fatura", reg: r });
  } else if (d.fin.fatura) {
    L.push({ id: "fatura", k: "fatura", titulo: "Fatura", numero: d.fin.fatura.n, quando: d.fin.fatura.q, estado: d.fin.recibo ? `Paga (${d.fin.recibo.n})` : "Por pagar", tom: d.fin.recibo ? "ok" : "espera", reenvio: "fatura" });
  }
  for (const a of d.adendas ?? []) {
    if (!a.enviada && !a.versoes?.length) continue; // por disparar: nada foi ao cliente
    const est: [string, TomDoc] = a.estado === "anulada" ? ["Retirada do portal", "neutro"] : a.estado === "recusada" ? ["Recusada", "mau"]
      : a.estado === "enviada" ? (a.pedidoCliente ? ["O cliente pediu alterações", "espera"] : ["Por responder", "espera"]) : ["Aceite", "ok"];
    L.push({ id: `ad-${a.n}`, k: "propostaAdenda", titulo: `Proposta da adenda · ${a.motivo}`, numero: a.n, quando: a.enviada ?? a.criada, estado: est[0], tom: est[1], reenvio: "adenda", a });
    if (a.estado === "assinada" || (a.estado === "aceite" && a.contrato === "enviado")) {
      const assinada = a.estado === "assinada";
      L.push({ id: `cad-${a.n}`, k: "contratoAdenda", titulo: "Contrato da adenda", numero: a.n, quando: a.aceite ?? "", estado: assinada ? `Assinado${a.assinada ? ` a ${a.assinada}` : ""}` : "Por assinar", tom: assinada ? "ok" : "espera", reenvio: "contratoAdenda", a });
    }
    for (const ft of faturasAdenda(a)) {
      L.push({ id: `fta-${ft.n}`, k: "faturaAdenda", titulo: `Fatura da adenda ${a.n} · ${nomeParcela(ft.i)}`, numero: ft.n, quando: ft.q, estado: ft.recibo ? `Paga (${ft.recibo.n})` : "Por pagar", tom: ft.recibo ? "ok" : "espera", reenvio: "fatura", a, ft });
    }
  }
  const au = d.obra.auto;
  if (au) L.push({ id: "auto", k: "auto", titulo: "Auto de receção", numero: au.n, quando: au.q, estado: au.estado === "assinado" ? `Assinado${au.assinado ? ` a ${au.assinado}` : ""}` : "Por assinar", tom: au.estado === "assinado" ? "ok" : "espera", reenvio: "auto" });
  return L;
}

/** Os que esperam pelo cliente (para o número no separador). */
export const porResponder = (L: DocEnviado[]) => L.filter((x) => x.tom === "espera").length;
