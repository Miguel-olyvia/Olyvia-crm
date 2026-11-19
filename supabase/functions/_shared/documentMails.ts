// Emails e SMS ao CLIENTE sobre propostas e contratos, no IDIOMA DO DOCUMENTO. Puro: sem rede, sem Deno.
// Antes viviam escritos (em portugues) dentro de send-proposal-email, send-verification-code,
// create-client-portal-access, sms-otp e client-portal-action. O portugues sai IDENTICO ao que saia (golden em
// __tests__/fixtures/documentMailsPt.golden.json, capturado do codigo original antes de o alterar).
//
// Regras (decididas com o utilizador):
//  - `langs` e o resultado de mailLangsOf() (documentLanguage.ts): um idioma = tudo nele; dois = os EMAILS levam a
//    primeira versao e a seguir a segunda, no mesmo corpo, com assunto bilingue «A / B». Sem `langs` = portugues.
//  - Os textos do utilizador (mensagem, assunto escrito a mao, nomes, titulos, descricao) ficam como estao.
//  - Dinheiro, numeros e a data numerica nao mudam de formato com o idioma.
//  - O SMS do codigo e as mensagens de erro mostradas no ecra usam um so idioma (o primeiro da escolha).

import { MAIL_TEXTS } from "./emailDefaults.ts";
import type { MailLang } from "./emailDefaults.ts";

export interface BuiltDocumentMail {
  subject: string;
  html: string;
}

/** Substitui {chaves} num texto do dicionario numa so passagem (um valor nunca e re-substituido). */
export function fillText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

function usable(langs: readonly MailLang[] | undefined): MailLang[] {
  return langs && langs.length > 0 ? [...langs] : ["pt"];
}

// ─── Email da proposta (send-proposal-email) ──────────────────────────────

interface ProposalTemplateLike {
  primary_color?: string | null;
  logo_url?: string | null;
  footer_text?: string | null;
  design_settings?: { versions?: Record<string, { footer_text?: unknown } | undefined> } | null;
}

export interface ProposalMailData {
  title: string;
  description?: string | null;
  currency?: string | null;
  value: number;
  valid_until?: string | null;
  /** A copia congelada manda sobre o modelo vivo (ver send-proposal-email). */
  template_snapshot?: ProposalTemplateLike | null;
  proposal_templates?: ProposalTemplateLike | null;
}

export interface ProposalEmailParams {
  proposal: ProposalMailData;
  publicUrl: string;
  customMessage?: string;
  senderName?: string;
  /** Assunto escrito pelo utilizador; sem ele, o por omissao no(s) idioma(s). */
  subject?: string;
  langs?: MailLang[];
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Rodape do modelo no idioma: o da versao (design_settings.versions.<idioma>.footer_text) se tiver texto; senao o base. */
function proposalFooterText(template: ProposalTemplateLike | null | undefined, lang: MailLang): string | null | undefined {
  if (lang !== "pt") {
    const versionText = template?.design_settings?.versions?.[lang]?.footer_text;
    if (typeof versionText === "string" && versionText.trim() !== "") return versionText;
  }
  return template?.footer_text;
}

function proposalHead(title: string, primaryColor: string, logoUrl: string | null | undefined): string {
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" style="max-height: 60px; margin-bottom: 20px;">`
    : "";
  return [
    "",
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>${title}</title>`,
    "</head>",
    `<body style="margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background-color: #f5f5f5;">`,
    '  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">',
    "    <tr>",
    '      <td align="center">',
    '        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">',
    "          <!-- Header -->",
    "          <tr>",
    `            <td style="background: linear-gradient(135deg, ${primaryColor}, #1e40af); padding: 40px; text-align: center;">`,
    `              ${logo}`,
    `              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${title}</h1>`,
    "            </td>",
    "          </tr>",
    "          ",
    "",
  ].join("\n");
}

function proposalContent(
  proposal: ProposalMailData,
  publicUrl: string,
  primaryColor: string,
  lang: MailLang,
  opts: { customMessage?: string; senderName?: string; showDescription: boolean },
): string {
  const t = MAIL_TEXTS[lang].documents.proposalMail;
  const intro = opts.senderName ? fillText(t.introWithSender, { name: opts.senderName }) : t.introNoSender;
  const message = opts.customMessage
    ? `
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  ${escapeHtmlText(opts.customMessage)}
                </p>
              `
    : `
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  ${intro}
                </p>
              `;
  const description = opts.showDescription && proposal.description
    ? `
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
                  ${escapeHtmlText(proposal.description?.substring(0, 200) ?? "")}${proposal.description.length > 200 ? "..." : ""}
                </p>
              `
    : "";
  const validUntil = proposal.valid_until
    ? `
                <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 24px;">
                  ${t.validUntil} <strong>${new Date(proposal.valid_until).toLocaleDateString("pt-PT")}</strong>
                </p>
              `
    : "";
  return [
    "          <!-- Content -->",
    "          <tr>",
    '            <td style="padding: 40px;">',
    `              ${message}`,
    "              ",
    `              ${description}`,
    "              ",
    "              <!-- Value Box -->",
    '              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px;">',
    "                <tr>",
    '                  <td style="padding: 20px; text-align: center;">',
    `                    <p style="color: #6b7280; margin: 0 0 8px 0; font-size: 14px;">${t.valueLabel}</p>`,
    `                    <p style="color: ${primaryColor}; margin: 0; font-size: 32px; font-weight: bold;">`,
    `                      ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: proposal.currency || "EUR" }).format(proposal.value)}`,
    "                    </p>",
    "                  </td>",
    "                </tr>",
    "              </table>",
    "              ",
    `              ${validUntil}`,
    "              ",
    "              <!-- CTA Button -->",
    '              <table width="100%" cellpadding="0" cellspacing="0">',
    "                <tr>",
    '                  <td align="center">',
    `                    <a href="${publicUrl}" style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">`,
    `                      ${t.cta}`,
    "                    </a>",
    "                  </td>",
    "                </tr>",
    "              </table>",
    "            </td>",
    "          </tr>",
    "          ",
    "",
  ].join("\n");
}

function proposalFooter(template: ProposalTemplateLike | null | undefined, langs: MailLang[]): string {
  const shown: string[] = [];
  const paragraphs = langs.map((lang) => {
    const auto = MAIL_TEXTS[lang].documents.proposalMail.sentAutomatically;
    const text = proposalFooterText(template, lang);
    // O mesmo texto de rodape nos dois idiomas (sem versao propria) aparece uma so vez.
    const footer = text && !shown.includes(text)
      ? `
                <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0 0;">
                  ${text}
                </p>
              `
      : "";
    if (text) shown.push(text);
    return [
      '              <p style="color: #9ca3af; font-size: 12px; margin: 0;">',
      `                ${auto}`,
      "              </p>",
      `              ${footer}`,
    ].join("\n");
  });
  return [
    "          <!-- Footer -->",
    "          <tr>",
    '            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">',
    paragraphs.join("\n"),
    "            </td>",
    "          </tr>",
    "        </table>",
    "      </td>",
    "    </tr>",
    "  </table>",
    "</body>",
    "</html>",
  ].join("\n");
}

/** Email da proposta ao cliente (send-proposal-email). O pixel de leitura e acrescentado por quem o envia. */
export function buildProposalEmail(p: ProposalEmailParams): BuiltDocumentMail {
  const langs = usable(p.langs);
  const template = p.proposal.template_snapshot || p.proposal.proposal_templates;
  const primaryColor = template?.primary_color || "#3b82f6";
  const blocks = langs.map((lang, i) =>
    proposalContent(p.proposal, p.publicUrl, primaryColor, lang, {
      // A mensagem e a descricao sao do utilizador: so aparecem uma vez, no primeiro bloco.
      customMessage: i === 0 ? p.customMessage : undefined,
      senderName: p.senderName,
      showDescription: i === 0,
    })
  );
  const html = proposalHead(p.proposal.title, primaryColor, template?.logo_url) +
    blocks.join("") + proposalFooter(template, langs) + "\n  ";
  const subject = p.subject ||
    langs.map((lang) => fillText(MAIL_TEXTS[lang].documents.proposalMail.subject, { title: p.proposal.title })).join(" / ");
  return { subject, html };
}

// ─── Email do codigo de verificacao (send-verification-code) ──────────────

interface VerificationTemplateLike {
  verification_email_subject?: string | null;
  verification_email_body?: string | null;
  design_settings?: {
    versions?: Record<string, { verification_email_subject?: unknown; verification_email_body?: unknown } | undefined>;
  } | null;
}

export interface VerificationMailParams {
  code: string;
  proposalTitle: string;
  /**
   * Como chega no pedido. O corpo trata a falta de acao como «accept» (como o codigo guardado); o ASSUNTO por
   * omissao so diz «Aceitar» com «accept» explicito (como sempre fez). Preservado para o portugues sair identico.
   */
  action?: "accept" | "reject" | "" | null;
  /** A copia congelada da proposta (ou o modelo vivo): texto base e versoes por idioma. */
  template?: VerificationTemplateLike | null;
  langs?: MailLang[];
}

function usableText(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * Texto do email do codigo para um idioma: portugues = o texto base (como sempre);
 * outro idioma = a versao desse idioma no modelo, com fallback ao texto base. Sem nenhum, null (usa-se o por omissao).
 */
function verificationTexts(
  template: VerificationTemplateLike | null | undefined,
  lang: MailLang,
): { subject: string | null; body: string | null } {
  const baseSubject = template?.verification_email_subject || null;
  const baseBody = template?.verification_email_body || null;
  if (lang === "pt") return { subject: baseSubject, body: baseBody };
  const version = template?.design_settings?.versions?.[lang];
  return {
    subject: usableText(version?.verification_email_subject) ?? baseSubject,
    body: usableText(version?.verification_email_body) ?? baseBody,
  };
}

function verificationDefaultInner(lang: MailLang, code: string, proposalTitle: string, action: "accept" | "reject"): string {
  const t = MAIL_TEXTS[lang].documents;
  const actionWord = action === "accept" ? t.verification.actionAccept : t.verification.actionReject;
  return [
    '              <p style="color: #374151; font-size: 16px; margin-bottom: 16px;">',
    `                ${fillText(t.verification.intro, { name: t.genericClient, action: actionWord, title: proposalTitle })}`,
    "              </p>",
    "              ",
    '              <div style="background-color: #f3f4f6; border-radius: 12px; padding: 24px; margin: 24px 0;">',
    '                <p style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #111827; margin: 0;">',
    `                  ${code}`,
    "                </p>",
    "              </div>",
    "              ",
    '              <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">',
    `                ${t.verification.expires}`,
    "              </p>",
    '              <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">',
    `                ${t.verification.ignore}`,
    "              </p>",
  ].join("\n");
}

function verificationHead(title: string, bodyStyleWidth: number): string {
  return [
    "",
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>${title}</title>`,
    "</head>",
    `<body style="margin: 0; padding: 0; font-family: 'Inter', Arial, sans-serif; background-color: #f5f5f5;">`,
    '  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">',
    "    <tr>",
    '      <td align="center">',
    `        <table width="${bodyStyleWidth}" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">`,
    "",
  ].join("\n");
}

/** O fim do documento; o do modelo do utilizador termina com 4 espacos e o por omissao com 2 (como sempre). */
function verificationTail(indent: string): string {
  return [
    "        </table>",
    "      </td>",
    "    </tr>",
    "  </table>",
    "</body>",
    "</html>",
    indent,
  ].join("\n");
}

const BILINGUAL_SEPARATOR = '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">';

function distinct(values: Array<string | null>): string[] {
  const out: string[] = [];
  for (const v of values) if (v && !out.includes(v)) out.push(v);
  return out;
}

/** Email com o codigo para aceitar ou recusar a proposta. */
export function buildVerificationMail(p: VerificationMailParams): BuiltDocumentMail {
  const langs = usable(p.langs);
  const bodyAction: "accept" | "reject" = (p.action || "accept") === "accept" ? "accept" : "reject";
  const texts = langs.map((lang) => ({ lang, ...verificationTexts(p.template, lang) }));
  const title = langs.map((lang) => MAIL_TEXTS[lang].documents.verification.title).join(" / ");

  // Assunto: o do modelo (por idioma) ou o por omissao do idioma; textos de modelo iguais nao se repetem.
  const subjectParts: string[] = [];
  for (const x of texts) {
    const t = MAIL_TEXTS[x.lang].documents.verification;
    const part = x.subject
      ? x.subject.replace(/\{\{titulo_proposta\}\}/g, p.proposalTitle)
      : (p.action === "accept" ? t.subjectAccept : t.subjectReject);
    if (!subjectParts.includes(part)) subjectParts.push(part);
  }
  const subject = subjectParts.join(" / ");

  const anyCustom = texts.some((x) => x.body);
  if (!anyCustom) {
    const header = [
      "          <tr>",
      '            <td style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">',
      `              <h1 style="color: #ffffff; margin: 0; font-size: 20px;">${title}</h1>`,
      "            </td>",
      "          </tr>",
    ].join("\n");
    const cells = langs.map((lang) =>
      [
        "          <tr>",
        '            <td style="padding: 40px; text-align: center;">',
        verificationDefaultInner(lang, p.code, p.proposalTitle, bodyAction),
        "            </td>",
        "          </tr>",
      ].join("\n")
    );
    return { subject, html: verificationHead(title, 500) + header + "\n" + cells.join("\n") + "\n" + verificationTail("  ") };
  }

  // Com modelo: o corpo do modelo de cada idioma (o mesmo texto de modelo nao se repete); um idioma sem corpo
  // proprio entra com o texto por omissao.
  const seenBodies: string[] = [];
  const contents: string[] = [];
  for (const x of texts) {
    const t = MAIL_TEXTS[x.lang].documents;
    if (x.body) {
      if (seenBodies.includes(x.body)) continue;
      seenBodies.push(x.body);
      const actionWord = bodyAction === "accept" ? t.verification.actionAccept : t.verification.actionReject;
      contents.push(
        x.body
          .replace(/\{\{codigo\}\}/g, p.code)
          .replace(/\{\{titulo_proposta\}\}/g, p.proposalTitle)
          .replace(/\{\{nome_cliente\}\}/g, t.genericClient)
          .replace(/\{\{acao\}\}/g, actionWord),
      );
    } else {
      contents.push(
        `<div style="text-align: center;">\n${verificationDefaultInner(x.lang, p.code, p.proposalTitle, bodyAction)}\n              </div>`,
      );
    }
  }
  const htmlContent = contents.join(`\n              ${BILINGUAL_SEPARATOR}\n              `);
  const cell = [
    "          <tr>",
    '            <td style="padding: 40px;">',
    `              ${htmlContent}`,
    "            </td>",
    "          </tr>",
  ].join("\n");
  return { subject, html: verificationHead(title, 500) + cell + "\n" + verificationTail("    ") };
}

// ─── Email de acesso ao portal (create-client-portal-access) ──────────────

export interface PortalAccessMailParams {
  hasCredentials: boolean;
  docType: "proposal" | "quote" | "contract";
  /** Nome da ficha; null quando a ficha nao tem nome (entra «Cliente» / «Client»). */
  contactName: string | null;
  /** Nome da organizacao; null quando nao tem (entra «a empresa» / «the company»). */
  orgName: string | null;
  documentTitle: string;
  /** Quem enviou; null quando nao ha nome (entra «A equipa» / «The team»). */
  callerName: string | null;
  email: string;
  tempPassword: string;
  finalLoginUrl: string;
  linkedExistingAccount: boolean;
  langs?: MailLang[];
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function portalAccessBlock(p: PortalAccessMailParams, lang: MailLang): string {
  const t = MAIL_TEXTS[lang].documents;
  const a = t.portalAccess;
  const name = escapeHtmlAttr(p.contactName ?? t.genericClient);
  const org = escapeHtmlAttr(p.orgName ?? t.genericCompany);
  const caller = escapeHtmlAttr(p.callerName ?? t.genericTeam);
  const doc = escapeHtmlAttr(t.docLabels[p.docType]);
  const title = escapeHtmlAttr(p.documentTitle);
  const wrapOpen = '        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">';
  const footer = [
    '          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">',
    `          <p style="color: #999; font-size: 13px;">${fillText(a.sentBy, { caller, org })}</p>`,
    "        </div>",
  ].join("\n");

  if (p.hasCredentials) {
    return [
      wrapOpen,
      `          <h2 style="color: #333;">${fillText(a.greeting, { name })}</h2>`,
      `          <p>${fillText(a.credentialsIntro, { org })}</p>`,
      `          <p>${fillText(a.credentialsDocument, { doc, title })}</p>`,
      "",
      '          <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0;">',
      `            <p style="margin: 0 0 8px;"><strong>${a.accessLabel}</strong></p>`,
      `            <p style="margin: 0 0 4px;"><a href="${p.finalLoginUrl}" style="color: #2563eb;">${p.finalLoginUrl}</a></p>`,
      `            <p style="margin: 0 0 4px;"><strong>${a.emailLabel}</strong> ${escapeHtmlAttr(p.email)}</p>`,
      `            <p style="margin: 0;"><strong>${a.passwordLabel}</strong> ${p.tempPassword}</p>`,
      "          </div>",
      "",
      `          <p style="color: #666; font-size: 14px;">${a.changePassword}</p>`,
      "",
      footer,
    ].join("\n");
  }
  const linked = p.linkedExistingAccount ? `<p>${fillText(a.linkedAccount, { org })}</p>` : "";
  return [
    wrapOpen,
    `          <h2 style="color: #333;">${fillText(a.greeting, { name })}</h2>`,
    `          <p>${fillText(a.newDocument, { doc, title })}</p>`,
    `          <p>${a.accessAt} <a href="${p.finalLoginUrl}" style="color: #2563eb;">${p.finalLoginUrl}</a></p>`,
    `          ${linked}`,
    "",
    footer,
  ].join("\n");
}

/** Email de acesso (ou de novo documento) ao portal do cliente. */
export function buildPortalAccessMail(p: PortalAccessMailParams): BuiltDocumentMail {
  const langs = usable(p.langs);
  const subjects = langs.map((lang) => {
    const t = MAIL_TEXTS[lang].documents;
    const orgRaw = p.orgName ?? t.genericCompany;
    // O portugues leva o nome ja escapado no assunto (e o que o codigo sempre enviou); os outros idiomas, o nome tal como esta.
    const org = lang === "pt" ? escapeHtmlAttr(orgRaw) : orgRaw;
    const doc = lang === "pt" ? escapeHtmlAttr(t.docLabels[p.docType]) : t.docLabels[p.docType];
    return p.hasCredentials
      ? fillText(t.portalAccess.subjectWithCredentials, { org })
      : fillText(t.portalAccess.subjectNewDocument, { doc, org });
  });
  const blocks = langs.map((lang) => portalAccessBlock(p, lang));
  return {
    subject: subjects.join(" / "),
    html: "\n" + blocks.join(`\n        ${BILINGUAL_SEPARATOR}\n`) + "\n      ",
  };
}

// ─── SMS do codigo e mensagens de erro ao cliente (sms-otp, client-portal-action) ─────

/** SMS com o codigo (so no primeiro idioma da escolha). */
export function otpSmsText(code: string, lang: MailLang = "pt"): string {
  return fillText(MAIL_TEXTS[lang].documents.otpSms, { code });
}

export type PortalMessageKey =
  | "no_phone"
  | "rate_limit"
  | "sms_failed"
  | "expired"
  | "max_attempts"
  | "contract_not_signable"
  | "otp_required"
  | "contract_check_unavailable"
  | "sign_unavailable"
  | "reason_length"
  | "invalid_message"
  | "question_limit";

const MESSAGE_FIELD = {
  no_phone: "noPhone",
  rate_limit: "rateLimit",
  sms_failed: "smsFailed",
  expired: "expired",
  max_attempts: "maxAttempts",
  contract_not_signable: "contractNotSignable",
  otp_required: "otpRequired",
  contract_check_unavailable: "contractCheckUnavailable",
  sign_unavailable: "signUnavailable",
  reason_length: "reasonLength",
  invalid_message: "invalidMessage",
  question_limit: "questionLimit",
} as const;

/** Mensagem de erro que o ecra do cliente mostra, no idioma do documento. */
export function portalMessage(key: PortalMessageKey, lang: MailLang = "pt"): string {
  return MAIL_TEXTS[lang].documents.messages[MESSAGE_FIELD[key]];
}

/** «Codigo incorreto. Restam N tentativas.» / «... Solicite um novo codigo.» */
export function invalidCodeMessage(remaining: number, lang: MailLang = "pt"): string {
  const m = MAIL_TEXTS[lang].documents.messages;
  const tail = remaining > 0
    ? fillText(remaining === 1 ? m.invalidCodeRemainingOne : m.invalidCodeRemaining, { n: remaining })
    : m.invalidCodeRequestNew;
  return `${m.invalidCodeWrong} ${tail}`;
}
