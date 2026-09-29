// Acerta os lembretes de visita com o estado ACTUAL da visita e monta o seu
// conteudo no envio. Chamado pelos processadores (process-scheduled-emails e
// process-scheduled-sms) antes de cada lote, e pelo reschedule-booking logo
// depois de mover a visita. A decisao vive em reminderReconcile.ts (pura); aqui
// so se le e se aplica.
//
// So mexe em linhas LIGADAS a visita (schedule_item_id preenchido). As restantes
// (convites, emails por fase) seguem o caminho de sempre.
//
// Regra de ferro: um ERRO de leitura nunca e ausencia. Se a visita, as linhas ou
// os comerciais nao se conseguem ler, o acerto dessa visita ABORTA (lanca) e nada
// e cancelado nem movido nesta corrida; quem chama trata a visita como "por
// acertar" e nao envia os seus lembretes.

import { loadFormEmailConfig, loadTemplate, renderSubject, scheduleEmail } from "./formEmails.ts";
import type { FormEmailConfig } from "./formEmails.ts";
import { buildAudienceVars, pickAudienceTemplateId } from "./audienceTemplates.ts";
import { buildReminderMail, parseContentVars, reminderSmsTemplate, withFreshVisitVars } from "./reminderContent.ts";
import { planReminderActions, REASON_CONTENT_UNRECOVERABLE, REASON_VISIT_GONE } from "./reminderReconcile.ts";
import type { CurrentTechnician, ReminderAction, ReminderLine } from "./reminderReconcile.ts";
import { pickReminderSender } from "./reminderSender.ts";

const DAY_MS = 86_400_000;

export interface ReconcileSummary {
  items: number;
  cancelled: number;
  moved: number;
  created: number;
  /** Visitas cujo acerto falhou nesta corrida (nada foi tocado nelas). */
  errors: number;
}

interface VisitTechnician extends CurrentTechnician {
  name: string;
}

function normEmail(e: string | null | undefined): string {
  return (e || "").trim().toLowerCase();
}

function failIf(error: unknown, what: string): void {
  if (error) {
    const msg = typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
    throw new Error(`[reminderRunner] leitura falhou (${what}): ${msg}`);
  }
}

/**
 * Comerciais actuais da visita: schedule_item_assignees -> schedule_resources -> anew_users.
 * Lanca se qualquer leitura falhar: um erro nao e "sem comerciais".
 */
export async function loadVisitTechnicians(supabase: any, itemId: string): Promise<VisitTechnician[]> {
  const { data: assignees, error: e1 } = await supabase
    .from("schedule_item_assignees")
    .select("resource_id")
    .eq("item_id", itemId);
  failIf(e1, "schedule_item_assignees");
  const resourceIds = [...new Set((assignees || []).map((a: any) => a.resource_id).filter(Boolean))];
  if (resourceIds.length === 0) return [];
  const { data: resources, error: e2 } = await supabase
    .from("schedule_resources")
    .select("id, name, user_id")
    .in("id", resourceIds);
  failIf(e2, "schedule_resources");
  const userIds = [...new Set((resources || []).map((r: any) => r.user_id).filter(Boolean))];
  if (userIds.length === 0) return [];
  const { data: users, error: e3 } = await supabase.from("anew_users").select("id, email, name").in("id", userIds);
  failIf(e3, "anew_users");
  const byId = new Map<string, any>((users || []).map((u: any) => [u.id, u]));
  const out: VisitTechnician[] = [];
  for (const r of resources || []) {
    const u = r.user_id ? byId.get(r.user_id) : null;
    if (!u) continue;
    out.push({ email: normEmail(u.email) || null, user_id: u.id, name: u.name || r.name || "" });
  }
  return out;
}

function toLine(row: any, channel: "email" | "sms"): ReminderLine {
  return {
    id: row.id,
    channel,
    audience: row.audience === "client" || row.audience === "technician" ? row.audience : null,
    recipient: channel === "email" ? normEmail(row.to_email) : (row.to_phone ?? null),
    status: row.status,
    scheduled_for: row.scheduled_for,
    visit_start_snapshot: row.visit_start_snapshot ?? null,
  };
}

const emptySummary = (): ReconcileSummary => ({ items: 0, cancelled: 0, moved: 0, created: 0, errors: 0 });

function addInto(total: ReconcileSummary, s: ReconcileSummary): void {
  total.items += s.items;
  total.cancelled += s.cancelled;
  total.moved += s.moved;
  total.created += s.created;
  total.errors += s.errors;
}

/** Visitas com lembretes pendentes cujo estado ja nao bate certo (fn_reminder_drift). */
export async function reconcileDrift(supabase: any, now: Date = new Date(), limit = 50): Promise<ReconcileSummary> {
  const total = emptySummary();
  const { data, error } = await supabase.rpc("fn_reminder_drift", { p_limit: limit });
  if (error) throw error;
  for (const r of data || []) {
    const id = r.out_item_id;
    if (!id) continue;
    try {
      addInto(total, await reconcileItem(supabase, id, now));
    } catch (err) {
      // Uma visita que nao se consegue acertar nao pode impedir as outras.
      console.error("[reminderRunner] acerto da visita abortado:", id, err);
      total.items++;
      total.errors++;
    }
  }
  return total;
}

/**
 * Acerta cada visita cujos lembretes vao sair agora. Devolve as visitas cujo
 * acerto FALHOU: os lembretes dessas ficam para o lote seguinte (nao se enviam).
 */
export async function reconcileDueItems(
  supabase: any,
  itemIds: readonly string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  const failed = new Set<string>();
  for (const itemId of itemIds) {
    try {
      await reconcileItem(supabase, itemId, now);
    } catch (err) {
      console.error("[reminderRunner] acerto da visita falhou, os lembretes ficam para o proximo lote:", itemId, err);
      failed.add(itemId);
    }
  }
  return failed;
}

export async function reconcileItem(supabase: any, itemId: string, now: Date = new Date()): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { ...emptySummary(), items: 1 };

  const { data: item, error: itemErr } = await supabase
    .from("schedule_items")
    .select("id, status, start_datetime, location, metadata, organization_id")
    .eq("id", itemId)
    .maybeSingle();
  failIf(itemErr, "schedule_items");

  const [emailsRes, smsRes] = await Promise.all([
    supabase
      .from("scheduled_emails")
      .select("id, audience, to_email, status, scheduled_for, visit_start_snapshot, form_id, locale, content_vars, entity_type, entity_id, user_id, organization_id, template_id")
      .eq("schedule_item_id", itemId),
    supabase
      .from("scheduled_sms")
      .select("id, audience, to_phone, status, scheduled_for, visit_start_snapshot, form_id, locale, content_vars, entity_type, entity_id, organization_id, message")
      .eq("schedule_item_id", itemId),
  ]);
  failIf(emailsRes.error, "scheduled_emails");
  failIf(smsRes.error, "scheduled_sms");
  const emailRows: any[] = emailsRes.data || [];
  const smsRows: any[] = smsRes.data || [];
  const lines: ReminderLine[] = [
    ...emailRows.map((r: any) => toLine(r, "email")),
    ...smsRows.map((r: any) => toLine(r, "sms")),
  ];
  if (!lines.some((l) => l.status === "pending")) return { ...summary, items: 0 };

  const meta = item?.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, any> : {};
  const formId: string | null = meta.form_id || emailRows.find((r: any) => r.form_id)?.form_id ||
    smsRows.find((r: any) => r.form_id)?.form_id || null;
  const cfg: FormEmailConfig | null = await loadFormEmailConfig(supabase, formId);
  const technicians = item ? await loadVisitTechnicians(supabase, itemId) : [];

  const actions = planReminderActions({
    lines,
    visit: item ? { status: item.status, start_datetime: item.start_datetime } : null,
    technicians,
    form: cfg ? { reminder_enabled: !!cfg.reminder_enabled, reminder_hours_before: cfg.reminder_hours_before } : null,
    now,
  });
  if (actions.length === 0) return { ...summary, items: 0 };

  const table = (channel: "email" | "sms") => (channel === "email" ? "scheduled_emails" : "scheduled_sms");
  const cancelLine = async (channel: "email" | "sms", lineId: string, reason: string) => {
    const { error } = await supabase
      .from(table(channel))
      .update({ status: "cancelled", cancelled_at: now.toISOString(), cancel_reason: reason })
      .eq("id", lineId)
      .eq("status", "pending");
    if (error) console.error("[reminderRunner] cancel failed:", lineId, error);
    else summary.cancelled++;
  };
  let moved = false;

  for (const a of actions) {
    if (a.kind === "cancel") {
      await cancelLine(a.channel, a.line_id, a.reason);
    } else if (a.kind === "move") {
      const row = (a.channel === "email" ? emailRows : smsRows).find((r: any) => r.id === a.line_id);
      // Linha religada sem variaveis guardadas: o texto guardado traz a data
      // ANTIGA escrita. Refaz-se o conteudo com a data nova; se nao der, cancela-se
      // (nunca se envia texto com uma data que ja nao e a da visita).
      let contentPatch: Record<string, unknown> = {};
      if (row && item && !parseContentVars(row.content_vars)) {
        const patch = await rebuildLegacyContent(supabase, a.channel, row, item, technicians, cfg);
        if (!patch) {
          await cancelLine(a.channel, a.line_id, REASON_CONTENT_UNRECOVERABLE);
          continue;
        }
        contentPatch = patch;
      }
      const { error } = await supabase
        .from(table(a.channel))
        .update({ scheduled_for: a.scheduled_for, visit_start_snapshot: a.snapshot, ...contentPatch })
        .eq("id", a.line_id)
        .eq("status", "pending");
      if (error) console.error("[reminderRunner] move failed:", a.line_id, error);
      else {
        summary.moved++;
        moved = true;
      }
    } else if (a.kind === "create_technician") {
      const ok = await createTechnicianLine(supabase, {
        action: a,
        itemId,
        item,
        cfg,
        formId,
        emailRows,
        technicians,
      });
      if (ok) summary.created++;
      else await markCreateAttempt(supabase, itemId, a.email, now);
    }
  }

  // Os links de confirmar e de gerir expiram com a visita; se ela mudou de hora,
  // acompanham-na (confirmar expira no inicio, gerir 24h depois).
  if (moved && item) {
    const startMs = new Date(item.start_datetime).getTime();
    await supabase.from("booking_tokens").update({ expires_at: new Date(startMs).toISOString() })
      .eq("schedule_item_id", itemId).eq("action", "confirm").is("used_at", null);
    await supabase.from("booking_tokens").update({ expires_at: new Date(startMs + DAY_MS).toISOString() })
      .eq("schedule_item_id", itemId).eq("action", "cancel").is("used_at", null);
  }

  return summary;
}

/**
 * Travao: o lembrete do comercial acrescentado nao se conseguiu criar (falta de
 * configuracao ou de variaveis). Regista a tentativa para fn_reminder_drift so
 * voltar a propor a visita passado um tempo, em vez de a devolver a cada corrida
 * e ocupar o lote. Fail-soft: sem a tabela (migration por aplicar), nao faz nada.
 */
async function markCreateAttempt(supabase: any, itemId: string, email: string, now: Date): Promise<void> {
  try {
    const { error } = await supabase
      .from("reminder_create_attempts")
      .upsert({ item_id: itemId, email, attempted_at: now.toISOString() }, { onConflict: "item_id,email" });
    if (error) console.error("[reminderRunner] nao foi possivel registar a tentativa:", itemId, error);
  } catch (err) {
    console.error("[reminderRunner] nao foi possivel registar a tentativa:", itemId, err);
  }
}

/**
 * Refaz o conteudo de uma linha religada a posteriori (sem content_vars) com a
 * hora, o local e o comercial ACTUAIS. Devolve o que gravar na linha, ou null se
 * nao for possivel (entidade que nao e lead, ficha em falta).
 */
async function rebuildLegacyContent(
  supabase: any,
  channel: "email" | "sms",
  row: any,
  item: any,
  technicians: VisitTechnician[],
  cfg: FormEmailConfig | null,
): Promise<Record<string, unknown> | null> {
  try {
    const base = await leadVarsFromEntity(supabase, row, item.organization_id);
    if (!base) return null;
    const audience = row.audience === "technician" ? "technician" : "client";
    const own = technicians.find((t) => normEmail(t.email) === normEmail(row.to_email));
    const technicianName = audience === "technician" && channel === "email"
      ? (own?.name ?? null)
      : (technicians.map((t) => t.name).filter(Boolean).join(", ") || null);
    const vars = withFreshVisitVars(base, {
      startIso: item.start_datetime,
      location: item.location,
      technicianName,
    });
    if (channel === "sms") {
      return {
        content_vars: vars,
        message: reminderSmsTemplate({
          companyName: vars.company_name,
          rescheduled: true,
          withConfirmLink: false,
          withManageLink: false,
        }),
      };
    }
    const template = row.template_id ? await loadTemplate(supabase, row.template_id) : null;
    const mail = buildReminderMail({ audience, template, vars, brand: cfg });
    return { content_vars: vars, subject: mail.subject, body_html: mail.html };
  } catch (err) {
    console.error("[reminderRunner] nao foi possivel refazer o conteudo da linha", row.id, err);
    return null;
  }
}

async function createTechnicianLine(
  supabase: any,
  ctx: {
    action: Extract<ReminderAction, { kind: "create_technician" }>;
    itemId: string;
    item: any;
    cfg: FormEmailConfig | null;
    formId: string | null;
    emailRows: any[];
    technicians: VisitTechnician[];
  },
): Promise<boolean> {
  const { action, item, cfg } = ctx;
  if (!item || !cfg) return false;
  // Molde: a linha de email do cliente (ou qualquer uma) com variaveis guardadas.
  const base = ctx.emailRows.find((r) => r.audience === "client" && parseContentVars(r.content_vars)) ||
    ctx.emailRows.find((r) => parseContentVars(r.content_vars)) ||
    ctx.emailRows[0];
  // Linhas religadas a posteriori nao trazem variaveis guardadas: para uma lead,
  // reconstroem-se a partir da ficha.
  const baseVars = base
    ? (parseContentVars(base.content_vars) ?? await leadVarsFromEntity(supabase, base, item.organization_id))
    : null;
  if (!base || !baseVars) {
    console.error("[reminderRunner] sem variaveis guardadas para criar o lembrete do comercial", ctx.itemId);
    return false;
  }
  const tech = ctx.technicians.find((t) => normEmail(t.email) === action.email);
  const locale: string | null = base.locale ?? null;
  const siteUrl = (Deno.env.get("SITE_URL") || "https://olyvia.lovable.app").replace(/\/+$/, "");

  const vars = withFreshVisitVars(
    buildAudienceVars(baseVars, "technician", {
      leadPhone: baseVars.lead_phone,
      leadEmail: baseVars.lead_email,
      address: item.location || baseVars.location || "",
      appointmentUrl: `${siteUrl}/scheduling`,
    }),
    { startIso: item.start_datetime, location: item.location, technicianName: tech?.name ?? null },
  );
  const templateId = pickAudienceTemplateId(cfg, "reminder", "technician", locale);
  const template = templateId ? await loadTemplate(supabase, templateId) : null;
  const mail = buildReminderMail({ audience: "technician", template, vars, brand: cfg });

  const sender = pickReminderSender({
    kind: "technician",
    technicianUserId: action.user_id,
    createdBy: base.user_id,
    formSmtpId: cfg.email_smtp_id,
    orgDefaultSmtpId: null,
  });
  const res = await scheduleEmail(supabase, {
    organizationId: base.organization_id ?? item.organization_id,
    userId: sender.userId,
    toEmail: action.email,
    subject: mail.subject,
    bodyHtml: mail.html,
    scheduledFor: action.scheduled_for,
    entityType: base.entity_type,
    entityId: base.entity_id,
    templateId,
    smtpId: sender.smtpId,
    link: {
      scheduleItemId: ctx.itemId,
      audience: "technician",
      formId: ctx.formId,
      locale,
      visitStartSnapshot: action.snapshot,
      contentVars: vars,
    },
  });
  return res.ok;
}

async function leadVarsFromEntity(
  supabase: any,
  base: any,
  organizationId: string,
): Promise<Record<string, string> | null> {
  if (base.entity_type !== "leads" || !base.entity_id) return null;
  const { data: lead } = await supabase.from("anew_leads").select("field_values").eq("id", base.entity_id).maybeSingle();
  if (!lead) return null;
  const fv = lead.field_values && typeof lead.field_values === "object" && !Array.isArray(lead.field_values)
    ? lead.field_values as Record<string, any>
    : {};
  const email = String(fv.email || fv.po_email || fv.Email || "").toLowerCase().trim();
  const name = [
    fv.first_name || fv.po_nome || fv.nome || "",
    fv.last_name || fv.po_apelido || fv.apelido || "",
  ].filter(Boolean).join(" ").trim() || "Cliente";
  const { data: org } = await supabase.from("anew_organizations").select("name").eq("id", base.organization_id ?? organizationId).maybeSingle();
  return {
    lead_name: name,
    client_name: name,
    lead_email: email,
    client_email: email,
    lead_phone: String(fv.phone || fv.po_telefone || fv.telefone || ""),
    company_name: org?.name || "",
    technician_name: "",
    meeting_date: "",
    meeting_datetime: "",
    location: "",
    cancel_url: "",
  };
}

/**
 * Resultado de montar o conteudo de um lembrete ligado a visita no momento do envio.
 *  - ok: usar `value`.
 *  - stored: usar o conteudo guardado na linha tal como esta (linha sem variaveis
 *    guardadas, mas cujo conteudo foi sempre refeito ao mover, ou linha nao ligada).
 *  - defer: nao enviar agora; a linha fica pendente para o proximo lote.
 *  - cancel: nao se pode enviar de forma segura; cancelar com este motivo.
 */
export type LinkedRender<T> =
  | { kind: "ok"; value: T }
  | { kind: "stored" }
  | { kind: "defer"; reason: string }
  | { kind: "cancel"; reason: string };

/**
 * Assunto e corpo de um lembrete ligado a visita, com a hora, o local e o
 * comercial ACTUAIS.
 */
export async function renderLinkedEmail(
  supabase: any,
  row: any,
): Promise<LinkedRender<{ subject: string; html: string }>> {
  try {
    const stored = parseContentVars(row.content_vars);
    if (!row.schedule_item_id || !stored) return { kind: "stored" };
    const { data: item, error } = await supabase
      .from("schedule_items")
      .select("start_datetime, location")
      .eq("id", row.schedule_item_id)
      .maybeSingle();
    if (error) return { kind: "defer", reason: "leitura da visita falhou" };
    if (!item) return { kind: "cancel", reason: REASON_VISIT_GONE };
    const cfg = await loadFormEmailConfig(supabase, row.form_id);
    const techs = await loadVisitTechnicians(supabase, row.schedule_item_id);
    const audience = row.audience === "technician" ? "technician" : "client";
    const own = techs.find((t) => normEmail(t.email) === normEmail(row.to_email));
    const technicianName = audience === "technician"
      ? (own?.name ?? null)
      : (techs.map((t) => t.name).filter(Boolean).join(", ") || null);
    const vars = withFreshVisitVars(stored, {
      startIso: item.start_datetime,
      location: item.location,
      technicianName,
    });
    const template = row.template_id ? await loadTemplate(supabase, row.template_id) : null;
    return { kind: "ok", value: buildReminderMail({ audience, template, vars, brand: cfg }) };
  } catch (err) {
    console.error("[reminderRunner] renderLinkedEmail failed, o lembrete fica para o proximo lote:", err);
    return { kind: "defer", reason: "montagem do email falhou" };
  }
}

/**
 * Texto do SMS ligado a visita, com a hora actual. Nunca devolve texto com
 * {{chavetas}} por substituir: nesse caso adia (erro transitorio) ou cancela
 * (a linha nao tem com que se refazer).
 */
export async function renderLinkedSms(supabase: any, row: any): Promise<LinkedRender<string>> {
  const message = typeof row.message === "string" ? row.message : "";
  const hasPlaceholders = /\{\{\w+\}\}/.test(message);
  try {
    const stored = parseContentVars(row.content_vars);
    if (!row.schedule_item_id) return hasPlaceholders ? { kind: "cancel", reason: REASON_CONTENT_UNRECOVERABLE } : { kind: "stored" };
    if (!stored) {
      return hasPlaceholders ? { kind: "cancel", reason: REASON_CONTENT_UNRECOVERABLE } : { kind: "stored" };
    }
    const { data: item, error } = await supabase
      .from("schedule_items")
      .select("start_datetime, location")
      .eq("id", row.schedule_item_id)
      .maybeSingle();
    if (error) return { kind: "defer", reason: "leitura da visita falhou" };
    if (!item) return { kind: "cancel", reason: REASON_VISIT_GONE };
    const techs = await loadVisitTechnicians(supabase, row.schedule_item_id);
    const vars = withFreshVisitVars(stored, {
      startIso: item.start_datetime,
      location: item.location,
      technicianName: techs.map((t) => t.name).filter(Boolean).join(", ") || null,
    });
    const text = renderSubject(message, vars);
    if (/\{\{\w+\}\}/.test(text)) return { kind: "cancel", reason: REASON_CONTENT_UNRECOVERABLE };
    return { kind: "ok", value: text };
  } catch (err) {
    console.error("[reminderRunner] renderLinkedSms failed, o lembrete fica para o proximo lote:", err);
    return { kind: "defer", reason: "montagem do SMS falhou" };
  }
}

/**
 * Lembretes de visita antigos, ainda nao ligados a nenhuma visita, de uma
 * lead/cliente: cancela-os (a visita foi cancelada ou reagendada e os lembretes
 * novos, ligados, tomam o lugar). NAO toca em emails por fase (modelo com
 * trigger_phase) nem em convites de agendamento.
 */
export async function cancelLegacyVisitReminders(
  supabase: any,
  entityType: "leads" | "clients",
  entityId: string,
  reason: string,
): Promise<{ emails: number; sms: number }> {
  const now = new Date().toISOString();
  const { data: pending } = await supabase
    .from("scheduled_emails")
    .select("id, template_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "pending")
    .is("schedule_item_id", null);
  const rows = pending || [];
  const templateIds = [...new Set(rows.map((r: any) => r.template_id).filter(Boolean))];
  const phaseBound = new Set<string>();
  if (templateIds.length > 0) {
    const { data: tpls } = await supabase.from("email_templates").select("id, trigger_phase").in("id", templateIds);
    for (const t of tpls || []) if (t.trigger_phase) phaseBound.add(t.id);
  }
  const emailIds = rows.filter((r: any) => !r.template_id || !phaseBound.has(r.template_id)).map((r: any) => r.id);
  if (emailIds.length > 0) {
    await supabase.from("scheduled_emails")
      .update({ status: "cancelled", cancelled_at: now, cancel_reason: reason })
      .in("id", emailIds).eq("status", "pending");
  }
  const { data: smsPending } = await supabase
    .from("scheduled_sms")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "pending")
    .is("schedule_item_id", null);
  const smsIds = (smsPending || []).map((r: any) => r.id);
  if (smsIds.length > 0) {
    await supabase.from("scheduled_sms")
      .update({ status: "cancelled", cancelled_at: now, cancel_reason: reason })
      .in("id", smsIds).eq("status", "pending");
  }
  return { emails: emailIds.length, sms: smsIds.length };
}
