// Org-scoped entity lookup for the public form / public API.
// Looks for an existing entity inside ONE organization by identifier
// (email / phone / nif). Cross-org identity is intentionally ignored:
// even if the email belongs to an entity in another org of the same
// hierarchy group, the public form must NOT silently share it.
// Cross-org sharing is always opt-in via the manual UI (link_entity_to_org).

import {
  type DedupCandidate,
  type DedupOutcome,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
} from "./leadDedup.ts";
import { isNotificationEnabled } from "./notificationSettings.ts";

/** Tecto de linhas lidas por identificador antes de filtrar por organização. */
const CANDIDATE_LOOKUP_LIMIT = 50;

export type ScopedLookupHit = {
  entityId: string;
  matchField: "email" | "phone" | "nif";
};

export async function findLocalEntityForOrg(params: {
  supabase: any;
  organizationId: string;
  email?: string | null;
  phone?: string | null;
  /**
   * @deprecated Plaintext NIF is no longer used for matching — pass
   * `nifHash` instead. This field is ignored: when no `nifHash` is supplied
   * (missing or hashing failed upstream), the NIF-matching clause is skipped
   * entirely rather than falling back to a plaintext `fiscal_entities.nif`
   * comparison. Kept only so existing callers don't need an immediate
   * signature change.
   */
  nif?: string | null;
  /**
   * Precomputed HMAC-SHA256 hash of the normalized NIF (see
   * `_shared/nifCrypto.ts` hashNif). The NIF match is done against
   * `fiscal_entities.nif_hash` only. When this is not supplied (e.g. hashing
   * failed upstream), no NIF-based match is attempted at all — never fall
   * back to comparing plaintext NIF.
   */
  nifHash?: string | null;
  countryCode?: string;
}): Promise<ScopedLookupHit | null> {
  const { supabase, organizationId, email, phone, nifHash, countryCode = "PT" } = params;
  if (!organizationId) return null;

  // --- 1. Resolve candidate entity_ids from each identifier ---
  const candidates: Array<{ entityId: string; matchField: ScopedLookupHit["matchField"] }> = [];

  if (email) {
    const norm = String(email).trim().toLowerCase();
    if (norm) {
      const { data } = await supabase
        .from("anew_entity_emails")
        .select("entity_id")
        .eq("email", norm)
        .limit(20);
      for (const r of data ?? []) {
        if (r?.entity_id) candidates.push({ entityId: r.entity_id, matchField: "email" });
      }
    }
  }

  if (phone) {
    const suffix = normalizePhoneForMatch(phone);
    if (suffix) {
      const { data } = await supabase
        .from("anew_entity_phones")
        .select("entity_id, phone_number")
        .ilike("phone_number", `%${suffix}`)
        .limit(50);
      for (const r of data ?? []) {
        if (r?.entity_id) candidates.push({ entityId: r.entity_id, matchField: "phone" });
      }
    }
  }

  const cleanNifHash = nifHash ? String(nifHash).trim() : null;
  if (cleanNifHash) {
    // NIF match is only ever done against the hashed column. No `nifHash`
    // (missing or hashing failed upstream) means no NIF-based match is
    // attempted — never fall back to comparing plaintext `fiscal_entities.nif`.
    const { data: fes } = await supabase
      .from("fiscal_entities")
      .select("id")
      .eq("country_code", countryCode)
      .eq("nif_hash", cleanNifHash)
      .limit(5);
    const feIds = (fes ?? []).map((f: any) => f.id);
    if (feIds.length) {
      const { data: links } = await supabase
        .from("anew_entity_fiscal_entities")
        .select("entity_id")
        .in("fiscal_entity_id", feIds)
        .limit(20);
      for (const r of links ?? []) {
        if (r?.entity_id) candidates.push({ entityId: r.entity_id, matchField: "nif" });
      }
    }
  }

  if (candidates.length === 0) return null;

  // --- 2. Filter candidates against this org's entity links ---
  const ids = [...new Set(candidates.map((c) => c.entityId))];
  const { data: links } = await supabase
    .from("anew_entity_org_links")
    .select("entity_id")
    .eq("organization_id", organizationId)
    .in("entity_id", ids);
  const localIds = new Set((links ?? []).map((r: any) => r.entity_id));

  // Preference order: email > nif > phone (more specific first)
  const order = { email: 0, nif: 1, phone: 2 } as const;
  const local = candidates
    .filter((c) => localIds.has(c.entityId))
    .sort((a, b) => order[a.matchField] - order[b.matchField]);

  return local[0] ?? null;
}

/**
 * Recolhe o QUADRO COMPLETO de candidatos à deduplicação de uma submissão de
 * formulário público, para alimentar `classifyDedupOutcome` (`leadDedup.ts`).
 *
 * Porquê uma função nova e não um parâmetro em `findLocalEntityForOrg`:
 * aquela devolve UMA entidade (`local[0]`) por preferência email > nif > phone
 * e deita fora as restantes — é exactamente essa perda que impede distinguir
 * o caso 06 CONFLITO (email numa entidade, telefone noutra). O comportamento
 * dela fica intacto para os chamadores actuais; esta vive ao lado.
 *
 * Diferenças deliberadas face a `findLocalEntityForOrg`:
 *  - NIF fora: só email e telefone entram na comparação;
 *  - devolve TODOS os candidatos locais, cada um com todos os seus emails e
 *    telefones, sem escolher vencedor — quem decide é a função pura;
 *  - exclui entidades de utilizadores INTERNOS (`anew_users.registration_origin
 *    = 'invited'`). Os do portal (`self_registration`) contam como qualquer
 *    pessoa.
 *
 * Não escreve nada. Requer client com service_role (as tabelas de identidade
 * não são legíveis pelo anon no contexto do formulário público).
 */
export async function collectDedupCandidatesForOrg(params: {
  supabase: any;
  organizationId: string;
  email?: string | null;
  phone?: string | null;
}): Promise<DedupCandidate[]> {
  const { supabase, organizationId, email, phone } = params;
  if (!organizationId) return [];

  const normEmail = normalizeEmailForMatch(email);
  const normPhone = normalizePhoneForMatch(phone);
  if (!normEmail && !normPhone) return [];

  // --- 1. entity_ids que batem por email ou por telefone (qualquer org) ---
  const seedIds = new Set<string>();

  if (normEmail) {
    const { data } = await supabase
      .from("anew_entity_emails")
      .select("entity_id")
      .eq("email", normEmail)
      .limit(CANDIDATE_LOOKUP_LIMIT);
    for (const r of data ?? []) {
      if (r?.entity_id) seedIds.add(r.entity_id);
    }
  }

  if (normPhone) {
    const { data } = await supabase
      .from("anew_entity_phones")
      .select("entity_id, phone_number")
      .ilike("phone_number", `%${normPhone}`)
      .limit(CANDIDATE_LOOKUP_LIMIT);
    for (const r of data ?? []) {
      // O ilike é só um pré-filtro do lado da base; a igualdade real é sempre
      // pelos últimos 9 dígitos, já normalizados dos dois lados.
      if (r?.entity_id && normalizePhoneForMatch(r.phone_number) === normPhone) {
        seedIds.add(r.entity_id);
      }
    }
  }

  if (seedIds.size === 0) return [];

  // --- 2. só as entidades ligadas a ESTA organização ---
  const { data: links } = await supabase
    .from("anew_entity_org_links")
    .select("entity_id")
    .eq("organization_id", organizationId)
    .in("entity_id", [...seedIds]);
  const localIds: string[] = [
    ...new Set<string>((links ?? []).map((r: any) => r.entity_id as string)),
  ];
  if (localIds.length === 0) return [];

  // --- 3. fora entidades de utilizadores internos ---
  const { data: internos } = await supabase
    .from("anew_users")
    .select("entity_id")
    .eq("registration_origin", "invited")
    .in("entity_id", localIds);
  const internalIds = new Set<string>((internos ?? []).map((r: any) => r.entity_id as string));
  const finalIds = localIds.filter((id) => !internalIds.has(id));
  if (finalIds.length === 0) return [];

  // --- 4. quadro completo: TODOS os emails e telefones de cada candidato ---
  const [emailsRes, phonesRes] = await Promise.all([
    supabase.from("anew_entity_emails").select("entity_id, email").in("entity_id", finalIds),
    supabase.from("anew_entity_phones").select("entity_id, phone_number").in("entity_id", finalIds),
  ]);

  const emailsByEntity = new Map<string, string[]>();
  for (const r of emailsRes.data ?? []) {
    if (!r?.entity_id || !r.email) continue;
    emailsByEntity.set(r.entity_id, [...(emailsByEntity.get(r.entity_id) ?? []), r.email]);
  }
  const phonesByEntity = new Map<string, string[]>();
  for (const r of phonesRes.data ?? []) {
    if (!r?.entity_id || !r.phone_number) continue;
    phonesByEntity.set(r.entity_id, [...(phonesByEntity.get(r.entity_id) ?? []), r.phone_number]);
  }

  return finalIds.map((entityId) => ({
    entityId,
    emails: emailsByEntity.get(entityId) ?? [],
    phones: phonesByEntity.get(entityId) ?? [],
  }));
}

/**
 * Papéis que uma entidade tem numa organização: CLIENTE ou LEAD.
 *
 * Contactos não entram. O módulo de Contactos foi retirado do produto — o
 * Contacto fundiu-se no ciclo de vida da Lead, `/contacts` reencaminha para
 * `/leads`, e não há ecrã nenhum onde um contacto possa ser visto ou tratado.
 * Classificar alguém como contacto era mandá-lo para um sítio que não existe:
 * a submissão colava-se a um registo invisível e ninguém ficava a saber dela.
 *
 * Consequência assumida: quem é APENAS contacto passa a contar como quem não
 * tem nada, e uma submissão dessa pessoa gera lead nova. É a invariante
 * acordada — uma lead nasce quando a entidade não tem nenhuma — e não uma
 * regressão. São poucos casos: dos 1 644 contactos da Mudelar, 1 522 já têm
 * lead activa, e desses nada muda.
 */
export type ExistingRoleSummary = {
  hasClient: boolean;
  activeLeadId: string | null;
  clientId: string | null;
  // anew_users.id of the responsible person (assigned_to or owner)
  assigneeAnewUserId: string | null;
  // Responsáveis por papel, preenchidos mesmo quando esse papel não é o
  // `targetType` vencedor. Quem precisa de notificar o comercial da LEAD de
  // alguém que também é cliente não tem outra forma de lá chegar.
  activeLeadAssigneeAnewUserId: string | null;
  clientAssigneeAnewUserId: string | null;
  targetType: "lead" | "client" | null;
  targetId: string | null;
};

export async function classifyEntityInOrg(params: {
  supabase: any;
  entityId: string;
  organizationId: string;
}): Promise<ExistingRoleSummary> {
  const { supabase, entityId, organizationId } = params;
  const result: ExistingRoleSummary = {
    hasClient: false, activeLeadId: null,
    clientId: null,
    assigneeAnewUserId: null,
    activeLeadAssigneeAnewUserId: null, clientAssigneeAnewUserId: null,
    targetType: null, targetId: null,
  };

  // `deleted_at is null` nas duas: um registo apagado não é um registo
  // existente. Sem este filtro, a submissão de quem teve a lead apagada ia
  // ligar-se a essa lead morta — a submissão desaparecia e a pessoa não
  // ganhava lead nenhuma. Só na Mudelar há 181 leads apagadas que mantiveram
  // um `status` activo (37 entidades sem nenhuma lead viva), confirmado por
  // leitura ao remoto em 2026-09-02.
  const [leadsRes, clientsRes] = await Promise.all([
    supabase.from("anew_leads")
      .select("id, status, assigned_to, created_by")
      .eq("entity_id", entityId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("status", "in", '("converted","lost","rejected")')
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("anew_clients")
      .select("id, status, assigned_to, created_by")
      .eq("entity_id", entityId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("status", "eq", "inactive")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const lead = leadsRes.data?.[0];
  const client = clientsRes.data?.[0];

  // Os dois papéis são preenchidos SEMPRE que existem, independentemente de
  // qual deles ganha `targetType`. Sem isto, quem é cliente E lead ficava com
  // `activeLeadId = null` — e quem lê a lead existente (create-lead) nunca a
  // via, criando uma lead nova para quem já tinha uma.
  if (client) {
    result.hasClient = true;
    result.clientId = client.id;
    result.clientAssigneeAnewUserId = client.assigned_to ?? client.created_by ?? null;
  }
  if (lead) {
    result.activeLeadId = lead.id;
    result.activeLeadAssigneeAnewUserId = lead.assigned_to ?? lead.created_by ?? null;
  }

  // Cliente ganha à lead: quem já comprou é tratado como cliente, e é o
  // comercial do cliente que deve saber que a pessoa voltou a submeter.
  if (client) {
    result.targetType = "client";
    result.targetId = client.id;
    result.assigneeAnewUserId = client.assigned_to ?? client.created_by ?? null;
  } else if (lead) {
    result.targetType = "lead";
    result.targetId = lead.id;
    result.assigneeAnewUserId = lead.assigned_to ?? lead.created_by ?? null;
  }

  return result;
}

/**
 * Emits an alert notification when a public-form submission re-arrives for
 * an entity that is already a Contact / Client / has an active Lead in the
 * receiving org. Idempotent within a 24h window.
 *
 * Returns the notification id (or null on no-op / failure — non-fatal).
 */
export async function emitFormResubmissionAlert(params: {
  supabase: any;
  organizationId: string;
  entityId: string;
  summary: ExistingRoleSummary;
  campaignId: string | null;
  formId?: string | null;
  fieldValuesDiff?: Record<string, unknown> | null;
  displayName?: string | null;
}): Promise<string | null> {
  const { supabase, organizationId, entityId, summary, campaignId, formId, fieldValuesDiff, displayName } = params;

  if (!summary.targetType || !summary.targetId) return null;

  // Resolve auth_user_id for the assignee
  let authUserId: string | null = null;
  if (summary.assigneeAnewUserId) {
    const { data } = await supabase
      .from("anew_users")
      .select("auth_user_id")
      .eq("id", summary.assigneeAnewUserId)
      .maybeSingle();
    authUserId = data?.auth_user_id ?? null;
  }

  // Fallback: any active admin/owner of the org
  if (!authUserId) {
    const { data } = await supabase
      .from("anew_memberships")
      .select("user_id, role, anew_users!inner(auth_user_id)")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    authUserId = (data as any)?.anew_users?.auth_user_id ?? null;
  }

  if (!authUserId) {
    console.warn("[form-alert] no recipient for", { organizationId, entityId });
    return null;
  }

  const type = summary.targetType === "client"
    ? "form_resubmission_client"
    : "form_resubmission_lead";

  const title = summary.targetType === "client"
    ? "Cliente submeteu formulário"
    : "Lead existente voltou a submeter formulário";

  const labelName = displayName || "Entidade";
  // NAO prometer "nao foi criada uma nova lead": deixou de ser sempre verdade.
  // Quem ja e CLIENTE e marca visita pelo formulario passa a ganhar a lead que
  // nao tinha -- e a invariante a funcionar, nao um defeito. O que e verdade
  // nos dois casos e que a submissao ficou na ficha que ja existia.
  const message = `${labelName} preencheu novamente o formulário. A submissão ficou na ficha que já existe.`;

  // Nunca `/contacts`: essa rota reencaminha para `/leads` e a ligação morria.
  const link = summary.targetType === "client"
    ? `/clients?open=${summary.targetId}`
    : `/leads?open=${summary.targetId}`;

  // Idempotency — reuse pending notification of same type+entity in last 24h
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("notifications")
    .select("id, data")
    .eq("user_id", authUserId)
    .eq("type", type)
    .eq("entity_id", summary.targetId)
    .eq("is_resolved", false)
    .gte("created_at", sinceIso)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const prev = (existing as any).data || {};
    const count = (prev.repeat_count ?? 1) + 1;
    await supabase.from("notifications")
      .update({
        data: {
          ...prev,
          repeat_count: count,
          last_submitted_at: new Date().toISOString(),
          last_field_values_diff: fieldValuesDiff || null,
        },
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const payload = {
    user_id: authUserId,
    organization_id: organizationId,
    type,
    title,
    message,
    link,
    entity_type: summary.targetType,
    entity_id: summary.targetId,
    priority: "medium",
    kind: "alert",
    data: {
      entity_id: entityId,
      campaign_id: campaignId,
      form_id: formId ?? null,
      submitted_at: new Date().toISOString(),
      field_values_diff: fieldValuesDiff || null,
      repeat_count: 1,
    },
  };

  const { data: inserted, error } = await supabase
    .from("notifications")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.warn("[form-alert] insert failed", error.message);
    return null;
  }
  return inserted?.id ?? null;
}

/**
 * Non-destructive merge of new field_values into an existing target row
 * (lead / client). Only sets keys that are null / undefined /
 * empty-string on the existing row.
 */
export async function mergeFieldValuesNonDestructive(params: {
  supabase: any;
  table: "anew_leads" | "anew_clients";
  rowId: string;
  newFieldValues: Record<string, any>;
}): Promise<Record<string, any>> {
  const { supabase, table, rowId, newFieldValues } = params;
  if (!newFieldValues || Object.keys(newFieldValues).length === 0) return {};

  const column = table === "anew_leads" ? "field_values" : "custom_fields";

  const { data: existing } = await supabase
    .from(table)
    .select(column)
    .eq("id", rowId)
    .maybeSingle();
  const current = (existing?.[column] || {}) as Record<string, any>;

  const merged: Record<string, any> = { ...current };
  const diff: Record<string, any> = {};
  for (const [k, v] of Object.entries(newFieldValues)) {
    const cur = current[k];
    const isEmpty = cur === null || cur === undefined || cur === "" || (Array.isArray(cur) && cur.length === 0);
    if (isEmpty && v !== null && v !== undefined && v !== "") {
      merged[k] = v;
      diff[k] = v;
    }
  }

  if (Object.keys(diff).length > 0) {
    await supabase
      .from(table)
      .update({ [column]: merged })
      .eq("id", rowId);
  }
  return diff;
}

/**
 * Local-only idempotent link insert. Service-role context bypasses the
 * blocked RLS on anew_entity_org_links — only call this from edge functions
 * using service_role. Never writes shared_* metadata.
 */
export async function ensureEntityOrgLinkSR(params: {
  supabase: any;
  entityId: string;
  organizationId: string;
  isPrimary?: boolean;
}): Promise<void> {
  const { supabase, entityId, organizationId, isPrimary = false } = params;
  if (!entityId || !organizationId) return;
  const { error } = await supabase
    .from("anew_entity_org_links")
    .upsert(
      { entity_id: entityId, organization_id: organizationId, is_primary: !!isPrimary },
      { onConflict: "entity_id,organization_id", ignoreDuplicates: true },
    );
  if (error) console.warn("[org-link/sr] upsert failed", error.message);
}

// ---------------------------------------------------------------------------
// Notificação do comercial quando uma submissão é associada a alguém que já
// existe (resultados 01 a 06 de `leadDedup.ts`).
//
// Segue o padrão dos doze tipos que já existem: uma linha em `notifications`
// com `kind: 'notification'` (o sino do topo — `useNotifications` filtra por
// esse `kind`), `link` já resolvido, e `alert_settings` respeitado via
// `isNotificationEnabled`. Não é o mesmo canal que `emitFormResubmissionAlert`,
// que escreve `kind: 'alert'` (as barras de alerta dentro do módulo).
//
// NUNCA há destinatário de recurso: quando o registo existente não tem
// comercial (nem `assigned_to` nem `created_by`), não se notifica ninguém — a
// lead sobe na listagem e é assim que alguém dá por ela.
// ---------------------------------------------------------------------------

/** O registo que recebeu a submissão, e quem por ele responde. */
export type DedupNotificationTarget = {
  targetType: "lead" | "client";
  targetId: string;
  /** `anew_users.id` — `assigned_to ?? created_by`, ou null se não tiver dono. */
  assigneeAnewUserId: string | null;
};

export const DEDUP_MATCH_NOTIFICATION_TYPE = "form_submission_matched";
export const DEDUP_CONFLICT_NOTIFICATION_TYPE = "form_submission_conflict";

export type DedupNotificationContent = {
  type: string;
  title: string;
  message: string;
};

/**
 * Texto da notificação, por resultado. Puro de propósito — é o que se testa.
 *
 *  - 01/02/04 (encontrou)                → "A X voltou a submeter o formulário Y."
 *  - 03/05 (encontrou, com dado novo)    → "... e indicou um telefone/email
 *    diferente do que está na ficha."
 *  - 06 (conflito)                       → texto próprio, para os DOIS comerciais.
 *
 * Devolve `null` para 07/08 (SEM_MATCH / NAO_VERIFICAVEL): aí nasce lead nova,
 * não há nada de existente para notificar.
 */
export function buildDedupNotificationContent(
  outcome: DedupOutcome,
  options?: { displayName?: string | null; formName?: string | null },
): DedupNotificationContent | null {
  if (outcome.kind === "SEM_MATCH" || outcome.kind === "NAO_VERIFICAVEL") return null;

  if (outcome.kind === "CONFLITO") {
    return {
      type: DEDUP_CONFLICT_NOTIFICATION_TYPE,
      title: "Submissão com contactos de duas fichas",
      message: "Uma submissão tem o email de um contacto seu e o telefone de outro.",
    };
  }

  // Sem nome na submissão, "A pessoa voltou a submeter..." continua a ler-se.
  const name = options?.displayName?.trim() || "pessoa";
  const form = options?.formName?.trim() || "";
  const opening = form
    ? `A ${name} voltou a submeter o formulário ${form}`
    : `A ${name} voltou a submeter o formulário`;

  const novoDado = outcome.kind === "MATCH_EMAIL" && outcome.novoTelefone
    ? "telefone"
    : outcome.kind === "MATCH_TELEFONE" && outcome.novoEmail
      ? "email"
      : null;

  return {
    type: DEDUP_MATCH_NOTIFICATION_TYPE,
    title: novoDado ? "Voltou a submeter, com um dado novo" : "Voltou a submeter o formulário",
    message: novoDado
      ? `${opening} e indicou um ${novoDado} diferente do que está na ficha.`
      : `${opening}.`,
  };
}

/** `anew_users.id` → `auth_user_id` (é o auth id que `notifications.user_id` guarda). */
async function resolveAuthUserIds(supabase: any, anewUserIds: string[]): Promise<string[]> {
  const ids = [...new Set(anewUserIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("anew_users")
    .select("auth_user_id")
    .in("id", ids);
  return [...new Set((data ?? []).map((r: any) => r?.auth_user_id).filter(Boolean))] as string[];
}

/**
 * Notifica o(s) comercial(is) responsável(is) pelo registo a que a submissão
 * ficou associada. Best-effort: nunca lança, nunca bloqueia o visitante.
 *
 * No CONFLITO (06) as DUAS entidades têm dono possivelmente diferente, por
 * isso `conflictTarget` traz o segundo comercial e ambos recebem a mesma
 * notificação (a ligação abre o registo do lado do email, que é o que ficou
 * ligado à submissão). Se os dois forem a mesma pessoa, recebe uma só.
 *
 * Devolve os ids das notificações escritas (vazio quando não havia
 * destinatário, quando o tipo está desligado na organização, ou em erro).
 */
export async function emitDedupSubmissionNotification(params: {
  supabase: any;
  organizationId: string;
  entityId: string;
  outcome: DedupOutcome;
  target: DedupNotificationTarget;
  conflictTarget?: DedupNotificationTarget | null;
  submissionId?: string | null;
  formId?: string | null;
  campaignId?: string | null;
  displayName?: string | null;
  formName?: string | null;
}): Promise<string[]> {
  const {
    supabase, organizationId, entityId, outcome, target, conflictTarget,
    submissionId, formId, campaignId, displayName, formName,
  } = params;

  const content = buildDedupNotificationContent(outcome, { displayName, formName });
  if (!content) return [];

  if (!(await isNotificationEnabled(supabase, organizationId, content.type))) return [];

  const assignees = [target.assigneeAnewUserId, conflictTarget?.assigneeAnewUserId ?? null]
    .filter((id): id is string => !!id);
  const authUserIds = await resolveAuthUserIds(supabase, assignees);
  if (authUserIds.length === 0) {
    // Sem comercial não se notifica ninguém — e isto NÃO é um erro.
    console.log("[dedup-notify] sem destinatario; nao se notifica", { organizationId, entityId });
    return [];
  }

  const link = target.targetType === "client"
    ? `/clients?open=${target.targetId}`
    : `/leads?open=${target.targetId}`;

  const data = {
    entity_id: entityId,
    dedup_kind: outcome.kind,
    submission_id: submissionId ?? null,
    form_id: formId ?? null,
    campaign_id: campaignId ?? null,
    conflicting_entity_id: outcome.kind === "CONFLITO" ? outcome.entityIdTelefone : null,
    submitted_at: new Date().toISOString(),
  };

  const written: string[] = [];
  for (const authUserId of authUserIds) {
    const { data: inserted, error } = await supabase
      .from("notifications")
      .insert({
        user_id: authUserId,
        organization_id: organizationId,
        type: content.type,
        kind: "notification",
        title: content.title,
        message: content.message,
        link,
        entity_type: target.targetType,
        entity_id: target.targetId,
        priority: "medium",
        data: { ...data, submission_count: 1 },
      })
      .select("id")
      .single();

    if (!error) {
      if (inserted?.id) written.push(inserted.id as string);
      continue;
    }

    // O índice único `notifications_dedup` (type, entity_id, user_id) só deixa
    // existir UMA notificação por resolver de cada tipo para a mesma ficha. Sem
    // o tratamento abaixo, a segunda submissão da mesma pessoa era simplesmente
    // perdida: o insert falhava, o erro era engolido, e o comercial nunca sabia.
    // O requisito é o contrário — tem de ser avisado SEMPRE que entra uma
    // submissão. Como não se pode criar uma segunda linha, ressuscita-se a que
    // existe: conta-se a repetição, refresca-se a data e volta a ficar por ler,
    // para reaparecer no sino como aviso novo.
    if (!isUniqueViolation(error)) {
      console.warn("[dedup-notify] insert falhou (continuando):", error.message);
      continue;
    }

    const revived = await reviveDedupNotification(supabase, {
      authUserId,
      type: content.type,
      entityId: target.targetId,
      content,
      link,
      data,
    });
    if (revived) written.push(revived);
  }
  return written;
}

/** 23505 = unique_violation. A mensagem serve de rede quando o código não vem. */
function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error?.code === "23505" || (error?.message ?? "").includes("notifications_dedup");
}

/**
 * Repõe no sino uma notificação de submissão que já existia por resolver.
 *
 * Devolve o id da notificação reposta, ou null se não foi possível — e nesse
 * caso já ficou escrito no log. Nunca deixa rebentar o pedido do visitante:
 * perder o visitante é pior do que perder o aviso.
 */
async function reviveDedupNotification(
  supabase: any,
  params: {
    authUserId: string;
    type: string;
    entityId: string;
    content: DedupNotificationContent;
    link: string;
    data: Record<string, unknown>;
  },
): Promise<string | null> {
  const { authUserId, type, entityId, content, link, data } = params;

  const { data: existing, error: readError } = await supabase
    .from("notifications")
    .select("id, data")
    .eq("user_id", authUserId)
    .eq("type", type)
    .eq("entity_id", entityId)
    .eq("is_resolved", false)
    .maybeSingle();

  if (readError || !existing?.id) {
    console.warn(
      "[dedup-notify] nao foi possivel ler a notificacao existente:",
      readError?.message ?? "linha nao encontrada",
    );
    return null;
  }

  const anterior = Number((existing.data as { submission_count?: unknown } | null)?.submission_count);
  const count = (Number.isFinite(anterior) && anterior > 0 ? anterior : 1) + 1;

  const { error: updateError } = await supabase
    .from("notifications")
    .update({
      title: content.title,
      message: `${content.message} (${count}.ª submissão)`,
      link,
      priority: "medium",
      data: { ...data, submission_count: count },
      is_read: false,
      read_at: null,
      is_dismissed: false,
      created_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateError) {
    console.warn("[dedup-notify] nao foi possivel repor a notificacao:", updateError.message);
    return null;
  }
  return existing.id as string;
}
