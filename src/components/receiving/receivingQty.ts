// 19/11 (auditoria, lote 2, ponto 2): a quantidade do cesto da Receção aceita decimais nos produtos que se medem (m², ml, kg…).
// A regra é a do servidor (rpc_receive_by_code, 20270124020000): inteiro numa embalagem ou numa unidade que se conta
// (fn_product_requires_integer_qty, a mesma lista de src/utils/quotes/integerQty.ts); decimais na unidade de um produto que se mede.
// A leitura (rpc_receiving_lookup) diz integer_qty por candidato; sem o campo (base por atualizar), decide-se pela unidade lida.
import { requiresIntegerQty } from "@/utils/quotes/integerQty";

/** Casas decimais que o campo aceita (o stock guarda 4; a linha da encomenda a fornecedor 2). */
export const RECEIVING_MAX_DECIMALS = 3;

export interface ReceivingQtyUnit {
  /** integer_qty da leitura; ausente nas entradas antigas ou vindas de uma encomenda a fornecedor. */
  integerQty?: boolean;
  uomCode: string | null;
  unitsPerUom: number;
}

/** O campo só aceita inteiros? Numa embalagem (fator ≠ 1) ou numa unidade que se conta, sim. */
export function receivingIntegerOnly(e: ReceivingQtyUnit): boolean {
  if (typeof e.integerQty === "boolean") return e.integerQty;
  return (Number(e.unitsPerUom) || 1) !== 1 || requiresIntegerQty({ hasProduct: true, baseUomCode: e.uomCode });
}

const arred = (q: number) => Math.round(q * 10 ** RECEIVING_MAX_DECIMALS) / 10 ** RECEIVING_MAX_DECIMALS;

/** O texto escrito, limpo: só algarismos (inteiro) ou algarismos com uma vírgula e até 3 casas (decimal). O ponto passa a vírgula. */
export function cleanReceivingQtyText(text: string, integer: boolean): string {
  if (integer) return text.replace(/[^\d]/g, "").slice(0, 9);
  const s = text.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const i = s.indexOf(",");
  if (i < 0) return s.slice(0, 9);
  return `${s.slice(0, i).slice(0, 9)},${s.slice(i + 1).replace(/,/g, "").slice(0, RECEIVING_MAX_DECIMALS)}`;
}

/** O número do texto («2,5» → 2.5); NaN se vazio ou inválido. */
export function parseReceivingQty(text: string): number {
  const t = text.trim().replace(",", ".");
  if (t === "" || t === ".") return Number.NaN;
  return Number(t);
}

/** O texto de uma quantidade, à portuguesa (2.5 → «2,5»). */
export const receivingQtyText = (q: number): string => String(arred(q)).replace(".", ",");

/** O texto corresponde à quantidade e esta é válida (inteiro ≥ 1, ou decimal > 0). */
export function isValidReceivingQty(text: string, qty: number, integer: boolean): boolean {
  if (text === "" || !Number.isFinite(qty)) return false;
  if (parseReceivingQty(text) !== qty) return false;
  return integer ? Number.isInteger(qty) && qty >= 1 : qty > 0;
}

/** A quantidade depois de + ou − (ou de repor): inteiro ≥ 1; decimal > 0, arredondado a 3 casas (nunca abaixo de 0,001). */
export function normalizeReceivingQty(q: number, integer: boolean): number {
  if (integer) return Math.max(1, Math.floor(Number.isFinite(q) ? q : 1));
  const v = arred(Number.isFinite(q) ? q : 1);
  return v > 0 ? v : 10 ** -RECEIVING_MAX_DECIMALS;
}

/** A mensagem do campo inválido. */
export const receivingQtyError = (integer: boolean): string =>
  integer ? "A quantidade tem de ser um número inteiro, 1 ou mais." : `A quantidade tem de ser maior que 0 (até ${RECEIVING_MAX_DECIMALS} casas decimais).`;
