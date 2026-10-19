// Ajudas dos testes do circuito do contrato à obra (19/10/2026): o que o Inventário faz às encomendas a fornecedor de um negócio, pelas regras de
// lá (enviarPo com purchase_orders.approve; receberLinhas para o Armazém Central). Corre com o perfil simulado de sempre (o Administrador).
import { executar, lerInventario } from "./inventario/loja";
import { enviarPo, poRem } from "./inventario/po";
import { receberLinhas } from "./inventario/receber";

/** As encomendas a fornecedor (não eliminadas) de uma origem ("CT 2026/1027"). */
export const posDe = (ref: string) => lerInventario().pos.filter((p) => !p.deleted && p.originKey === ref);

/** Aprova (passa a Encomendado) as encomendas a fornecedor pendentes da origem. Devolve o erro da regra ("" se correu bem). */
export function aprovarPos(ref: string): string {
  return executar((db) => { for (const p of db.pos.filter((x) => !x.deleted && x.originKey === ref && x.status === "pending")) enviarPo(db, p); }).erro;
}

/** Recebe no Armazém Central tudo o que falta das encomendas a fornecedor da origem (aprova primeiro as pendentes). */
export function receberTudo(ref: string): string {
  const e = aprovarPos(ref);
  if (e) return e;
  return executar((db) => {
    for (const p of db.pos.filter((x) => !x.deleted && x.originKey === ref && x.status !== "cancelled")) {
      const itens = p.lines.filter((l) => poRem(l) > 0).map((l) => ({ lineId: l.id, qty: poRem(l) }));
      if (itens.length) receberLinhas(db, p, itens, "LIS", null);
    }
  }).erro;
}
