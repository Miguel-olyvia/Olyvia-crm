/**
 * Textos de email do contrato de fornecedor (Fase 2). TS puro, testado no vitest.
 *
 * Usado por:
 *   - supplier-contract-action (reenviar o pedido de assinatura ao fornecedor)
 *   - create-supplier-portal-access (convite com contrato junto)
 *
 * Tudo o que vem da BD é escapado para HTML. O link é sempre o do servidor
 * (APP_URL/produção), nunca do pedido.
 */

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export interface ContractEmailInfo {
  contract_number: string;
  version: number | string;
  title: string;
  valid_until?: string | null;
}

/** "CF-2027-0001 (versão 2)" — a versão só aparece a partir da 2. */
export function contractLabel(c: ContractEmailInfo): string {
  const v = Number(c.version);
  return Number.isFinite(v) && v > 1 ? `${c.contract_number} (versão ${v})` : c.contract_number;
}

/** AAAA-MM-DD → DD/MM/AAAA; outra coisa → null. */
export function formatDatePt(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

function contractBlock(c: ContractEmailInfo): string {
  const valid = formatDatePt(c.valid_until ?? null);
  return `
        <table style="margin: 16px 0; border-collapse: collapse;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Contrato</td><td style="padding: 4px 0;"><strong>${escapeHtml(contractLabel(c))}</strong></td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Assunto</td><td style="padding: 4px 0;">${escapeHtml(c.title)}</td></tr>
          ${valid ? `<tr><td style="padding: 4px 12px 4px 0; color: #666;">V&aacute;lido at&eacute;</td><td style="padding: 4px 0;">${escapeHtml(valid)}</td></tr>` : ""}
        </table>`;
}

/** Parágrafo acrescentado ao email do convite quando leva um contrato. */
export function inviteContractParagraph(c: ContractEmailInfo): string {
  return `
        <p>Tem tamb&eacute;m um <strong>contrato de fornecedor</strong> para rever e assinar no portal
        (&aacute;rea Contratos). A assinatura &eacute; confirmada com um c&oacute;digo enviado por SMS para o seu telem&oacute;vel.</p>
        ${contractBlock(c)}`;
}

/** Email "pedido de assinatura" (reenvio a partir do CRM). */
export function buildSignatureRequestEmail(args: {
  orgName: string;
  recipientName?: string | null;
  loginUrl: string;
  contract: ContractEmailInfo;
}): { subject: string; html: string } {
  const safeOrg = escapeHtml(args.orgName || "a empresa");
  const safeName = escapeHtml(String(args.recipientName || "").trim());
  const safeUrl = escapeHtml(args.loginUrl);
  const subject = `Contrato para assinar — ${args.orgName || "Portal do Fornecedor"} (${contractLabel(args.contract)})`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #222;">
      <h2 style="color: #333;">Ol&aacute;${safeName ? `, ${safeName}` : ""}!</h2>
      <p><strong>${safeOrg}</strong> enviou-lhe um contrato de fornecedor para rever e assinar no Portal do Fornecedor.</p>
      ${contractBlock(args.contract)}
      <p>Entre em <a href="${safeUrl}" style="color: #2563eb;">${safeUrl}</a> com o seu email e password e abra a &aacute;rea Contratos.
      A assinatura &eacute; confirmada com um c&oacute;digo enviado por SMS para o seu telem&oacute;vel.</p>
      <p style="color: #666; font-size: 14px;">Se n&atilde;o concordar com o contrato, pode recus&aacute;-lo no portal indicando o motivo.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 13px;">Enviado por ${safeOrg} atrav&eacute;s da Olyvia.
      Se n&atilde;o esperava este email, pode ignor&aacute;-lo.</p>
    </div>`;
  return { subject, html };
}
