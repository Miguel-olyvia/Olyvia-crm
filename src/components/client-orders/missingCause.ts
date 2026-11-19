// 19/11 (auditoria, lote 2, ponto 1): porque é que a falta de uma linha da encomenda de cliente não se pode pedir ao fornecedor.
// A base diz a causa em cada linha (rpc_get_client_order_document.request_block_reason, 20270124010000), com o mesmo critério do
// pedido (fn_client_order_request_missing): sem fornecedor preferido, ou a unidade do fornecedor não converte para a do produto.
// Sem o campo (a base ainda sem a migration), vale has_preferred_supplier como antes.

export type MissingBlockReason = "no_preferred_supplier" | "incompatible_supplier_uom";

export interface MissingCauseLine {
  item_type?: string | null;
  has_preferred_supplier?: boolean | null;
  /** NULL = pode pedir-se; ausente = a base ainda não o diz. */
  request_block_reason?: string | null;
}

/** As palavras de cada causa, iguais no Inventário e no passo Materiais da obra. */
export const MISSING_CAUSE_TEXT: Readonly<Record<MissingBlockReason, string>> = {
  no_preferred_supplier: "sem fornecedor preferido: escolha um no Catálogo",
  incompatible_supplier_uom: "unidade do fornecedor incompatível",
};

const ehCausa = (x: unknown): x is MissingBlockReason => x === "no_preferred_supplier" || x === "incompatible_supplier_uom";

/**
 * A causa que impede pedir a falta desta linha ao fornecedor: a causa; `null` = pode pedir-se; `undefined` = não se sabe (serviço,
 * ou a base sem o campo e sem has_preferred_supplier).
 */
export function missingBlockReason(line: MissingCauseLine): MissingBlockReason | null | undefined {
  if (line.item_type === "service") return undefined;
  if ("request_block_reason" in line && line.request_block_reason !== undefined) {
    return ehCausa(line.request_block_reason) ? line.request_block_reason : null;
  }
  if (line.has_preferred_supplier === false) return "no_preferred_supplier";
  if (line.has_preferred_supplier === true) return null;
  return undefined;
}

/** O texto da causa (vazio quando a falta se pode pedir ou não se sabe). */
export const missingCauseText = (line: MissingCauseLine): string => {
  const c = missingBlockReason(line);
  return c ? MISSING_CAUSE_TEXT[c] : "";
};

/**
 * Porque é que o botão «Pedir o que falta ao fornecedor» está desligado, quando há falta mas nenhuma linha se pode pedir.
 * Conta as linhas em falta por causa: «2 materiais sem fornecedor preferido (escolha um no Catálogo) e 1 com a unidade do
 * fornecedor incompatível». Vazio sem linhas presas.
 */
export function blockedMissingSummary(lines: readonly (MissingCauseLine & { qty_missing?: number | string | null })[]): string {
  let semForn = 0, unidade = 0;
  for (const l of lines) {
    if (!(Number(l.qty_missing) > 0)) continue;
    const c = missingBlockReason(l);
    if (c === "no_preferred_supplier") semForn++;
    else if (c === "incompatible_supplier_uom") unidade++;
  }
  const mat = (n: number) => `${n} ${n === 1 ? "material" : "materiais"}`;
  const partes = [
    semForn ? `${mat(semForn)} sem fornecedor preferido (escolha um no Catálogo)` : "",
    unidade ? `${semForn ? String(unidade) : mat(unidade)} com a unidade do fornecedor incompatível` : "",
  ].filter(Boolean);
  return partes.join(" e ");
}
