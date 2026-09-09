import { supabase } from "./supabase";
import { fetchOrgRoles } from "./ducConfig";
import type { DucStage, StageNotify } from "./ducSchema";

export interface NotifyContext {
  organizationId: string;
  ducNumber: string | null;
  clientName: string | null;
  stageNo: number;
  stageTitle: string;
  event: "enter" | "close";
  signedBy?: string | null;
  /** Link direto para o DUC (para o botão do email). */
  ducUrl?: string;
}

/**
 * Resolve os emails dos destinatários: externos → o próprio; membros → email em
 * anew_users; roles → membros da role (config.roles da org) → email. `orgId` é
 * necessário para expandir roles.
 */
async function resolveRecipientEmails(notify: StageNotify, orgId: string): Promise<string[]> {
  const emails = new Set<string>();
  const memberIds = new Set<string>();
  const roleKeys: string[] = [];
  for (const r of notify.recipients ?? []) {
    if (r.type === "email") emails.add(r.value);
    else if (r.type === "role") roleKeys.push(r.value);
    else memberIds.add(r.value);
  }
  // Expande as roles em ids de membros (uma leitura da config da org).
  if (roleKeys.length > 0) {
    const roles = await fetchOrgRoles(orgId);
    for (const key of roleKeys) {
      const role = roles.find((x) => x.key === key);
      (role?.memberIds ?? []).forEach((id) => memberIds.add(id));
    }
  }
  if (memberIds.size > 0) {
    const { data } = await supabase
      .from("anew_users")
      .select("email")
      .in("id", Array.from(memberIds));
    (data ?? []).forEach((u) => {
      if (u.email) emails.add(u.email as string);
    });
  }
  return Array.from(emails);
}

/** Escapa texto para interpolar em HTML de email (evita injeção via dados). */
function esc(s: string | number | null | undefined): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

function buildHtml(ctx: NotifyContext): string {
  const closed = ctx.event === "close";
  const accent = closed ? "#10b981" : "#0d9488";
  const title = closed ? "Etapa fechada" : "Etapa ativa";
  const line = closed
    ? `A etapa <strong>${ctx.stageNo}. ${esc(ctx.stageTitle)}</strong> foi fechada${
        ctx.signedBy ? ` por <strong>${esc(ctx.signedBy)}</strong>` : ""
      }.`
    : `A etapa <strong>${ctx.stageNo}. ${esc(ctx.stageTitle)}</strong> está agora ativa e aguarda ação.`;
  const button = ctx.ducUrl
    ? `<a href="${esc(ctx.ducUrl)}" style="display:inline-block;margin-top:16px;background:${accent};color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Abrir DUC</a>`
    : "";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <div style="border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
      <div style="background:${accent};height:6px"></div>
      <div style="padding:24px">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${accent};font-weight:700">${title}</p>
        <h1 style="margin:0 0 12px;font-size:18px">DUC ${esc(ctx.ducNumber)}${
          ctx.clientName ? ` · ${esc(ctx.clientName)}` : ""
        }</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#334155">${line}</p>
        ${button}
      </div>
    </div>
    <p style="margin:14px 2px 0;font-size:11px;color:#94a3b8">Documento Único de Cliente · notificação automática</p>
  </div>`;
}

/**
 * Notifica o RESPONSÁVEL atribuído a uma etapa (assignee) de que é a vez dele —
 * independentemente dos destinatários/`onEnter` configurados na etapa. Usado
 * quando a etapa passa a ativa (fecho da anterior) ou ao (re)atribuir a etapa
 * atual. Best-effort: resolve o email do membro e envia; nunca bloqueia a UI.
 */
export async function notifyAssignee(assigneeId: string, ctx: NotifyContext): Promise<void> {
  if (!assigneeId) return;
  try {
    const { data } = await supabase
      .from("anew_users")
      .select("email")
      .eq("id", assigneeId)
      .maybeSingle();
    const email = data?.email as string | undefined;
    if (!email) return;

    const subject = `DUC ${ctx.ducNumber ?? ""} · Etapa ${ctx.stageNo} atribuída a ti`.trim();
    await supabase.functions.invoke("send-email", {
      body: {
        organization_id: ctx.organizationId,
        to: email,
        recipients: [email],
        subject,
        html: buildHtml({ ...ctx, event: "enter" }),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[DUC] falha ao notificar responsável da etapa:", e);
  }
}

/**
 * Notifica (por email, via `send-email` com o SMTP da organização) os destinatários
 * configurados de uma etapa. Best-effort: nunca lança nem bloqueia a UI.
 * Depende de: função `send-email` publicada + SMTP configurado na organização.
 */
export async function notifyStage(stage: DucStage, ctx: NotifyContext): Promise<void> {
  const notify = stage.notify;
  if (!notify) return;
  if (ctx.event === "enter" && !notify.onEnter) return;
  if (ctx.event === "close" && !notify.onClose) return;

  try {
    const emails = await resolveRecipientEmails(notify, ctx.organizationId);
    if (emails.length === 0) return;

    const subject =
      ctx.event === "close"
        ? `DUC ${ctx.ducNumber ?? ""} · Etapa ${ctx.stageNo} fechada`.trim()
        : `DUC ${ctx.ducNumber ?? ""} · Etapa ${ctx.stageNo} ativa`.trim();

    await supabase.functions.invoke("send-email", {
      body: {
        organization_id: ctx.organizationId,
        to: emails[0],
        recipients: emails,
        subject,
        html: buildHtml(ctx),
      },
    });
  } catch (e) {
    // Notificação é acessória — regista e segue.
    // eslint-disable-next-line no-console
    console.warn("[DUC] falha ao notificar etapa:", e);
  }
}
