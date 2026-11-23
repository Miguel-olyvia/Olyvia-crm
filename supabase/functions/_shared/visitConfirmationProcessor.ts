// Processa as linhas da fila visit_confirmation_sends ja reclamadas
// (fn_visit_confirmation_claim: status 'sending', attempts ja incrementado).
// Sem Deno.serve nem rede directa: envio, lembretes e relogio entram por
// dependencias, para se testar com uma base em memoria.
//
// Regras (desenho vault/ficheiros/agendamento/confirmacao-da-visita-ao-confirmar-na-agenda.md):
//  - so sai para visita ainda 'confirmed', em modo 'agenda_confirm', futura e,
//    nas linhas automaticas, a mesma hora que estava quando foi enfileirada;
//  - canal desligado no formulario ou sem contacto: 'skipped' com o motivo;
//  - falha: volta a fila com espera crescente; a 3.a fica 'failed' e avisa o
//    comercial no sino;
//  - lembretes (e o link "Confirmo") criam-se aqui, depois de cancelar os
//    lembretes antigos da visita, na primeira linha automatica dessa visita+hora
//    que termine bem ou de vez (enviada, saltada por canal/contacto, ou falhada
//    na ultima tentativa) e que ainda nao os tenha criado
//    (visit_confirmation_sends.reminders_created_at). Uma tentativa que volta a
//    fila nao os cria; a seguinte cria;
//  - linha tecnica kind 'reminders' (visita reconfirmada a MESMA hora): so refaz
//    os lembretes se nao ha nenhum activo; nunca envia nada ao cliente;
//  - orcamento de tempo (deps.shouldStop): passado o orcamento deixa de pegar em
//    linhas novas e devolve as nao tratadas a 'pending', sem gastar a tentativa;
//  - linhas devolvidas pela base ja como 'failed' (presas em 'sending' e sem
//    tentativas por gastar): so se avisa o comercial no sino.

import { loadFormEmailConfig, buildManageUrl } from "./formEmails.ts";
import type { FormEmailConfig } from "./formEmails.ts";
import { defaultLocaleFromSettings, resolveLeadLocale } from "./emailDefaults.ts";
import { loadVisitTechnicians } from "./reminderRunner.ts";
import { formatVisitWhen } from "./reminderContent.ts";
import { anyReminderEnabled, reminderRuleFor } from "./reminderRule.ts";
import type { CreateReminderLinesParams, CreateReminderLinesResult } from "./reminderLines.ts";
import {
  buildConfirmationEmailContent,
  buildConfirmationSmsText,
  decideAfterAttempt,
  normalizeSendOn,
} from "./visitConfirmation.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (table: string) => any };

export type ConfirmationChannel = "email" | "sms";

export interface ClaimedConfirmationRow {
  id: string;
  organization_id: string;
  schedule_item_id: string;
  /** 'reminders' so na linha tecnica (kind 'reminders'): nao e um canal de envio. */
  channel: ConfirmationChannel | "reminders";
  kind: "auto" | "resend" | "reminders";
  visit_start_snapshot: string;
  attempts: number;
  /** 'sending' nas reclamadas; 'failed' nas que a base devolve por terem caducado. */
  status?: string;
  error_message?: string | null;
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export interface ProcessorDeps {
  supabase: SupabaseLike;
  sendEmail: (p: { organizationId: string; smtpId: string | null; to: string; subject: string; html: string }) => Promise<SendResult>;
  sendSms: (p: { toPhone: string; message: string }) => Promise<SendResult>;
  createReminders: (p: CreateReminderLinesParams) => Promise<CreateReminderLinesResult>;
  siteUrl: string;
  now: () => Date;
  /**
   * Orcamento de tempo: perguntado antes de cada visita e de cada linha seguinte.
   * Devolve true quando ja nao ha tempo para pegar em mais nada.
   */
  shouldStop?: () => boolean;
}

export interface ProcessSummary {
  processed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  reminders: number;
  /** Reclamadas mas devolvidas a 'pending' por falta de tempo. */
  released: number;
  /** Caducadas em 'sending' e falhadas de vez pela base: so se avisou o comercial. */
  interrupted: number;
}

/** Motivos de 'skipped' (codigos: o ecra traduz-os). */
export type SkipReason =
  | "visit_gone"
  | "mode_booking"
  | "not_confirmed"
  | "past"
  | "time_changed"
  | "email_disabled"
  | "sms_disabled"
  | "no_email"
  | "no_phone"
  | "reminders_only";

/** Motivos em que a visita continua valida: nao sai este canal, mas os lembretes nascem. */
const VALID_VISIT_SKIPS: ReadonlySet<string> = new Set(["email_disabled", "sms_disabled", "no_email", "no_phone"]);

interface VisitItem {
  id: string;
  organization_id: string;
  status: string;
  start_datetime: string;
  location: string | null;
  metadata: Record<string, unknown> | null;
  lead_id: string | null;
  client_id: string | null;
  confirmation_send_on: string | null;
  created_by: string | null;
}

interface VisitContext {
  item: VisitItem;
  formId: string | null;
  formSettings: unknown;
  emailCfg: FormEmailConfig | null;
  agendaSmtpId: string | null;
  agendaSmsIncludeLink: boolean;
  leadId: string | null;
  clientId: string | null;
  ownerUserId: string | null;
  locale: string | null;
  name: string;
  email: string;
  phone: string;
  companyName: string;
  technicians: { email: string; userId: string | null; name: string }[];
}

const SAME_INSTANT = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

function failIf(error: unknown, what: string): void {
  if (error) throw new Error(`leitura falhou (${what}): ${errMessage(error)}`);
}

/** Configuracao minima para visitas sem formulario: texto por omissao, sem modelos. */
function agendaEmailCfg(includeSmsLink: boolean): FormEmailConfig {
  return {
    confirmation_email_enabled: true,
    confirmation_email_template_id: null,
    confirmation_sms_enabled: true,
    confirmation_sms_message: null,
    confirmation_sms_include_link: includeSmsLink,
    email_locale_templates: null,
    booking_manage_url_template: null,
    email_smtp_id: null,
    primary_color: null,
    logo_url: null,
  } as FormEmailConfig;
}

async function loadContext(db: SupabaseLike, itemId: string, orgId: string): Promise<VisitContext | null> {
  const { data: item, error: itemErr } = await db
    .from("schedule_items")
    .select("id, organization_id, status, start_datetime, location, metadata, lead_id, client_id, confirmation_send_on, created_by")
    .eq("id", itemId)
    .eq("organization_id", orgId)
    .maybeSingle();
  failIf(itemErr, "schedule_items");
  if (!item) return null;
  const visit = item as VisitItem;
  const meta = asRecord(visit.metadata);

  // metadata.form_id e editavel por quem mexe na visita: so vale se for da mesma organizacao.
  let formId: string | null = typeof meta.form_id === "string" && meta.form_id ? meta.form_id : null;
  let formSettings: unknown = null;
  if (formId) {
    const { data: form, error } = await db.from("forms").select("id, settings").eq("id", formId).eq("organization_id", orgId).maybeSingle();
    failIf(error, "forms");
    if (form) formSettings = (form as { settings?: unknown }).settings ?? null;
    else formId = null;
  }
  const emailCfg = formId ? await loadFormEmailConfig(db, formId) : null;

  const { data: settings, error: settingsErr } = await db
    .from("schedule_settings")
    .select("notify_client_smtp_id, notify_client_sms_include_link")
    .eq("organization_id", orgId)
    .maybeSingle();
  failIf(settingsErr, "schedule_settings");

  let leadId: string | null = visit.lead_id ?? (typeof meta.lead_id === "string" ? meta.lead_id : null);
  const clientId: string | null = leadId ? null : visit.client_id;
  let locale: string | null = null;
  let name = "";
  let email = "";
  let phone = "";
  let ownerUserId: string | null = null;

  if (leadId) {
    const { data: lead, error } = await db
      .from("anew_leads")
      .select("field_values, locale, created_by, assigned_to")
      .eq("id", leadId)
      .eq("organization_id", orgId)
      .maybeSingle();
    failIf(error, "anew_leads");
    if (lead) {
      const fv = asRecord((lead as Record<string, unknown>).field_values);
      const rawEmail = fv.email || fv.po_email || fv.Email || "";
      email = str(rawEmail).toLowerCase().trim();
      phone = str(fv.phone || fv.po_telefone || fv.telefone || "").trim();
      name = [fv.first_name || fv.po_nome || fv.nome || "", fv.last_name || fv.po_apelido || fv.apelido || ""]
        .map(str).filter(Boolean).join(" ").trim();
      locale = resolveLeadLocale(null, (lead as Record<string, unknown>).locale);
      ownerUserId = str((lead as Record<string, unknown>).created_by) || str((lead as Record<string, unknown>).assigned_to) || null;
    } else {
      leadId = null;
    }
  } else if (clientId) {
    const { data: client, error } = await db
      .from("anew_clients")
      .select("entity_id, created_by, assigned_to")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .maybeSingle();
    failIf(error, "anew_clients");
    const entityId = client ? str((client as Record<string, unknown>).entity_id) : "";
    if (entityId) {
      ownerUserId = str((client as Record<string, unknown>).created_by) || str((client as Record<string, unknown>).assigned_to) || null;
      const [ent, em, ph] = await Promise.all([
        db.from("anew_entities").select("display_name").eq("id", entityId).maybeSingle(),
        db.from("anew_entity_emails").select("email, is_primary").eq("entity_id", entityId),
        db.from("anew_entity_phones").select("phone_number, is_primary").eq("entity_id", entityId),
      ]);
      failIf(ent.error || em.error || ph.error, "contactos do cliente");
      const pick = (rows: unknown, key: string) => {
        const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
        const primary = list.find((r) => r.is_primary === true) ?? list[0];
        return primary ? str(primary[key]).trim() : "";
      };
      name = str(asRecord(ent.data).display_name);
      email = pick(em.data, "email").toLowerCase();
      phone = pick(ph.data, "phone_number");
    }
  }

  const { data: org, error: orgErr } = await db.from("anew_organizations").select("name").eq("id", orgId).maybeSingle();
  failIf(orgErr, "anew_organizations");

  const techs = await loadVisitTechnicians(db, itemId);

  return {
    item: visit,
    formId,
    formSettings,
    emailCfg,
    agendaSmtpId: str(asRecord(settings).notify_client_smtp_id) || null,
    agendaSmsIncludeLink: asRecord(settings).notify_client_sms_include_link === true,
    leadId,
    clientId,
    ownerUserId,
    locale,
    name: name || "Cliente",
    email,
    phone,
    companyName: str(asRecord(org).name),
    technicians: techs
      .filter((t) => !!t.email)
      .map((t) => ({ email: t.email as string, userId: t.user_id, name: t.name })),
  };
}

/** Porque esta linha nao sai, ou null se pode sair. */
function skipReasonFor(row: ClaimedConfirmationRow, ctx: VisitContext | null, now: Date): SkipReason | null {
  if (!ctx) return "visit_gone";
  if (normalizeSendOn(ctx.item.confirmation_send_on) !== "agenda_confirm") return "mode_booking";
  if (ctx.item.status !== "confirmed") return "not_confirmed";
  if (new Date(ctx.item.start_datetime).getTime() <= now.getTime()) return "past";
  if (row.kind === "auto" && !SAME_INSTANT(row.visit_start_snapshot, ctx.item.start_datetime)) return "time_changed";
  // A linha tecnica dos lembretes nao envia nada: nao depende de canal nem de contacto.
  if (row.kind === "reminders") return null;
  const cfg = ctx.emailCfg;
  if (row.channel === "email") {
    if (ctx.formId && !cfg?.confirmation_email_enabled) return "email_disabled";
    if (!ctx.email) return "no_email";
  } else {
    if (ctx.formId && !cfg?.confirmation_sms_enabled) return "sms_disabled";
    if (!ctx.phone) return "no_phone";
  }
  return null;
}

/** Link de gerir/cancelar: um token 'cancel' valido da visita, ou um novo. */
async function manageLink(db: SupabaseLike, ctx: VisitContext, siteUrl: string, now: Date): Promise<string> {
  const { data: existing } = await db
    .from("booking_tokens")
    .select("token, expires_at")
    .eq("schedule_item_id", ctx.item.id)
    .eq("action", "cancel")
    .is("used_at", null)
    .gt("expires_at", now.toISOString())
    .limit(1);
  let token = Array.isArray(existing) && existing[0] ? str((existing[0] as Record<string, unknown>).token) : "";
  if (!token) {
    const expiresAt = new Date(new Date(ctx.item.start_datetime).getTime() + 24 * 3_600_000).toISOString();
    const { data: created } = await db
      .from("booking_tokens")
      .insert({ schedule_item_id: ctx.item.id, action: "cancel", expires_at: expiresAt })
      .select("token")
      .single();
    token = str(asRecord(created).token);
  }
  if (!token) return "";
  return buildManageUrl(ctx.emailCfg?.booking_manage_url_template, ctx.locale, token, siteUrl);
}

function baseVarsFor(ctx: VisitContext, cancelLink: string, when: string): Record<string, string> {
  return {
    lead_name: ctx.name,
    client_name: ctx.name,
    lead_email: ctx.email,
    client_email: ctx.email,
    lead_phone: ctx.phone,
    company_name: ctx.companyName,
    technician_name: ctx.technicians.map((t) => t.name).filter(Boolean).join(", "),
    meeting_date: when,
    meeting_datetime: when,
    location: ctx.item.location || "",
    cancel_url: cancelLink,
  };
}

async function sendOne(
  row: ClaimedConfirmationRow,
  ctx: VisitContext,
  cancelLink: string,
  deps: ProcessorDeps,
): Promise<{ result: SendResult; recipient: string }> {
  const formDefaultLocale = defaultLocaleFromSettings(ctx.formSettings);
  const cfg = ctx.emailCfg ?? agendaEmailCfg(ctx.agendaSmsIncludeLink);
  const vars = baseVarsFor(ctx, cancelLink, "");
  if (row.channel === "email") {
    const mail = await buildConfirmationEmailContent({
      supabase: deps.supabase,
      emailCfg: cfg,
      leadLocale: ctx.locale,
      formDefaultLocale,
      startIso: ctx.item.start_datetime,
      baseVars: vars,
      leadFullName: ctx.name,
      fullLocation: ctx.item.location || "",
      technicianName: vars.technician_name,
      cancelLink,
    });
    const result = await deps.sendEmail({
      organizationId: ctx.item.organization_id,
      // Sem formulario: o SMTP escolhido na Agenda para avisos ao cliente; null = o da organizacao.
      smtpId: ctx.formId ? cfg.email_smtp_id : ctx.agendaSmtpId,
      to: ctx.email,
      subject: mail.subject,
      html: mail.html,
    });
    return { result, recipient: ctx.email };
  }
  const message = buildConfirmationSmsText({
    emailCfg: cfg,
    formSettings: ctx.formSettings,
    leadLocale: ctx.locale,
    formDefaultLocale,
    companyName: ctx.companyName,
    cancelLink,
    baseVars: vars,
    startIso: ctx.item.start_datetime,
  });
  const result = await deps.sendSms({ toPhone: ctx.phone, message });
  // Rasto persistente do SMS, como no book-slot. Fail-soft.
  try {
    await deps.supabase.from("sms_logs").insert({
      organization_id: ctx.item.organization_id,
      created_by: ctx.item.created_by,
      entity_type: ctx.leadId ? "leads" : "clients",
      entity_id: ctx.leadId ?? ctx.clientId ?? null,
      to_phone: ctx.phone,
      message,
      status: result.ok ? "sent" : "failed",
      error_message: result.ok ? null : result.error ?? null,
      sent_at: result.ok ? deps.now().toISOString() : null,
    });
  } catch (logErr) {
    console.error("[visitConfirmation] sms_logs falhou (nao fatal):", logErr);
  }
  return { result, recipient: ctx.phone };
}

async function finishRow(db: SupabaseLike, id: string, patch: Record<string, unknown>, now: Date): Promise<void> {
  const { error } = await db
    .from("visit_confirmation_sends")
    .update({ ...patch, updated_at: now.toISOString() })
    .eq("id", id)
    .eq("status", "sending");
  if (error) console.error("[visitConfirmation] gravar o resultado falhou:", errMessage(error));
}

/** Sino ao(s) comercial(is) da visita quando a confirmacao falhou de vez. Fail-soft. */
async function notifyFailure(db: SupabaseLike, ctx: VisitContext, channel: ConfirmationChannel, error: string): Promise<void> {
  try {
    const userIds = ctx.technicians.map((t) => t.userId).filter((v): v is string => !!v);
    if (userIds.length === 0) return;
    const { data: users } = await db.from("anew_users").select("id, auth_user_id").in("id", userIds);
    const label = channel === "email" ? "email" : "SMS";
    for (const u of (Array.isArray(users) ? users : []) as Record<string, unknown>[]) {
      const authId = str(u.auth_user_id);
      if (!authId) continue;
      await db.from("notifications").insert({
        user_id: authId,
        organization_id: ctx.item.organization_id,
        type: "visit_confirmation_failed",
        kind: "notification",
        title: "Confirmação da visita não enviada",
        message: `O ${label} de confirmação para ${ctx.name} falhou: ${error}. Avise o cliente ou reenvie na Agenda.`,
        link: "/scheduling",
        entity_type: "schedule_item",
        entity_id: ctx.item.id,
        data: { schedule_item_id: ctx.item.id, channel },
      });
    }
  } catch (e) {
    console.error("[visitConfirmation] aviso de falha nao gravado (nao fatal):", e);
  }
}

/** Lembretes do modo novo: cancela os antigos ligados a visita e cria os da hora confirmada. */
async function ensureReminders(ctx: VisitContext, deps: ProcessorDeps): Promise<number> {
  const cfg = ctx.emailCfg;
  if (!ctx.formId || !cfg || !anyReminderEnabled(cfg)) return 0;
  const entityId = ctx.leadId ?? ctx.clientId;
  const createdBy = ctx.ownerUserId ?? ctx.item.created_by;
  if (!entityId || !createdBy) return 0;
  const db = deps.supabase;
  const nowIso = deps.now().toISOString();
  await Promise.all([
    db.from("scheduled_emails")
      .update({ status: "cancelled", cancelled_at: nowIso, cancel_reason: "Visita confirmada: lembrete refeito para a hora confirmada" })
      .eq("schedule_item_id", ctx.item.id).eq("status", "pending"),
    db.from("scheduled_sms")
      .update({ status: "cancelled", cancelled_at: nowIso, cancel_reason: "Visita confirmada: lembrete refeito para a hora confirmada" })
      .eq("schedule_item_id", ctx.item.id).eq("status", "pending"),
  ]);

  const startIso = ctx.item.start_datetime;
  const clientRule = reminderRuleFor(cfg, "client");
  const clientInTime = clientRule.enabled
    && new Date(startIso).getTime() - clientRule.hoursBefore * 3_600_000 > deps.now().getTime();
  let confirmUrl = "";
  if (clientInTime) {
    const { data: tok } = await db
      .from("booking_tokens")
      .insert({ schedule_item_id: ctx.item.id, action: "confirm", expires_at: startIso })
      .select("token")
      .single();
    const token = str(asRecord(tok).token);
    if (token) confirmUrl = `${deps.siteUrl}/booking/confirm?token=${token}`;
  }
  const cancelLink = await manageLink(db, ctx, deps.siteUrl, deps.now());
  const when = formatVisitWhen(startIso);
  const res = await deps.createReminders({
    supabase: db,
    organizationId: ctx.item.organization_id,
    itemId: ctx.item.id,
    formId: ctx.formId,
    locale: ctx.locale,
    formDefaultLocale: defaultLocaleFromSettings(ctx.formSettings),
    cfg,
    startIso,
    entityType: ctx.leadId ? "leads" : "clients",
    entityId,
    createdBy,
    companyName: ctx.companyName,
    clientVars: baseVarsFor(ctx, cancelLink, when),
    confirmUrl,
    leadEmail: ctx.email,
    leadPhone: ctx.phone,
    address: ctx.item.location || "",
    appointmentUrl: `${deps.siteUrl.replace(/\/+$/, "")}/scheduling`,
    technicians: ctx.technicians,
    rescheduled: false,
  });
  return res.emails + res.sms;
}

/** Ja ha lembretes criados pela confirmacao para ESTA visita e ESTA hora? */
async function remindersAlreadyCreated(db: SupabaseLike, ctx: VisitContext): Promise<boolean> {
  const { data, error } = await db
    .from("visit_confirmation_sends")
    .select("visit_start_snapshot")
    .eq("schedule_item_id", ctx.item.id)
    .not("reminders_created_at", "is", null);
  failIf(error, "visit_confirmation_sends");
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  return rows.some((r) => SAME_INSTANT(str(r.visit_start_snapshot), ctx.item.start_datetime));
}

/** A visita tem lembretes pendentes (email ou SMS)? Para a linha tecnica 'reminders'. */
async function hasActiveReminders(db: SupabaseLike, itemId: string): Promise<boolean> {
  const [em, sm] = await Promise.all([
    db.from("scheduled_emails").select("id").eq("schedule_item_id", itemId).eq("status", "pending").limit(1),
    db.from("scheduled_sms").select("id").eq("schedule_item_id", itemId).eq("status", "pending").limit(1),
  ]);
  failIf(em.error || sm.error, "lembretes pendentes");
  return [em.data, sm.data].some((d) => Array.isArray(d) && d.length > 0);
}

async function stampRemindersCreated(db: SupabaseLike, id: string, now: Date): Promise<void> {
  const { error } = await db
    .from("visit_confirmation_sends")
    .update({ reminders_created_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", id);
  if (error) console.error("[visitConfirmation] marcar os lembretes como criados falhou:", errMessage(error));
}

/** Devolve linhas reclamadas e nao tratadas a 'pending', sem gastar a tentativa. Devolve quantas. */
async function releaseRows(db: SupabaseLike, rows: ClaimedConfirmationRow[], now: Date): Promise<number> {
  let released = 0;
  for (const r of rows) {
    const { error } = await db
      .from("visit_confirmation_sends")
      .update({ status: "pending", attempts: Math.max(0, r.attempts - 1), claimed_at: null, updated_at: now.toISOString() })
      .eq("id", r.id)
      .eq("status", "sending");
    // Se falhar fica em 'sending' e a limpeza da base trata-a passados 10 minutos.
    if (error) console.error("[visitConfirmation] devolver a fila falhou:", errMessage(error));
    else released++;
  }
  return released;
}

/** Linhas que a base devolveu ja falhadas (caducaram em 'sending'): avisa o comercial. Nunca lanca. */
async function noticeInterruptedRows(rows: ClaimedConfirmationRow[], deps: ProcessorDeps): Promise<number> {
  for (const row of rows) {
    if (row.channel !== "email" && row.channel !== "sms") continue;
    try {
      const ctx = await loadContext(deps.supabase, row.schedule_item_id, row.organization_id);
      if (ctx) await notifyFailure(deps.supabase, ctx, row.channel, row.error_message || "Envio interrompido");
    } catch (e) {
      console.error("[visitConfirmation] aviso do envio interrompido nao gravado (nao fatal):", errMessage(e));
    }
  }
  return rows.length;
}

/** Processa linhas ja reclamadas, agrupadas por visita. Nunca lanca: cada erro fica na linha. */
export async function processClaimedRows(rows: ClaimedConfirmationRow[], deps: ProcessorDeps): Promise<ProcessSummary> {
  const summary: ProcessSummary = { processed: 0, sent: 0, skipped: 0, retried: 0, failed: 0, reminders: 0, released: 0, interrupted: 0 };
  summary.interrupted = await noticeInterruptedRows(rows.filter((r) => r.status === "failed"), deps);

  const byItem = new Map<string, ClaimedConfirmationRow[]>();
  for (const r of rows.filter((x) => x.status !== "failed")) {
    byItem.set(r.schedule_item_id, [...(byItem.get(r.schedule_item_id) ?? []), r]);
  }

  let stopped = false;
  for (const [itemId, itemRows] of byItem) {
    const now = deps.now();
    if (!stopped && deps.shouldStop?.()) stopped = true;
    if (stopped) {
      summary.released += await releaseRows(deps.supabase, itemRows, now);
      continue;
    }

    let ctx: VisitContext | null = null;
    let loadError: string | null = null;
    try {
      ctx = await loadContext(deps.supabase, itemId, itemRows[0].organization_id);
    } catch (e) {
      loadError = errMessage(e);
    }

    let cancelLink: string | null = null;
    // 1.a linha automatica desta visita que acabou bem ou de vez: e ela que cria os lembretes.
    let reminderCarrier: ClaimedConfirmationRow | null = null;
    for (let i = 0; i < itemRows.length; i++) {
      const row = itemRows[i];
      if (i > 0 && !stopped && deps.shouldStop?.()) stopped = true;
      if (stopped) {
        summary.released += await releaseRows(deps.supabase, [row], now);
        continue;
      }
      summary.processed++;
      let visitValid = false;
      try {
        if (loadError) throw new Error(loadError);
        const skip = skipReasonFor(row, ctx, now);
        visitValid = skip === null || VALID_VISIT_SKIPS.has(skip);
        if (skip) {
          await finishRow(deps.supabase, row.id, { status: "skipped", skip_reason: skip, error_message: null }, now);
          summary.skipped++;
          // A visita e valida: os lembretes nascem mesmo que este canal nao saia.
          if (visitValid && row.kind === "auto" && !reminderCarrier) reminderCarrier = row;
          continue;
        }
        const visit = ctx as VisitContext;

        if (row.kind === "reminders") {
          // Reconfirmada a mesma hora: so refaz os lembretes se nenhum esta activo.
          const active = await hasActiveReminders(deps.supabase, visit.item.id);
          if (!active) summary.reminders += await ensureReminders(visit, deps);
          await finishRow(deps.supabase, row.id, {
            status: "skipped",
            skip_reason: "reminders_only",
            error_message: null,
            ...(active ? {} : { reminders_created_at: now.toISOString() }),
          }, now);
          summary.skipped++;
          continue;
        }

        if (row.channel !== "email" && row.channel !== "sms") throw new Error(`canal desconhecido: ${row.channel}`);
        if (cancelLink === null) cancelLink = await manageLink(deps.supabase, visit, deps.siteUrl, now);
        const { result, recipient } = await sendOne(row, visit, cancelLink, deps);
        const decision = decideAfterAttempt({ attempts: row.attempts, ok: result.ok, error: result.error, now });
        await finishRow(deps.supabase, row.id, {
          status: decision.status,
          error_message: decision.error,
          recipient,
          ...(decision.nextAttemptAt ? { next_attempt_at: decision.nextAttemptAt } : {}),
          ...(decision.status === "sent" ? { sent_at: deps.now().toISOString() } : {}),
        }, now);
        if (decision.status === "sent") summary.sent++;
        else if (decision.status === "pending") summary.retried++;
        else {
          summary.failed++;
          await notifyFailure(deps.supabase, visit, row.channel, decision.error ?? "");
        }
        // Enviada ou falhada de vez conta; a que volta a fila nao (a seguinte cria).
        if (decision.status !== "pending" && row.kind === "auto" && !reminderCarrier) reminderCarrier = row;
      } catch (e) {
        const decision = decideAfterAttempt({ attempts: row.attempts, ok: false, error: errMessage(e), now });
        await finishRow(deps.supabase, row.id, {
          status: decision.status,
          error_message: decision.error,
          ...(decision.nextAttemptAt ? { next_attempt_at: decision.nextAttemptAt } : {}),
        }, now);
        if (decision.status === "pending") summary.retried++;
        else {
          summary.failed++;
          if (visitValid && row.kind === "auto" && !reminderCarrier) reminderCarrier = row;
        }
      }
    }

    if (reminderCarrier && ctx) {
      try {
        if (!(await remindersAlreadyCreated(deps.supabase, ctx))) {
          summary.reminders += await ensureReminders(ctx, deps);
          await stampRemindersCreated(deps.supabase, reminderCarrier.id, deps.now());
        }
      } catch (e) {
        // Sem marca: a proxima linha desta visita e hora volta a tentar.
        console.error("[visitConfirmation] lembretes nao criados (nao fatal):", errMessage(e));
      }
    }
  }
  return summary;
}
