import { supabase } from "./supabase";

export interface DucMessage {
  id: string;
  duc_id: string;
  organization_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  mentions: string[];
  created_at: string;
}

/** Mensagens de um DUC (ordem cronológica). */
export async function fetchMessages(ducId: string): Promise<DucMessage[]> {
  const { data } = await supabase
    .from("anew_client_duc_messages")
    .select("id, duc_id, organization_id, author_id, author_name, body, mentions, created_at")
    .eq("duc_id", ducId)
    .order("created_at", { ascending: true })
    .limit(500);
  return (data ?? []).map((m) => ({
    ...(m as DucMessage),
    mentions: Array.isArray((m as DucMessage).mentions) ? (m as DucMessage).mentions : [],
  }));
}

/** Publica uma mensagem. Devolve mensagem de erro (ou null se ok). */
export async function postMessage(input: {
  ducId: string;
  orgId: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  mentions: string[];
}): Promise<string | null> {
  const { error } = await supabase.from("anew_client_duc_messages").insert({
    duc_id: input.ducId,
    organization_id: input.orgId,
    author_id: input.authorId,
    author_name: input.authorName,
    body: input.body,
    mentions: input.mentions,
  });
  return error ? error.message : null;
}

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
  );
}

/**
 * Notifica por email (best-effort, via send-email) os membros mencionados.
 * Depende da função send-email + SMTP da org. Nunca bloqueia a UI.
 */
export async function notifyMentions(
  memberIds: string[],
  ctx: { organizationId: string; ducNumber: string | null; author: string | null; ducUrl?: string; excerpt: string }
): Promise<void> {
  try {
    if (memberIds.length === 0) return;
    const { data } = await supabase.from("anew_users").select("email").in("id", memberIds);
    const emails = Array.from(
      new Set((data ?? []).map((u) => u.email as string).filter(Boolean))
    );
    if (emails.length === 0) return;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
        <div style="border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
          <div style="background:#0d9488;height:6px"></div>
          <div style="padding:24px">
            <p style="margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#0d9488;font-weight:700">Foste mencionado</p>
            <h1 style="margin:0 0 12px;font-size:18px">DUC ${esc(ctx.ducNumber)}</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#334155"><strong>${esc(ctx.author)}</strong> mencionou-te numa mensagem:</p>
            <blockquote style="margin:12px 0 0;padding:10px 14px;border-left:3px solid #0d9488;background:#f0fdfa;border-radius:8px;color:#334155;font-size:14px">${esc(ctx.excerpt)}</blockquote>
            ${ctx.ducUrl ? `<a href="${esc(ctx.ducUrl)}" style="display:inline-block;margin-top:16px;background:#0d9488;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Abrir DUC</a>` : ""}
          </div>
        </div>
      </div>`;
    await supabase.functions.invoke("send-email", {
      body: {
        organization_id: ctx.organizationId,
        to: emails[0],
        recipients: emails,
        subject: `DUC ${ctx.ducNumber ?? ""} · Foste mencionado`.trim(),
        html,
      },
    });
  } catch {
    // best-effort
  }
}
