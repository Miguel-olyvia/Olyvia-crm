// duc-stale-alerts — Edge Function (Deno)
//
// Job interno/cron que percorre os DUCs abertos e, para cada um, verifica se a
// etapa ATUAL está parada há mais dias do que o `notify.alertAfterDays`
// configurado para essa etapa (em `anew_client_duc_configs.config.stages`).
// Se estiver, envia UM email de alerta aos destinatários dessa etapa,
// reutilizando a função `send-email` (que resolve o SMTP da organização).
//
// Autenticação: SERVICE_ROLE apenas (é um cron/job interno). Não aceita JWTs de
// utilizador — não há UI que o chame diretamente.
//
// Imports no mesmo estilo das restantes funções (ver send-email/index.ts).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS mínimo. Esta função é chamada por um scheduler (pg_cron / Scheduled
// Functions) com o service role, não por um browser, por isso "*" é suficiente
// e mantém o preflight simples. (As funções expostas ao browser usam o helper
// partilhado _shared/cors.ts com allow-list; aqui não é necessário.)
const corsHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Tipos (espelham o schema do duc-app; ver duc-app/src/lib/ducSchema.ts) ──

interface StageRecipient {
  // "member" → anew_users.id da organização; "email" → endereço livre (externo).
  type: "member" | "email";
  value: string;
  label?: string;
}

interface StageNotify {
  recipients?: StageRecipient[];
  onEnter?: boolean;
  onClose?: boolean;
  // Alertar se a etapa ficar ATIVA sem fechar mais de N dias. 0/vazio = sem alerta.
  alertAfterDays?: number;
}

interface StageConfig {
  no: number;
  key?: string;
  title?: string;
  notify?: StageNotify;
}

interface TrackingEntry {
  stage: number;
  state: "pending" | "done";
  date?: string | null;
}

interface DucRow {
  id: string;
  organization_id: string;
  duc_number: string | null;
  title: string | null;
  variant: string | null;
  current_stage: number;
  status: string;
  tracking: TrackingEntry[] | null;
  updated_at: string;
}

interface AlertItem {
  duc_id: string;
  organization_id: string;
  duc_number: string | null;
  stage_no: number;
  stage_title: string;
  days_open: number;
  recipients: string[];
}

// ── Utilitários ──

// Escapa dados de utilizador antes de os injetar no HTML do email.
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Nº de dias inteiros decorridos entre `since` e agora (piso; nunca negativo).
function daysSince(since: Date, now: Date): number {
  const ms = now.getTime() - since.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Converte uma data ISO em Date; devolve null se inválida/ausente.
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Determina desde quando a etapa atual está aberta.
// Aproximação: data de fecho da etapa ANTERIOR no tracking (quando o utilizador
// fecha a etapa N-1, a etapa N passa a atual). Se não existir, cai para o
// updated_at do DUC.
function stageOpenedAt(duc: DucRow): Date {
  const tracking = Array.isArray(duc.tracking) ? duc.tracking : [];
  const prev = tracking.find(
    (t) => t.stage === duc.current_stage - 1 && t.state === "done",
  );
  const prevClosed = parseDate(prev?.date);
  if (prevClosed) return prevClosed;
  return parseDate(duc.updated_at) ?? new Date();
}

// Extrai a config da etapa `stageNo` a partir de config.stages (por `no`).
function findStageConfig(
  stages: StageConfig[] | null | undefined,
  stageNo: number,
): StageConfig | null {
  if (!Array.isArray(stages)) return null;
  return stages.find((s) => Number(s?.no) === stageNo) ?? null;
}

// Resolve a lista final de emails de uma etapa: membros (anew_users.id → email)
// + emails externos. Dedup case-insensitive.
async function resolveRecipientEmails(
  supabase: ReturnType<typeof createClient>,
  recipients: StageRecipient[],
  memberEmailCache: Map<string, string | null>,
): Promise<string[]> {
  const emails = new Set<string>();
  const memberIds: string[] = [];

  for (const r of recipients) {
    if (!r || typeof r.value !== "string") continue;
    if (r.type === "email") {
      const trimmed = r.value.trim();
      if (EMAIL_RE.test(trimmed)) emails.add(trimmed.toLowerCase());
    } else if (r.type === "member") {
      if (!memberEmailCache.has(r.value)) memberIds.push(r.value);
    }
  }

  // Resolve os membros ainda não em cache numa única query.
  const uncached = [...new Set(memberIds)];
  if (uncached.length > 0) {
    const { data, error } = await supabase
      .from("anew_users")
      .select("id, email")
      .in("id", uncached);
    if (error) {
      console.error("[duc-stale-alerts] erro a resolver emails de membros", error.message);
    }
    for (const u of (data ?? []) as Array<{ id: string; email: string | null }>) {
      memberEmailCache.set(u.id, u.email ?? null);
    }
    // Marca os ids não encontrados para não voltar a consultar.
    for (const id of uncached) {
      if (!memberEmailCache.has(id)) memberEmailCache.set(id, null);
    }
  }

  for (const r of recipients) {
    if (r?.type === "member" && typeof r.value === "string") {
      const email = memberEmailCache.get(r.value);
      if (email && EMAIL_RE.test(email)) emails.add(email.toLowerCase());
    }
  }

  return [...emails];
}

// Constrói o HTML do email de alerta (dados escapados).
function buildAlertHtml(item: AlertItem): string {
  const ducLabel = item.duc_number || item.duc_id;
  return `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; line-height: 1.5;">
      <h2 style="margin: 0 0 8px; font-size: 18px;">Etapa parada — atenção necessária</h2>
      <p style="margin: 0 0 16px; color: #475569;">
        A etapa <strong>${escapeHtml(item.stage_no)} · ${escapeHtml(item.stage_title)}</strong>
        do DUC <strong>${escapeHtml(ducLabel)}</strong> está aberta há
        <strong>${escapeHtml(item.days_open)}</strong> dias sem fechar.
      </p>
      <table style="border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 4px 12px 4px 0; color: #64748b;">DUC</td>
          <td style="padding: 4px 0;"><strong>${escapeHtml(ducLabel)}</strong></td>
        </tr>
        <tr>
          <td style="padding: 4px 12px 4px 0; color: #64748b;">Etapa</td>
          <td style="padding: 4px 0;">${escapeHtml(item.stage_no)} · ${escapeHtml(item.stage_title)}</td>
        </tr>
        <tr>
          <td style="padding: 4px 12px 4px 0; color: #64748b;">Dias parada</td>
          <td style="padding: 4px 0;">${escapeHtml(item.days_open)}</td>
        </tr>
      </table>
      <p style="margin: 16px 0 0; font-size: 12px; color: #94a3b8;">
        Alerta automático do Documento Único de Cliente (DUC).
      </p>
    </div>`.trim();
}

// Envia um email reutilizando a função send-email (resolve o SMTP da org).
async function sendViaSendEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: {
    organization_id: string;
    to: string;
    recipients: string[];
    subject: string;
    html: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `send-email HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Handler principal ──

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: corsHeaders },
    );
  }

  // Autenticação: apenas SERVICE_ROLE. É um job interno/cron.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (token !== serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Service role required" }),
      { status: 401, headers: corsHeaders },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const now = new Date();

  let scanned = 0;
  let alerted = 0;
  const errors: Array<{ duc_id: string; error: string }> = [];

  try {
    // 1) DUCs abertos (não fechados, não apagados).
    const { data: ducs, error: ducsError } = await supabase
      .from("anew_client_ducs")
      .select("id, organization_id, duc_number, title, variant, current_stage, status, tracking, updated_at")
      .neq("status", "closed")
      .is("deleted_at", null);

    if (ducsError) {
      throw new Error(`Falha ao carregar DUCs: ${ducsError.message}`);
    }

    const rows = (ducs ?? []) as DucRow[];
    scanned = rows.length;

    // 2) Config por organização — carregada uma vez por org (cache local).
    // A config vive em anew_client_duc_configs.config.stages. Se a org NÃO tiver
    // config guardada, saltamos esse DUC: o template base vive no frontend e não
    // está acessível aqui, por isso não conseguimos saber o alertAfterDays/
    // recipients dessa etapa (ver LIMITAÇÕES no README).
    const configCache = new Map<string, StageConfig[] | null>();
    const memberEmailCache = new Map<string, string | null>();

    async function getStagesForOrg(orgId: string): Promise<StageConfig[] | null> {
      if (configCache.has(orgId)) return configCache.get(orgId) ?? null;
      const { data, error } = await supabase
        .from("anew_client_duc_configs")
        .select("config")
        .eq("organization_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) {
        console.error(`[duc-stale-alerts] erro a carregar config da org ${orgId}`, error.message);
        configCache.set(orgId, null);
        return null;
      }
      const cfg = (data?.[0]?.config as { stages?: StageConfig[] } | null) ?? null;
      const stages = Array.isArray(cfg?.stages) && cfg!.stages!.length > 0 ? cfg!.stages! : null;
      configCache.set(orgId, stages);
      return stages;
    }

    // 3) Por DUC: determina a etapa atual, dias abertos e config da etapa.
    // Dedup por DUC nesta execução (uma etapa == um DUC atual, por isso um alerta
    // por DUC no máximo). Erros por-DUC são apanhados e não abortam o resto.
    for (const duc of rows) {
      try {
        const stages = await getStagesForOrg(duc.organization_id);
        if (!stages) continue; // org sem config → sem regras de alerta

        const stageCfg = findStageConfig(stages, duc.current_stage);
        const notify = stageCfg?.notify;
        const alertAfterDays = Number(notify?.alertAfterDays ?? 0);
        if (!(alertAfterDays > 0)) continue; // etapa sem alerta configurado

        const openedAt = stageOpenedAt(duc);
        const daysOpen = daysSince(openedAt, now);
        if (daysOpen <= alertAfterDays) continue; // ainda dentro do prazo

        const recipients = Array.isArray(notify?.recipients) ? notify!.recipients! : [];
        if (recipients.length === 0) continue; // sem destinatários → nada a enviar

        const emails = await resolveRecipientEmails(supabase, recipients, memberEmailCache);
        if (emails.length === 0) {
          console.warn(`[duc-stale-alerts] DUC ${duc.id}: destinatários sem email válido`);
          continue;
        }

        const item: AlertItem = {
          duc_id: duc.id,
          organization_id: duc.organization_id,
          duc_number: duc.duc_number,
          stage_no: duc.current_stage,
          stage_title: stageCfg?.title || `Etapa ${duc.current_stage}`,
          days_open: daysOpen,
          recipients: emails,
        };

        const ducLabel = duc.duc_number || duc.id;
        const subject = `DUC ${ducLabel} · Etapa ${item.stage_no} parada há ${item.days_open} dias`;
        const html = buildAlertHtml(item);

        // 4) Envia UM email por DUC via send-email (SMTP da org).
        const result = await sendViaSendEmail(supabaseUrl, serviceRoleKey, {
          organization_id: duc.organization_id,
          to: emails[0],
          recipients: emails,
          subject,
          html,
        });

        if (result.ok) {
          alerted++;
        } else {
          errors.push({ duc_id: duc.id, error: result.error ?? "envio falhou" });
          console.error(`[duc-stale-alerts] DUC ${duc.id}: ${result.error}`);
        }
      } catch (perDucErr) {
        const msg = perDucErr instanceof Error ? perDucErr.message : String(perDucErr);
        errors.push({ duc_id: duc.id, error: msg });
        console.error(`[duc-stale-alerts] DUC ${duc.id} falhou:`, msg);
      }
    }

    // 6) Resumo.
    return new Response(
      JSON.stringify({ scanned, alerted, errors }),
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[duc-stale-alerts] erro fatal:", msg);
    return new Response(
      JSON.stringify({ error: msg, scanned, alerted, errors }),
      { status: 500, headers: corsHeaders },
    );
  }
};

serve(handler);
