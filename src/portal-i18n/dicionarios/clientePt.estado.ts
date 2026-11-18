// Etiquetas de estado do portal de cliente, em português: chaves `pc.estado.*`.
// Os códigos de estado (draft, pending_signature, signed...) vêm da base e não mudam; só se traduz a etiqueta.
// Mapeamento código -> chave em src/constants/contractStatus.ts.
export const clientePtEstado: Record<string, string> = {
  "pc.estado.contrato.rascunho": "Rascunho",
  "pc.estado.contrato.aguardaDecisao": "A aguardar decisão",
  "pc.estado.contrato.ativo": "Ativo",
  "pc.estado.contrato.assinado": "Contrato assinado",
  "pc.estado.contrato.rejeitado": "Contrato rejeitado",
  "pc.estado.contrato.expirado": "Expirado",
  "pc.estado.contrato.anulado": "Anulado",
};
