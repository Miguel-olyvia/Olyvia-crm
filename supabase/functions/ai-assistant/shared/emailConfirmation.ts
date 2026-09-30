// Confirmação humana antes de enviar emails (send_quote / send_proposal).
//
// Quando chamadas pelo modelo, as tools de envio NUNCA enviam: devolvem
// requires_confirmation com confirmation_type "send_email" e um resumo para a
// UI mostrar ao utilizador. O envio só acontece quando a UI reenvia a tool pelo
// caminho pendingTool com USER_CONFIRMED_ARG=true. O index.ts retira esse campo
// dos argumentos pedidos pelo modelo, pelo que o modelo não o consegue forjar.

import type { ToolResult } from "./types.ts";

export const USER_CONFIRMED_ARG = "user_confirmed";

const MESSAGE_PREVIEW_MAX = 300;

export type SendEmailSummary = {
  document_type: "quote" | "proposal";
  document_number: string | null;
  document_title: string | null;
  recipient_email: string;
  recipient_name: string | null;
  recipients: string[];
  cc: string[];
  subject: string | null;
  message_preview: string | null;
};

export function isUserConfirmed(args: any): boolean {
  return args?.[USER_CONFIRMED_ARG] === true;
}

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0);
}

export function buildSendEmailConfirmation(input: {
  documentType: "quote" | "proposal";
  documentNumber: string | null | undefined;
  documentTitle: string | null | undefined;
  recipientEmail: string;
  args: any;
}): ToolResult {
  const rawMessage = input.args?.message ? String(input.args.message) : "";
  const preview = rawMessage.length > MESSAGE_PREVIEW_MAX
    ? `${rawMessage.slice(0, MESSAGE_PREVIEW_MAX)}…`
    : rawMessage;

  const summary: SendEmailSummary = {
    document_type: input.documentType,
    document_number: input.documentNumber ?? null,
    document_title: input.documentTitle ?? null,
    recipient_email: input.recipientEmail,
    recipient_name: input.args?.recipient_name ? String(input.args.recipient_name) : null,
    recipients: stringList(input.args?.recipients),
    cc: stringList(input.args?.cc),
    subject: input.args?.subject ? String(input.args.subject) : null,
    message_preview: preview.length > 0 ? preview : null,
  };

  const label = input.documentType === "quote" ? "do orçamento" : "da proposta";
  const ref = summary.document_number ?? summary.document_title ?? "";
  return {
    success: false,
    requires_confirmation: true,
    confirmation_type: "send_email",
    // Mostrada ao utilizador como texto do cartão de confirmação.
    message: `Confirmas o envio ${label}${ref ? ` ${ref}` : ""} para ${input.recipientEmail}? O email ainda não foi enviado.`,
    summary,
  };
}
