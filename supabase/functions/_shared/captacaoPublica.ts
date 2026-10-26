// Captacao publica (create-lead e insert-lead): defesas e resposta ao visitante.
//
// Sem imports remotos (testavel no vitest). O zod entra por parametro: as
// Edge Functions passam o `z` de `npm:zod`, os testes o de `zod`.
//
// - honeypot: campo `website`, escondido no formulario; preenchido = bot.
// - impressao digital: HMAC-SHA256 (chave de servidor, NIF_HMAC_KEY) de email
//   (minusculas) + ultimos 9 digitos do telefone. Sem a chave nao ha hash: falha
//   em fechado. Nunca se guarda nem se regista o email ou o telefone em claro.
// - limites: por formulario+organizacao e por impressao digital, alem do
//   limite por IP que cada funcao ja tinha.
// - resposta: igual para pessoa nova e conhecida; nunca devolve negocioId,
//   entityId nem created.

import { sanitizeEmail, sanitizePhone } from './inputSanitizers.ts';
import { lerCamposContacto, type FieldDefinition } from './formCaptacao.ts';
import {
  checkRateLimit,
  recordRateLimitAttempt,
  type RateLimitOptions,
  type RateLimitResult,
} from './rateLimit.ts';

// deno-lint-ignore no-explicit-any
type SupabaseLike = any;
// deno-lint-ignore no-explicit-any
type ZodNs = any;

export const HONEYPOT_CAMPO = 'website';
export const NOME_MAX = 200;
export const LIMITE_FORMULARIO = { maxAttempts: 30, windowMinutes: 10 } as const;
export const LIMITE_IMPRESSAO = { maxAttempts: 3, windowMinutes: 60 } as const;
/** insert-lead ja exige token: a impressao digital tem um limite mais folgado. */
export const LIMITE_IMPRESSAO_COM_TOKEN = { maxAttempts: 20, windowMinutes: 60 } as const;

// ---------------------------------------------------------------------------
// Honeypot
// ---------------------------------------------------------------------------

/** Um humano nunca preenche o campo escondido: qualquer valor que nao seja vazio e bot. */
export function honeypotPreenchido(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false;
  if (typeof valor === 'string') return valor.trim().length > 0;
  return true;
}

// ---------------------------------------------------------------------------
// Impressao digital
// ---------------------------------------------------------------------------

const textoOuVazio = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/**
 * HMAC-SHA256 (hex) de `email|ultimos9digitos` com a chave de servidor; null se
 * nao ha email nem telefone. Sem chave lanca erro (fecha em falha, nunca cai
 * num hash sem chave, que se inverte por dicionario).
 */
export async function impressaoDigital(
  email: unknown,
  telefone: unknown,
  hmacKey: Uint8Array | null | undefined,
): Promise<string | null> {
  if (!hmacKey || hmacKey.byteLength === 0) {
    throw new Error('impressaoDigital: chave de servidor em falta (NIF_HMAC_KEY); pedido recusado');
  }
  const mail = textoOuVazio(email).trim().toLowerCase();
  const digitos = textoOuVazio(telefone).replace(/\D/g, '').slice(-9);
  if (!mail && !digitos) return null;
  const key = await crypto.subtle.importKey('raw', new Uint8Array(hmacKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${mail}|${digitos}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Pedido e registos (sem eco de dados do visitante)
// ---------------------------------------------------------------------------

/** Resposta generica a um corpo que o schema recusa: nunca devolve `issues` ao visitante anonimo. */
export const PEDIDO_INVALIDO = { error: 'Invalid request' } as const;

/** Le o corpo JSON; corpo vazio ou invalido devolve ok=false (o chamador responde 400, nunca 500). */
export async function lerCorpoJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

/** Avisos de rejeicao para o log: dizem que houve rejeicao, nunca o valor recebido. */
export function avisosDeRejeicao(report: { email_rejected?: unknown; phone_rejected?: unknown }, funcao: string): string[] {
  const avisos: string[] = [];
  if (report.email_rejected) avisos.push(`[${funcao}] email rejeitado por invalido`);
  if (report.phone_rejected) avisos.push(`[${funcao}] telefone rejeitado por invalido`);
  return avisos;
}

// ---------------------------------------------------------------------------
// Validacao (zod)
// ---------------------------------------------------------------------------

const VAZIOS = new Set(['', '-', '--', '0', 'n/a', 'na']);

function paraLista(raw: unknown): unknown[] {
  const itens = Array.isArray(raw) ? raw : raw === null || raw === undefined ? [] : [raw];
  return itens
    .map((i) => (typeof i === 'number' ? String(i) : i))
    .filter((i) => !(typeof i === 'string' && VAZIOS.has(i.trim().toLowerCase())) && i !== null && i !== undefined);
}

export type ValidacaoContactos = { ok: true } | { ok: false; error: string };

/**
 * Email, telefone e nome (ate 200) lidos pelo mapeamento do formulario. A
 * mensagem nunca repete o valor recebido.
 */
export function validarContactosPublicos(
  z: ZodNs,
  fieldValues: Record<string, unknown>,
  definitions: FieldDefinition[],
): ValidacaoContactos {
  const campos = lerCamposContacto(fieldValues ?? {}, definitions ?? []);
  const schema = z.object({
    emails: z.array(z.string().max(254).refine((v: string) => sanitizeEmail(v) !== null)),
    phones: z.array(z.string().max(50).refine((v: string) => sanitizePhone(v) !== null)),
    nomes: z.array(z.string().max(NOME_MAX)),
  });
  const r = schema.safeParse({
    emails: paraLista(campos.rawEmail),
    phones: paraLista(campos.rawPhone),
    nomes: [campos.firstName, campos.lastName].filter((n) => n !== null),
  });
  if (r.success) return { ok: true };
  const campo = r.error.issues?.[0]?.path?.[0];
  const mensagem = campo === 'emails' ? 'Invalid email'
    : campo === 'phones' ? 'Invalid phone'
    : campo === 'nomes' ? `Name exceeds ${NOME_MAX} characters`
    : 'Invalid request';
  return { ok: false, error: mensagem };
}

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

export type Limitador = {
  check: (supabase: SupabaseLike, options: RateLimitOptions) => Promise<RateLimitResult>;
  record: (supabase: SupabaseLike, bucket: string, identifier: string) => Promise<void>;
};

const limitadorReal: Limitador = { check: checkRateLimit, record: recordRateLimitAttempt };

export type LimitesCaptacao = { allowed: true } | { allowed: false; result: RateLimitResult };

/**
 * Verifica o balde do formulario (por organizacao) e o da impressao digital.
 * So regista a tentativa quando os dois deixam passar, para que um pedido
 * recusado nao se conte a si proprio.
 */
export async function verificarLimitesCaptacao(p: {
  supabase: SupabaseLike;
  organizationId: string;
  formKey: string;
  fingerprint: string | null;
  bucketPrefix: string;
  /** Omissao: LIMITE_IMPRESSAO. insert-lead (com token) passa LIMITE_IMPRESSAO_COM_TOKEN. */
  limiteImpressao?: { maxAttempts: number; windowMinutes: number };
  limiter?: Limitador;
}): Promise<LimitesCaptacao> {
  const limiter = p.limiter ?? limitadorReal;
  const baldes: Array<{ bucket: string; identifier: string; maxAttempts: number; windowMinutes: number }> = [
    { bucket: `${p.bucketPrefix}:formulario`, identifier: `${p.organizationId}:${p.formKey}`, ...LIMITE_FORMULARIO },
  ];
  if (p.fingerprint) {
    // A organizacao entra no identificador: a mesma pessoa noutra organizacao nao gasta esta quota.
    baldes.push({
      bucket: `${p.bucketPrefix}:impressao`,
      identifier: `${p.organizationId}:${p.fingerprint}`,
      ...(p.limiteImpressao ?? LIMITE_IMPRESSAO),
    });
  }
  for (const b of baldes) {
    const result = await limiter.check(p.supabase, b);
    if (!result.allowed) return { allowed: false, result };
  }
  for (const b of baldes) await limiter.record(p.supabase, b.bucket, b.identifier);
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Resposta ao visitante anonimo
// ---------------------------------------------------------------------------

export type RespostaPublica = {
  success: true;
  lead_id: string;
  target_type: 'lead';
  target_id: string;
  current_step: number;
  total_steps: number;
  is_complete: boolean;
  next_step: number | null;
  sanitized: Record<string, unknown>;
  message: string;
};

function corpoPublico(
  submissionId: string,
  currentStep: number,
  totalSteps: number,
  isComplete: boolean,
  sanitized: Record<string, unknown>,
): RespostaPublica {
  return {
    success: true,
    lead_id: submissionId,
    target_type: 'lead',
    target_id: submissionId,
    current_step: currentStep,
    total_steps: totalSteps,
    is_complete: isComplete,
    next_step: isComplete ? null : currentStep + 1,
    sanitized,
    message: isComplete ? 'Lead created successfully' : `Step ${currentStep} completed. Continue with update-lead API.`,
  };
}

/** Igual para pessoa nova e conhecida: so recebe o que o visitante pode ver. */
export function montarRespostaPublica(p: {
  submissionId: string;
  currentStep: number;
  totalSteps: number;
  isComplete: boolean;
  sanitized: Record<string, unknown>;
}): RespostaPublica {
  return corpoPublico(p.submissionId, p.currentStep, p.totalSteps, p.isComplete, p.sanitized);
}

/** Sucesso falso para bots: mesmo formato, id que nao existe, nada escrito. */
export function montarRespostaHoneypot(p: { currentStep: number; totalSteps: number }): RespostaPublica {
  return corpoPublico(crypto.randomUUID(), p.currentStep, p.totalSteps, p.currentStep >= p.totalSteps, {});
}
