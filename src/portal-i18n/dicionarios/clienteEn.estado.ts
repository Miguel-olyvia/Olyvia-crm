// Status labels of the customer portal, in English: `pc.estado.*` keys.
// Status codes (draft, pending_signature, signed...) come from the database and never change; only the label is translated.
// Code -> key mapping in src/constants/contractStatus.ts.
export const clienteEnEstado: Record<string, string> = {
  "pc.estado.contrato.rascunho": "Draft",
  "pc.estado.contrato.aguardaDecisao": "Awaiting your decision",
  "pc.estado.contrato.ativo": "Active",
  "pc.estado.contrato.assinado": "Contract signed",
  "pc.estado.contrato.rejeitado": "Contract rejected",
  "pc.estado.contrato.expirado": "Expired",
  "pc.estado.contrato.anulado": "Cancelled",
};
