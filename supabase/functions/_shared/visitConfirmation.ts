// Confirmacao da visita ao cliente: o que e partilhado entre o book-slot (modo
// 'booking', envia logo ao marcar, como sempre) e a send-visit-confirmation
// (modo 'agenda_confirm', envia quando a EMPRESA confirma na Agenda).
//
// Montagem do email e do SMS extraida do book-slot SEM mudar o resultado: o
// book-slot chama estas funcoes onde antes tinha o codigo inline.
//
// Leituras das colunas novas (migration 20261229600000) passam todas por aqui e
// sao tolerantes: se a coluna ainda nao existir (codigo publicado antes da
// migration), o resultado e o comportamento de hoje, nunca um erro.

import { loadTemplate, pickTemplateChoice, renderSubject } from "./formEmails.ts";
import type { FormEmailConfig } from "./formEmails.ts";
import { contentLang, defaultConfirmationSms, formatVisitDate, normalizeMailLang } from "./emailDefaults.ts";
import { buildBookingConfirmationMail } from "./bookingMails.ts";
import type { BuiltMail } from "./bookingMails.ts";
import { pickConfirmationSms, smsByLocaleFromSettings } from "./confirmationSms.ts";

export type ConfirmationSendOn = "booking" | "agenda_confirm";

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any };

/** So 'agenda_confirm' liga o modo novo; o resto (null, vazio, desconhecido) e o de hoje. */
export function normalizeSendOn(value: unknown): ConfirmationSendOn {
  return value === "agenda_confirm" ? "agenda_confirm" : "booking";
}

/** Modo do formulario (form_branding.confirmation_send_on). Qualquer erro = 'booking'. */
export async function loadFormConfirmationSendOn(
  supabase: SupabaseLike,
  formId: string | null | undefined,
): Promise<ConfirmationSendOn> {
  if (!formId) return "booking";
  try {
    const { data, error } = await supabase
      .from("form_branding")
      .select("confirmation_send_on")
      .eq("form_id", formId)
      .maybeSingle();
    if (error) return "booking";
    return normalizeSendOn((data as { confirmation_send_on?: unknown } | null)?.confirmation_send_on);
  } catch {
    return "booking";
  }
}

export interface VisitConfirmationState {
  mode: ConfirmationSendOn;
  /** Ja saiu alguma confirmacao (qualquer canal, qualquer hora) para esta visita. */
  everSent: boolean;
}

/** Modo gravado na visita e se a confirmacao ja saiu. Qualquer erro = modo de hoje. */
export async function loadVisitConfirmationState(
  supabase: SupabaseLike,
  itemId: string,
): Promise<VisitConfirmationState> {
  const fallback: VisitConfirmationState = { mode: "booking", everSent: false };
  try {
    const { data: item, error } = await supabase
      .from("schedule_items")
      .select("confirmation_send_on")
      .eq("id", itemId)
      .maybeSingle();
    if (error || !item) return fallback;
    const mode = normalizeSendOn((item as { confirmation_send_on?: unknown }).confirmation_send_on);
    if (mode === "booking") return fallback;
    const { data: sent, error: sentErr } = await supabase
      .from("visit_confirmation_sends")
      .select("id")
      .eq("schedule_item_id", itemId)
      .eq("status", "sent")
      .limit(1);
    if (sentErr) return { mode, everSent: false };
    return { mode, everSent: Array.isArray(sent) && sent.length > 0 };
  } catch {
    return fallback;
  }
}

/**
 * Regra 4: no modo novo, mudar a hora ou o comercial ANTES de a confirmacao ter
 * saido nao avisa o cliente (ele ainda nao recebeu nada a corrigir). Depois de
 * saida, o aviso «remarcada» segue os interruptores de hoje.
 */
export function shouldSuppressClientChangeNotice(state: VisitConfirmationState): boolean {
  return state.mode === "agenda_confirm" && !state.everSent;
}

const REMINDER_OK_STATUSES = new Set(["confirmed", "in_progress", "completed"]);

/** Motivo gravado no lembrete cancelado pela defesa do modo novo. */
export const REASON_AWAITING_AGENDA_CONFIRMATION =
  "Visita por confirmar na Agenda: o lembrete e refeito quando a visita for confirmada";

/**
 * Defesa do processador de lembretes: no modo novo, um lembrete de uma visita que
 * nao esta confirmada (ex.: remarcada depois de confirmada, a espera de nova
 * confirmacao) nao sai -- cancela-se; a confirmacao nova cria os seus.
 */
export function shouldCancelReminderForVisit(mode: unknown, status: unknown): boolean {
  if (normalizeSendOn(mode) !== "agenda_confirm") return false;
  return !REMINDER_OK_STATUSES.has(String(status ?? ""));
}

/**
 * Uma linha em 'sending' ha mais tempo que isto foi deixada para tras (a funcao
 * caiu). E o mesmo limiar da limpeza em fn_visit_confirmation_claim (SQL: 10 minutos).
 */
export const STALE_SENDING_MINUTES = 10;

/** So o que `rpc` precisa do cliente com o JWT do utilizador (testavel sem rede). */
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * O utilizador tem scheduling.items.edit? Mesma verificacao que as RPCs da base
 * usam (has_scheduling_permission). Falha FECHADA: erro, excecao ou resposta que
 * nao seja `true` = sem permissao.
 */
export async function callerCanEditSchedule(userClient: RpcClient, authUid: string): Promise<boolean> {
  if (!authUid) return false;
  try {
    const { data, error } = await userClient.rpc("has_scheduling_permission", {
      user_id: authUid,
      permission_code: "scheduling.items.edit",
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export const MAX_SEND_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 5 * 60_000;

export interface AttemptDecision {
  status: "sent" | "pending" | "failed";
  error: string | null;
  nextAttemptAt: string | null;
}

/** Depois de uma tentativa (attempts ja inclui esta): enviado, volta a fila com espera, ou falhado. */
export function decideAfterAttempt(p: { attempts: number; ok: boolean; error?: string | null; now: Date }): AttemptDecision {
  if (p.ok) return { status: "sent", error: null, nextAttemptAt: null };
  const error = (p.error ?? "").trim() || "Falha no envio (sem detalhe do fornecedor)";
  if (p.attempts >= MAX_SEND_ATTEMPTS) return { status: "failed", error, nextAttemptAt: null };
  const wait = BACKOFF_BASE_MS * 2 ** Math.max(0, p.attempts - 1);
  return { status: "pending", error, nextAttemptAt: new Date(p.now.getTime() + wait).toISOString() };
}

export interface ConfirmationEmailInput {
  supabase: SupabaseLike;
  emailCfg: FormEmailConfig;
  leadLocale: string | null;
  formDefaultLocale: string;
  startIso: string;
  baseVars: Record<string, string>;
  leadFullName: string;
  fullLocation: string;
  technicianName: string;
  cancelLink: string;
}

/**
 * Email de confirmacao ao cliente (antes inline no book-slot). Modelo do idioma
 * da pessoa, senao o da coluna unica, senao o texto por omissao no idioma da pessoa.
 * As palavras da data seguem o idioma do TEXTO realmente usado.
 */
export async function buildConfirmationEmailContent(p: ConfirmationEmailInput): Promise<BuiltMail> {
  const confChoice = pickTemplateChoice(p.emailCfg, "confirmation", p.leadLocale, p.emailCfg.confirmation_email_template_id);
  const confTpl = confChoice.id ? await loadTemplate(p.supabase, confChoice.id) : null;
  const confLang = contentLang({
    source: confChoice.source,
    templateUsed: !!confTpl?.body_html,
    personLocale: p.leadLocale,
    formDefaultLocale: p.formDefaultLocale,
  });
  const confWhen = formatVisitDate(p.startIso, confLang, false);
  return buildBookingConfirmationMail({
    template: confTpl,
    vars: { ...p.baseVars, meeting_date: confWhen, meeting_datetime: confWhen },
    lang: p.leadLocale,
    templateLang: confLang,
    leadName: p.leadFullName,
    when: confWhen,
    location: p.fullLocation || undefined,
    technicianName: p.technicianName || undefined,
    cancelUrl: p.cancelLink || undefined,
    primaryColor: p.emailCfg.primary_color,
    logoUrl: p.emailCfg.logo_url,
  });
}

export interface ConfirmationSmsInput {
  emailCfg: Pick<FormEmailConfig, "confirmation_sms_message" | "confirmation_sms_include_link">;
  /** forms.settings (texto do SMS por idioma); null sem formulario. */
  formSettings: unknown;
  leadLocale: string | null;
  formDefaultLocale: string;
  companyName: string;
  cancelLink: string;
  baseVars: Record<string, string>;
  startIso: string;
}

/**
 * Texto do SMS de confirmacao (antes inline no book-slot). A conta SMSAPI recusa
 * SMS com link de remetentes nao verificados (erro 94): {{cancel_url}} so leva o
 * link quando confirmation_sms_include_link esta ligado.
 */
export function buildConfirmationSmsText(p: ConfirmationSmsInput): string {
  const includeLink = p.emailCfg.confirmation_sms_include_link === true;
  const smsPick = pickConfirmationSms({
    column: p.emailCfg.confirmation_sms_message,
    byLocale: smsByLocaleFromSettings(p.formSettings),
    locale: p.leadLocale,
  });
  const smsTemplate = smsPick?.text ?? defaultConfirmationSms(normalizeMailLang(p.leadLocale), {
    companyName: p.companyName,
    withCancelLink: includeLink && !!p.cancelLink,
  });
  const smsWhen = formatVisitDate(
    p.startIso,
    contentLang({ source: smsPick?.source ?? "none", templateUsed: !!smsPick, personLocale: p.leadLocale, formDefaultLocale: p.formDefaultLocale }),
    false,
  );
  const smsBaseVars = { ...(includeLink ? p.baseVars : { ...p.baseVars, cancel_url: "" }), meeting_date: smsWhen, meeting_datetime: smsWhen };
  return renderSubject(smsTemplate, smsBaseVars);
}
