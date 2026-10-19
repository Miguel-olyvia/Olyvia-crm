// A ordem da Receção (19/10): as encomendas a fornecedor por ordem de chegada. A data que conta é a prometida pelo fornecedor no portal (se a
// confirmou) ou a prevista da encomenda; o grupo diz o que o armazém faz com ela (chega hoje/amanhã, atrasada, confirmada, à espera, por enviar).
// Só leitura, sem React e sem campos novos: tudo calculado da PO. O poLate do resto da app fica igual (usa a prevista).
import { HOJE, fmtDS, somarDias } from "./base";
import { poRecebivel, poRem, poStatus, selarPortal } from "./po";
import type { Po, Tom } from "./tipos";

/** A data em que a encomenda chega: a prometida no portal (se confirmada) ou a prevista. */
export const dataEntregaEf = (p: Po): string => (p.portal.state === "confirmed" && p.portal.promised ? p.portal.promised : p.due);

/** Confirmada pelo fornecedor desde ontem: "NOVA" no topo da Receção. */
export const novaConfirmacao = (p: Po): boolean => p.portal.state === "confirmed" && !!p.portal.confirmed && p.portal.confirmed.slice(0, 10) >= somarDias(HOJE, -1);

/** Atrasada na Receção: a data efetiva (a prometida, se houver) já passou. */
export const atrasadaRec = (p: Po): boolean => dataEntregaEf(p) < HOJE;

export type GrupoRec = 0 | 1 | 2 | 3 | 4;
export const GRUPOS_REC: Record<GrupoRec, string> = {
  0: "Chega hoje / amanhã", 1: "Atrasadas", 2: "Confirmadas pelo fornecedor", 3: "À espera do fornecedor", 4: "Por enviar ao fornecedor",
};

/** O grupo da PO na Receção (a primeira regra que se aplica). */
export function grupoRececao(p: Po): GrupoRec {
  const d = dataEntregaEf(p);
  if ((d >= HOJE && d <= somarDias(HOJE, 1)) || novaConfirmacao(p)) return 0;
  if (d < HOJE) return 1;
  if (p.portal.state === "confirmed") return 2;
  if (p.status !== "pending") return 3;
  return 4;
}

/** A ordem dentro do grupo: no grupo 0 as confirmadas primeiro e as parciais antes das encomendadas; depois a data efetiva e o número. */
export function compararRececao(a: Po, b: Po): number {
  const ga = grupoRececao(a), gb = grupoRececao(b);
  if (ga !== gb) return ga - gb;
  if (ga === 0) {
    const c = Number(b.portal.state === "confirmed") - Number(a.portal.state === "confirmed");
    if (c) return c;
    const pa = Number(poStatus(b) === "partial") - Number(poStatus(a) === "partial");
    if (pa) return pa;
  }
  return dataEntregaEf(a).localeCompare(dataEntregaEf(b)) || a.id.localeCompare(b.id);
}

export const ordenarRececao = (L: readonly Po[]): Po[] => [...L].sort(compararRececao);

/** O selo da PO na Receção: "Por enviar" (pendente), "Confirmada p/ dd/mm" (com data prometida) ou o selo do portal de sempre. */
export function seloRececao(p: Po): readonly [string, Tom] {
  if (p.status === "pending") return ["Por enviar ao fornecedor", "warn"];
  if (p.portal.state === "confirmed" && p.portal.promised) return [`Confirmada p/ ${fmtDS(p.portal.promised)}`, "ok"];
  return selarPortal(p) ?? ["Sem envio registado", "neu"];
}

/** O que falta receber: unidades e linhas. */
export function faltaPo(p: Po): { un: number; linhas: number } {
  const L = p.lines.filter((l) => poRem(l) > 0);
  return { un: L.reduce((a, l) => a + poRem(l), 0), linhas: L.length };
}
export const textoFalta = (p: Po): string => { const f = faltaPo(p); return `${f.un} un · ${f.linhas} ${f.linhas === 1 ? "linha" : "linhas"}`; };

/** As POs por receber que chegam hoje/amanhã (o grupo 0). */
export const chegamHojePos = (pos: readonly Po[]): Po[] => pos.filter((p) => poRecebivel(p) && grupoRececao(p) === 0);
