/**
 * Estados de contrato no portal do cliente: etiquetas por idioma e variantes de badge.
 * Usado na lista e no detalhe de contratos, para as etiquetas não divergirem.
 *
 * Os códigos (`draft`, `pending_signature`, `signed`...) vêm da base e NUNCA mudam; só se traduz a etiqueta,
 * através das chaves `pc.estado.contrato.*` dos dicionários do portal (src/portal-i18n/dicionarios).
 *
 * Decisões:
 * - `pending` / `sent` / `pending_signature` mostram «A aguardar decisão» (do detalhe), mais descritivo que
 *   «Pendente» / «Enviado». `pending_signature` é o estado que a edge function create-client-portal-access
 *   escreve ao publicar um contrato no portal; antes não tinha etiqueta e aparecia o código cru.
 * - `rejected` só existia no detalhe; está aqui com a variante «destructive».
 */
import { traduzir } from "@/portal-i18n/traduzir";

/** Código de estado -> chave do dicionário. Vários códigos podem partilhar a mesma etiqueta. */
export const CONTRACT_STATUS_LABEL_KEYS: Readonly<Record<string, string>> = {
  draft: "pc.estado.contrato.rascunho",
  pending: "pc.estado.contrato.aguardaDecisao",
  sent: "pc.estado.contrato.aguardaDecisao",
  pending_signature: "pc.estado.contrato.aguardaDecisao",
  active: "pc.estado.contrato.ativo",
  signed: "pc.estado.contrato.assinado",
  rejected: "pc.estado.contrato.rejeitado",
  expired: "pc.estado.contrato.expirado",
  cancelled: "pc.estado.contrato.anulado",
};

const temEtiqueta = (status: string): boolean =>
  Object.prototype.hasOwnProperty.call(CONTRACT_STATUS_LABEL_KEYS, status);

/**
 * A etiqueta do estado no idioma de `t` (o `t` de usePortalT). Um estado desconhecido volta como veio,
 * em vez de se inventar uma etiqueta; sem estado devolve texto vazio.
 */
export function contractStatusLabel(
  status: string | null | undefined,
  t: (chave: string) => string,
): string {
  if (!status) return "";
  return temEtiqueta(status) ? t(CONTRACT_STATUS_LABEL_KEYS[status]) : status;
}

/**
 * Etiquetas em português, para quem ainda não usa o idioma do portal. Preferir `contractStatusLabel` com o `t`
 * do utilizador: este mapa só serve o português.
 */
export const CONTRACT_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(CONTRACT_STATUS_LABEL_KEYS).map(([status, chave]) => [status, traduzir("pt", chave)]),
);

export const CONTRACT_STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  pending: "secondary",
  sent: "secondary",
  pending_signature: "secondary",
  active: "default",
  signed: "default",
  rejected: "destructive",
  expired: "destructive",
  cancelled: "destructive",
};
