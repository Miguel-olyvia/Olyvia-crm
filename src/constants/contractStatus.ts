/**
 * Shared contract status labels and badge variants for the client portal.
 * Used in both the contracts list and the contract detail page so labels stay in sync.
 *
 * Decisions:
 * - For `pending` / `sent` we use "A aguardar decisão" (from the detail page) — more descriptive
 *   than the previous list values ("Pendente" / "Enviado").
 * - `rejected` only existed in the detail page; added here with variant "destructive".
 */
export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending: "A aguardar decisão",
  sent: "A aguardar decisão",
  active: "Ativo",
  signed: "Contrato assinado",
  rejected: "Contrato rejeitado",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export const CONTRACT_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  pending: "secondary",
  sent: "secondary",
  active: "default",
  signed: "default",
  rejected: "destructive",
  expired: "destructive",
  cancelled: "destructive",
};
