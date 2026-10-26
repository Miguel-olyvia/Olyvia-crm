// Nucleo da captacao do formulario publico (create-lead e insert-lead).
//
// O formulario SO cria a ENTIDADE (anew_entities, sem negocio): lead e a
// entidade sem client_since. Cada envio e um toque novo em form_submissions.
// Este modulo nao tem imports remotos, para se poder testar no vitest; os
// `index.ts` (Deno.serve) ficam finos e chamam `captarEnvio`.
//
// DEPENDE de objetos que so existem na base de RH (migration
// 20261229100000_form_criar_entidade.sql): fn_form_resolver_captacao,
// fn_form_achar_entidades, fn_form_criar_entidade. A migration
// 20261231200000_negocio_desde_o_inicio.sql acrescenta a 4.a coluna
// negocio_id a fn_form_criar_entidade (pessoa nova nasce com negocio).
// NAO publicar sem as migrations aplicadas e sem autorizacao.

import { classifyDedupOutcome, type DedupCandidate, type DedupOutcome } from './leadDedup.ts';
import { composeDisplayName, normalizeFirstLast } from './composeDisplayName.ts';
import { sanitizeEmail, sanitizePhone } from './inputSanitizers.ts';
import { resolveOriginWithoutUtmSource } from './paidClickSource.ts';
import { resolveRootOrganizationId } from './leadsValidation.ts';
import {
  emitDedupSubmissionNotification,
  emitFormResubmissionAlert,
  type DedupNotificationTarget,
  type ExistingRoleSummary,
} from './entityScopedLookup.ts';

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;
// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

// ---------------------------------------------------------------------------
// Puros
// ---------------------------------------------------------------------------

const ORIGEM_IGNORADA = new Set(['public_form', 'public_api']);

/**
 * Texto de origem do envio, por precedencia: utm_source (embed utm), click-id
 * ou referrer, e por fim o texto de `source`. Vazio ou tecnico = null.
 */
export function pickOrigemTexto(params: {
  embedKind?: string | null;
  tracking?: Record<string, unknown> | null;
  source?: string | null;
}): string | null {
  const { embedKind, tracking, source } = params;
  if (embedKind === 'utm') {
    const utm = typeof tracking?.utm_source === 'string' ? tracking.utm_source.trim() : '';
    if (utm) return utm;
    const derivada = resolveOriginWithoutUtmSource(tracking ?? null);
    if (derivada) return derivada;
  }
  const texto = typeof source === 'string' ? source.trim() : '';
  if (!texto || ORIGEM_IGNORADA.has(texto.toLowerCase())) return null;
  return texto;
}

export type Contactos = {
  email: string | null;
  phone: string | null;
  extraEmails: string[];
  extraPhones: string[];
};

function paraLista(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw === null || raw === undefined) return [];
  return [raw];
}

/**
 * Um so email e um so telefone por entidade: o primeiro valido. Os restantes
 * (distintos, tambem validos) ficam em `extra*` para irem para extra/notas.
 */
export function collectContactos(rawEmails: unknown, rawPhones: unknown): Contactos {
  const emails: string[] = [];
  for (const item of paraLista(rawEmails)) {
    const e = sanitizeEmail(item);
    if (e && !emails.includes(e)) emails.push(e);
  }
  const phones: string[] = [];
  for (const item of paraLista(rawPhones)) {
    const p = sanitizePhone(item);
    if (p && !phones.includes(p)) phones.push(p);
  }
  return {
    email: emails[0] ?? null,
    phone: phones[0] ?? null,
    extraEmails: emails.slice(1),
    extraPhones: phones.slice(1),
  };
}

const PLACEHOLDERS = new Set(['', '-', '--', '0', 'n/a', 'na']);
const isPlaceholder = (v: unknown): boolean =>
  v === null || v === undefined || PLACEHOLDERS.has(String(v).trim().toLowerCase());
const CP_PLACEHOLDER = '0000-000';

export type Morada = { street: string; postal_code: string; city: string | null };

/** Morada so com rua E codigo postal completos; nunca N/A nem 0000-000. */
export function montarMorada(street: unknown, postal: unknown, city: unknown): Morada | null {
  const s = isPlaceholder(street) ? '' : String(street).trim();
  const p = isPlaceholder(postal) ? '' : String(postal).trim();
  if (!s || !p || p === CP_PLACEHOLDER) return null;
  const c = isPlaceholder(city) ? '' : String(city).trim();
  return { street: s, postal_code: p, city: c || null };
}

export type FieldDefinition = {
  field_key?: string | null;
  field_label?: string | null;
  contact_field_mapping?: string | null;
  is_unique?: boolean | null;
  [k: string]: unknown;
};

export type CamposLidos = {
  rawEmail: unknown;
  rawPhone: unknown;
  firstName: string | null;
  lastName: string | null;
  morada: Morada | null;
  rawVat: string | null;
};

/** Le email, telefone, nome, morada e NIF pelo mapeamento do formulario (e aliases antigos). */
export function lerCamposContacto(fieldValues: AnyRecord, definitions: FieldDefinition[]): CamposLidos {
  const mapa: Record<string, string> = {};
  for (const d of definitions ?? []) {
    if (d.contact_field_mapping && d.field_key) mapa[d.contact_field_mapping] = d.field_key;
  }
  const resolve = (prop: string, ...aliases: string[]): unknown => {
    const mapped = mapa[prop];
    if (mapped && fieldValues?.[mapped]) return fieldValues[mapped];
    if (fieldValues?.[prop]) return fieldValues[prop];
    for (const a of aliases) if (fieldValues?.[a]) return fieldValues[a];
    return null;
  };
  const nome = (v: unknown) => (isPlaceholder(v) ? '' : String(v).trim());
  const nomes = normalizeFirstLast(
    nome(resolve('first_name', 'po_nome', 'nome')),
    nome(resolve('last_name', 'po_apelido', 'apelido')),
  );
  let rawVat: string | null = null;
  for (const k of Object.keys(fieldValues ?? {})) {
    const lk = k.toLowerCase();
    if (k !== '_meta' && (lk.includes('nif') || lk.includes('vat'))) {
      const v = fieldValues[k];
      if (v && !isPlaceholder(v)) {
        rawVat = String(v).trim().toUpperCase();
        break;
      }
    }
  }
  return {
    rawEmail: resolve('email', 'po_email', 'Email'),
    rawPhone: resolve('phone', 'po_telefone', 'telefone'),
    firstName: nomes.first,
    lastName: nomes.last,
    morada: montarMorada(
      resolve('address', 'po_morada', 'morada'),
      resolve('postal_code', 'po_codigo_postal', 'codigo_postal'),
      resolve('city', 'po_localidade', 'localidade', 'cidade'),
    ),
    rawVat,
  };
}

// ---------------------------------------------------------------------------
// is_unique: consulta form_submissions do mesmo formulario e organizacao
// ---------------------------------------------------------------------------

export type CampoDuplicado = { fieldKey: string; fieldLabel: string; value: string };

export async function verificarCamposUnicos(params: {
  supabase: SupabaseLike;
  organizationId: string;
  formId: string | null;
  definitions: FieldDefinition[];
  fieldValues: AnyRecord;
  excludeSubmissionId?: string | null;
}): Promise<CampoDuplicado | null> {
  const { supabase, organizationId, formId, definitions, fieldValues, excludeSubmissionId } = params;
  if (!formId) return null;
  for (const def of definitions ?? []) {
    if (!def.is_unique || !def.field_key) continue;
    const raw = fieldValues?.[def.field_key];
    if (raw === null || raw === undefined || raw === '' || typeof raw === 'object') continue;
    const value = String(raw);
    let q = supabase
      .from('form_submissions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('form_id', formId)
      .is('deleted_at', null)
      .filter(`field_values->>${def.field_key}`, 'eq', value);
    if (excludeSubmissionId) q = q.neq('id', excludeSubmissionId);
    const { data } = await q.limit(1).maybeSingle();
    if (data) {
      return { fieldKey: def.field_key, fieldLabel: def.field_label ?? def.field_key, value };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// captarEnvio
// ---------------------------------------------------------------------------

export type CaptacaoDeps = {
  emitAlert?: typeof emitFormResubmissionAlert;
  emitNotification?: typeof emitDedupSubmissionNotification;
  /** Regista falhas no Sentry (as funcoes passam o captureError de sentry.ts). Omissao: so o log. */
  captureError?: (error: unknown, context?: Record<string, unknown>) => Promise<void> | void;
};

export type CaptarEnvioParams = {
  supabase: SupabaseLike;
  formId?: string | null;
  campaignId?: string | null;
  /** Organizacao do token (insert-lead). Se vier, o resolver recusa outra. */
  tokenOrganizationId?: string | null;
  origemTexto?: string | null;
  originId?: string | null;
  fieldValues: AnyRecord;
  definitions: FieldDefinition[];
  currentStep: number;
  totalSteps: number;
  isComplete: boolean;
  locale?: string | null;
  notes?: string | null;
  needsManualScheduling?: boolean;
  formName?: string | null;
  nifHash?: string | null;
  /** Resolucao ja feita pelo chamador (evita chamar o resolver duas vezes). */
  resolvido?: Resolvido;
  deps?: CaptacaoDeps;
};

export type CaptarEnvioResultado =
  | { ok: false; status: number; error: string; code?: 'RETRY' }
  | {
    ok: true;
    submissionId: string;
    entityId: string;
    created: boolean;
    /** Negocio aberto criado com a pessoa nova; null para pessoa conhecida ou se nao foi criado. */
    negocioId: string | null;
    outcome: DedupOutcome | null;
    organizationId: string;
    formId: string | null;
    campaignId: string | null;
    contactos: Contactos;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };

type Candidato = {
  entity_id: string;
  matched_by?: string[] | null;
  email?: string | null;
  phone?: string | null;
  client_since?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
};

const falha = (status: number, error: string, code?: 'RETRY'): CaptarEnvioResultado =>
  code ? { ok: false, status, error, code } : { ok: false, status, error };

const primeiraLinha = <T>(data: unknown): T | null =>
  Array.isArray(data) ? ((data[0] as T) ?? null) : ((data as T) ?? null);

function paraDedup(cands: Candidato[]): DedupCandidate[] {
  return cands.map((c) => ({
    entityId: c.entity_id,
    emails: c.email ? [c.email] : [],
    phones: c.phone ? [c.phone] : [],
  }));
}

function destino(c: Candidato | undefined, entityId: string): DedupNotificationTarget {
  return {
    targetType: c?.client_since ? 'client' : 'lead',
    targetId: entityId,
    assigneeAnewUserId: c?.assigned_to ?? c?.created_by ?? null,
  };
}

function resumoDaEntidade(c: Candidato | undefined, entityId: string): ExistingRoleSummary {
  const t = destino(c, entityId);
  const cliente = t.targetType === 'client';
  return {
    hasClient: cliente,
    activeLeadId: cliente ? null : entityId,
    clientId: cliente ? entityId : null,
    assigneeAnewUserId: t.assigneeAnewUserId,
    activeLeadAssigneeAnewUserId: cliente ? null : t.assigneeAnewUserId,
    clientAssigneeAnewUserId: cliente ? t.assigneeAnewUserId : null,
    targetType: t.targetType,
    targetId: entityId,
  };
}

function dedupPor(outcome: DedupOutcome | null, nif: boolean): string | null {
  if (nif) return 'nif';
  switch (outcome?.kind) {
    case 'MATCH_FORTE': return 'ambos';
    case 'MATCH_EMAIL': return 'email';
    case 'MATCH_TELEFONE': return 'telefone';
    case 'CONFLITO': return 'conflito';
    default: return null;
  }
}

function montarDedupMeta(outcome: DedupOutcome | null, por: string | null, c: Contactos, registo: string, conflito: string | null = null) {
  if (!outcome || !por) return null;
  return {
    kind: outcome.kind,
    por,
    registo,
    ...(por === 'ambos' || por === 'email' || por === 'conflito' ? { email_igual: c.email } : {}),
    ...(por === 'ambos' || por === 'telefone' || por === 'conflito' ? { telefone_igual: c.phone } : {}),
    ...(outcome.kind === 'MATCH_EMAIL' && outcome.novoTelefone ? { novo_telefone: outcome.novoTelefone } : {}),
    ...(outcome.kind === 'MATCH_TELEFONE' && outcome.novoEmail ? { novo_email: outcome.novoEmail } : {}),
    ...(conflito ? { conflito } : {}),
  };
}

function entidadeDoOutcome(o: DedupOutcome | null): string | null {
  if (!o) return null;
  if (o.kind === 'MATCH_FORTE' || o.kind === 'MATCH_EMAIL' || o.kind === 'MATCH_TELEFONE') return o.entityId;
  if (o.kind === 'CONFLITO') return o.entityIdEmail;
  return null;
}

async function acharCandidatos(
  supabase: SupabaseLike,
  organizationId: string,
  c: Contactos,
  nifHash: string | null,
): Promise<{ ok: true; candidatos: Candidato[] } | { ok: false }> {
  const { data, error } = await supabase.rpc('fn_form_achar_entidades', {
    p_organization_id: organizationId,
    p_email: c.email,
    p_phone: c.phone,
    p_nif_hash: nifHash,
  });
  if (error) {
    // Sem a pesquisa nao se sabe se a pessoa ja existe: criar seria duplicar.
    console.error('[formCaptacao] pesquisa de entidades falhou:', error.message);
    return { ok: false };
  }
  return { ok: true, candidatos: Array.isArray(data) ? (data as Candidato[]) : [] };
}

export type Resolvido = {
  organizationId: string;
  formId: string | null;
  campaignId: string | null;
  campaignVia: string | null;
  originId: string | null;
  originRecognized: boolean | null;
  channelId: string | null;
};

/**
 * Pergunta a base qual a organizacao, o formulario e a campanha validos para
 * este envio. Organizacao NULL = formulario/campanha inexistente ou de outra
 * organizacao: aborta antes de qualquer escrita (404, ou 403 com token).
 */
export async function resolverCaptacao(
  supabase: SupabaseLike,
  p: {
    formId?: string | null;
    campaignId?: string | null;
    tokenOrganizationId?: string | null;
    origemTexto?: string | null;
    originId?: string | null;
  },
): Promise<({ ok: true } & Resolvido) | { ok: false; status: number; error: string }> {
  const { data, error } = await supabase.rpc('fn_form_resolver_captacao', {
    p_form_id: p.formId ?? null,
    p_campaign_id: p.campaignId ?? null,
    p_origem: p.origemTexto ?? null,
    p_organization_id: p.tokenOrganizationId ?? null,
    p_origin_id: p.originId ?? null,
  });
  if (error) {
    console.error('[formCaptacao] resolver falhou:', error.message);
    return { ok: false, status: 500, error: 'Failed to resolve form' };
  }
  const r = primeiraLinha<AnyRecord>(data);
  if (!r || !r.organization_id) {
    const status = p.tokenOrganizationId ? 403 : 404;
    return { ok: false, status, error: status === 403 ? 'Forbidden' : 'Form not found' };
  }
  return {
    ok: true,
    organizationId: r.organization_id,
    formId: r.form_id ?? null,
    campaignId: r.campaign_id ?? null,
    campaignVia: r.campaign_via ?? null,
    originId: r.origin_id ?? null,
    originRecognized: r.origin_recognized ?? null,
    channelId: r.channel_id ?? null,
  };
}

/**
 * Nome completo repetido nos dois campos (META Lead Ads) passa a primeiro e
 * ultimo. Devolve um objeto novo; so toca em chaves que o formulario ja tem.
 */
export function normalizarNomesNosCampos(fieldValues: AnyRecord, definitions: FieldDefinition[]): AnyRecord {
  const campos = lerCamposContacto(fieldValues, definitions);
  const mapa: Record<string, string> = {};
  for (const d of definitions ?? []) {
    if (d.contact_field_mapping && d.field_key) mapa[d.contact_field_mapping] = d.field_key;
  }
  const chave = (prop: string, ...aliases: string[]): string | null =>
    mapa[prop] ?? [prop, ...aliases].find((k) => fieldValues[k] !== undefined) ?? null;
  const novo: AnyRecord = { ...fieldValues };
  const fnKey = chave('first_name', 'po_nome', 'nome');
  const lnKey = chave('last_name', 'po_apelido', 'apelido');
  if (campos.firstName && fnKey && fieldValues[fnKey] !== undefined && String(fieldValues[fnKey]).trim() !== campos.firstName) {
    novo[fnKey] = campos.firstName;
  }
  if (campos.lastName && lnKey && String(fieldValues[lnKey] ?? '').trim() !== campos.lastName) {
    novo[lnKey] = campos.lastName;
  }
  return novo;
}

export async function captarEnvio(p: CaptarEnvioParams): Promise<CaptarEnvioResultado> {
  const { supabase } = p;
  const emitAlert = p.deps?.emitAlert ?? emitFormResubmissionAlert;
  const emitNotification = p.deps?.emitNotification ?? emitDedupSubmissionNotification;
  const registar = async (error: unknown, stage: string): Promise<void> => {
    try {
      await p.deps?.captureError?.(error, { function: 'formCaptacao', stage });
    } catch (e) {
      console.error('[formCaptacao] captureError falhou:', e);
    }
  };

  // 1) Resolver: a organizacao vem da base, nunca do cliente.
  const resolvido = p.resolvido
    ? ({ ok: true, ...p.resolvido } as const)
    : await resolverCaptacao(supabase, p);
  if (!resolvido.ok) return falha(resolvido.status, resolvido.error);
  const r = {
    campaign_via: resolvido.campaignVia,
    origin_id: resolvido.originId,
    origin_recognized: resolvido.originRecognized,
    channel_id: resolvido.channelId,
  };
  const organizationId: string = resolvido.organizationId;
  const formId: string | null = resolvido.formId;
  const campaignId: string | null = resolvido.campaignId;

  // 2) Contactos normalizados e pesquisa.
  const campos = lerCamposContacto(p.fieldValues, p.definitions);
  const contactos = collectContactos(campos.rawEmail, campos.rawPhone);
  const pesquisa = await acharCandidatos(supabase, organizationId, contactos, p.nifHash ?? null);
  // Pesquisa falhada: 503 RETRY antes de qualquer escrita (nunca entidade nova as cegas).
  if (!pesquisa.ok) return falha(503, 'Não foi possível processar o pedido. Tente novamente.', 'RETRY');
  const candidatos = pesquisa.candidatos;

  let outcome: DedupOutcome | null = null;
  try {
    outcome = classifyDedupOutcome(paraDedup(candidatos), { email: contactos.email, phone: contactos.phone });
  } catch (e) {
    // Sem classificar nao se sabe se a pessoa ja existe: criar seria duplicar. Igual a pesquisa falhada.
    console.error('[formCaptacao] classificacao falhou:', e);
    await registar(e, 'classificacao');
    return falha(503, 'Não foi possível processar o pedido. Tente novamente.', 'RETRY');
  }
  let entityId = entidadeDoOutcome(outcome);
  let porNif = false;
  if (!entityId) {
    const nifHit = candidatos.find((c) => c.matched_by?.includes('nif'));
    if (nifHit) {
      entityId = nifHit.entity_id;
      porNif = true;
      outcome = { kind: 'MATCH_FORTE', entityId };
    }
  }

  const extraNotas = [
    ...contactos.extraEmails.map((e) => `Email adicional: ${e}`),
    ...contactos.extraPhones.map((t) => `Telefone adicional: ${t}`),
  ];
  const notasFinal = [p.notes?.trim() || null, ...extraNotas].filter(Boolean).join('\n') || null;
  const extra = contactos.extraEmails.length || contactos.extraPhones.length
    ? { extra_emails: contactos.extraEmails, extra_phones: contactos.extraPhones }
    : null;

  let submissionId: string | null = null;
  let created = false;
  let jaGravado = false;

  // 3) Entidade nova: uma transacao na base (entidade, contactos, morada, toque).
  if (!entityId) {
    const { data, error } = await supabase.rpc('fn_form_criar_entidade', {
      p_organization_id: organizationId,
      p_form_id: formId,
      p_campaign_id: campaignId,
      p_campaign_via: r.campaign_via ?? null,
      p_origin_id: r.origin_id ?? null,
      p_origin_recognized: r.origin_recognized ?? null,
      p_channel_id: r.channel_id ?? null,
      p_first_name: campos.firstName,
      p_last_name: campos.lastName,
      p_email: contactos.email,
      p_phone: contactos.phone,
      p_locale: p.locale ?? null,
      p_street: campos.morada?.street ?? null,
      p_postal_code: campos.morada?.postal_code ?? null,
      p_city: campos.morada?.city ?? null,
      p_notes: notasFinal,
      p_extra: extra,
      p_field_values: p.fieldValues,
      p_status: p.isComplete ? 'complete' : 'in_progress',
      p_is_complete: p.isComplete,
      p_current_step: p.currentStep,
      p_total_steps: p.totalSteps,
      p_needs_manual_scheduling: !!p.needsManualScheduling,
    });
    if (error) {
      console.error('[formCaptacao] fn_form_criar_entidade falhou:', error.code, error.message);
      return error.code === '22023'
        ? falha(400, 'Invalid form parameters')
        : falha(500, 'Failed to record form submission');
    }
    const row = primeiraLinha<AnyRecord>(data);
    if (!row?.entity_id || !row?.submission_id) return falha(500, 'Failed to record form submission');
    entityId = row.entity_id as string;
    submissionId = row.submission_id as string;
    created = row.created !== false;
    jaGravado = true;
    if (created) {
      // Base sem a 4.a coluna (antes da migration): sem negocio, nunca undefined.
      const negocioId = typeof row.negocio_id === 'string' && row.negocio_id ? row.negocio_id : null;
      return {
        ok: true, submissionId, entityId, created: true, negocioId, outcome: null,
        organizationId, formId, campaignId, contactos,
        firstName: campos.firstName, lastName: campos.lastName, email: contactos.email,
      };
    }
    // Corrida: outro envio criou a ficha primeiro. Segue como conhecida.
    // O toque ja esta gravado; se esta segunda pesquisa falhar, segue-se com a entidade devolvida.
    const pesquisa2 = await acharCandidatos(supabase, organizationId, contactos, p.nifHash ?? null);
    const outra = pesquisa2.ok ? pesquisa2.candidatos : [];
    // O toque ja esta gravado: se esta classificacao falhar, regista e segue como sucesso
    // (um 500 faria o visitante repetir e duplicar o toque).
    let reclass: DedupOutcome | null = null;
    try {
      reclass = classifyDedupOutcome(paraDedup(outra), { email: contactos.email, phone: contactos.phone });
      candidatos.splice(0, candidatos.length, ...outra);
    } catch (e) {
      console.error('[formCaptacao] 2.a classificacao falhou (toque ja gravado, a continuar):', e);
      await registar(e, 'reclassificacao');
    }
    outcome = reclass && entidadeDoOutcome(reclass) ? reclass : {
      kind: contactos.email ? 'MATCH_EMAIL' : contactos.phone ? 'MATCH_TELEFONE' : 'MATCH_FORTE',
      entityId,
    } as DedupOutcome;
    if (reclass && entidadeDoOutcome(reclass)) entityId = entidadeDoOutcome(reclass);
  }

  // 4) Ficha conhecida: so o toque novo guarda os dados; a ficha nao e escrita.
  const finalEntityId = entityId as string;
  const candidato = candidatos.find((c) => c.entity_id === finalEntityId);
  const conflitoId = outcome?.kind === 'CONFLITO' ? outcome.entityIdTelefone : null;
  const alvo = destino(candidato, finalEntityId);
  const por = dedupPor(outcome, porNif);

  if (!jaGravado) {
    const rootOrgId = (await resolveRootOrganizationId(supabase, organizationId)) || organizationId;
    const dedupMeta = montarDedupMeta(outcome, por, contactos, alvo.targetType, conflitoId);
    const fieldValues = dedupMeta
      ? { ...p.fieldValues, _meta: { ...(p.fieldValues._meta ?? {}), dedup: dedupMeta } }
      : p.fieldValues;
    const { data, error } = await supabase.rpc('upsert_form_submission', {
      p_organization_id: organizationId,
      p_root_organization_id: rootOrgId,
      p_entity_id: finalEntityId,
      p_form_id: formId,
      p_campaign_id: campaignId,
      p_target_type: 'lead',
      p_target_id: finalEntityId,
      p_field_values: fieldValues,
      p_status: p.isComplete ? 'complete' : 'in_progress',
      p_is_complete: p.isComplete,
      p_current_step: p.currentStep,
      p_total_steps: p.totalSteps,
      p_origin_id: r.origin_id ?? null,
      p_origin_recognized: r.origin_recognized ?? null,
      p_channel_id: r.channel_id ?? null,
      p_campaign_via: r.campaign_via ?? null,
      p_needs_manual_scheduling: !!p.needsManualScheduling,
    });
    if (error || !data) {
      console.error('[formCaptacao] upsert_form_submission falhou:', error?.code, error?.message);
      return falha(500, 'Failed to record form submission');
    }
    submissionId = data as string;

    if (conflitoId) {
      const { error: confErr } = await supabase
        .from('form_submissions')
        .update({ conflicting_entity_id: conflitoId })
        .eq('id', submissionId)
        .eq('organization_id', organizationId);
      if (confErr) {
        // O conflito segue tambem em _meta.dedup.conflito (mesmo upsert), para a fila o mostrar.
        console.error('[formCaptacao] conflicting_entity_id nao gravado:', confErr.message);
        await registar(confErr, 'conflicting_entity_id');
      }
    }
  }

  // Carimbo: so last_activity_at. Best-effort, depois do toque gravado.
  try {
    const { error } = await supabase
      .from('anew_entities')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', finalEntityId)
      .eq('organization_id', organizationId);
    if (error) console.error('[formCaptacao] carimbo last_activity_at falhou:', error.message);
  } catch (e) {
    console.error('[formCaptacao] carimbo last_activity_at falhou:', e);
  }

  const nomeVisivel = composeDisplayName(campos.firstName, campos.lastName) || null;
  try {
    await emitAlert({
      supabase,
      organizationId,
      entityId: finalEntityId,
      summary: resumoDaEntidade(candidato, finalEntityId),
      campaignId,
      formId,
      fieldValuesDiff: null,
      displayName: nomeVisivel,
    });
  } catch (e) {
    console.error('[formCaptacao] alerta de reenvio falhou (a continuar):', e);
  }

  try {
    if (outcome) {
      const conflito = conflitoId ? candidatos.find((c) => c.entity_id === conflitoId) : undefined;
      await emitNotification({
        supabase,
        organizationId,
        entityId: finalEntityId,
        outcome,
        target: alvo,
        conflictTarget: conflitoId ? destino(conflito, conflitoId) : null,
        submissionId: submissionId as string,
        formId,
        campaignId,
        displayName: nomeVisivel,
        formName: p.formName ?? null,
      });
    }
  } catch (e) {
    console.error('[formCaptacao] notificacao de duplicado falhou (a continuar):', e);
  }

  return {
    ok: true, submissionId: submissionId as string, entityId: finalEntityId, created: false, negocioId: null, outcome,
    organizationId, formId, campaignId, contactos,
    firstName: campos.firstName, lastName: campos.lastName, email: contactos.email,
  };
}
