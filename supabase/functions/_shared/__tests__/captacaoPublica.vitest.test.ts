// Captacao publica (create-lead e insert-lead): honeypot, impressao digital,
// limites por formulario e por pessoa, validacao zod e resposta ao visitante.
// Supabase e limitador simulados; nada toca na base.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  HONEYPOT_CAMPO,
  LIMITE_FORMULARIO,
  LIMITE_IMPRESSAO,
  LIMITE_IMPRESSAO_COM_TOKEN,
  PEDIDO_INVALIDO,
  avisosDeRejeicao,
  lerCorpoJson,
  honeypotPreenchido,
  impressaoDigital,
  montarRespostaPublica,
  montarRespostaHoneypot,
  validarContactosPublicos,
  verificarLimitesCaptacao,
} from '../captacaoPublica.ts';
import { getClientIp } from '../rateLimit.ts';

const KEY = new Uint8Array(32).fill(7);
const OUTRA_KEY = new Uint8Array(32).fill(9);
const ORG = 'aaaaaaaa-0000-4000-8000-000000000001';
const FORM = 'ffffffff-0000-4000-8000-000000000003';
const SUB = '99999999-0000-4000-8000-000000000007';

describe('honeypotPreenchido', () => {
  it('campo vazio, ausente ou so espacos nao e bot', () => {
    expect(HONEYPOT_CAMPO).toBe('website');
    expect(honeypotPreenchido(undefined)).toBe(false);
    expect(honeypotPreenchido(null)).toBe(false);
    expect(honeypotPreenchido('')).toBe(false);
    expect(honeypotPreenchido('   ')).toBe(false);
  });
  it('qualquer texto, ou um valor que nao e texto, e bot', () => {
    expect(honeypotPreenchido('http://spam.example')).toBe(true);
    expect(honeypotPreenchido(0)).toBe(true);
    expect(honeypotPreenchido({ a: 1 })).toBe(true);
  });
});

describe('impressaoDigital', () => {
  it('e sha256 em hex e nunca contem o email nem o telefone em claro', async () => {
    const fp = await impressaoDigital('Ana@Exemplo.PT', '+351 912 345 678', KEY);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain('ana');
    expect(fp).not.toContain('912345678');
  });
  it('email em maiusculas e espacos nao muda o resultado', async () => {
    expect(await impressaoDigital('  ANA@exemplo.pt ', '912345678', KEY))
      .toBe(await impressaoDigital('ana@exemplo.pt', '912345678', KEY));
  });
  it('conta so os ultimos 9 digitos do telefone (prefixo e formatacao nao contam)', async () => {
    const a = await impressaoDigital('a@x.pt', '+351 912 345 678', KEY);
    const b = await impressaoDigital('a@x.pt', '00351912345678', KEY);
    const c = await impressaoDigital('a@x.pt', '912-345-678', KEY);
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
  it('emails ou telefones diferentes dao impressoes diferentes', async () => {
    const base = await impressaoDigital('a@x.pt', '912345678', KEY);
    expect(await impressaoDigital('b@x.pt', '912345678', KEY)).not.toBe(base);
    expect(await impressaoDigital('a@x.pt', '912345679', KEY)).not.toBe(base);
  });
  it('sem email nem telefone devolve null (nao ha pessoa a limitar)', async () => {
    expect(await impressaoDigital(null, undefined, KEY)).toBeNull();
    expect(await impressaoDigital('  ', 'abc', KEY)).toBeNull();
  });
  it('so com um dos dois tambem identifica', async () => {
    expect(await impressaoDigital('a@x.pt', null, KEY)).toMatch(/^[0-9a-f]{64}$/);
    expect(await impressaoDigital(null, '912345678', KEY)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('impressaoDigital - HMAC com chave de servidor', () => {
  it('e HMAC-SHA256 hex de email|ultimos9digitos com a chave dada (nao um sha256 simples)', async () => {
    const k = await crypto.subtle.importKey('raw', KEY, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('a@x.pt|912345678'));
    const esperado = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(await impressaoDigital('A@X.pt', '+351 912 345 678', KEY)).toBe(esperado);
    const simples = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('a@x.pt|912345678'));
    const simplesHex = Array.from(new Uint8Array(simples), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(esperado).not.toBe(simplesHex);
  });
  it('chaves diferentes dao impressoes diferentes', async () => {
    expect(await impressaoDigital('a@x.pt', '912345678', KEY))
      .not.toBe(await impressaoDigital('a@x.pt', '912345678', OUTRA_KEY));
  });
  it('sem chave falha em fechado com erro claro (nunca devolve um hash sem chave)', async () => {
    await expect(impressaoDigital('a@x.pt', '912345678', undefined)).rejects.toThrow(/NIF_HMAC_KEY|chave/i);
    await expect(impressaoDigital('a@x.pt', '912345678', new Uint8Array(0))).rejects.toThrow(/chave/i);
  });
});

describe('validarContactosPublicos (zod)', () => {
  const defs = [
    { field_key: 'nome', contact_field_mapping: 'first_name' },
    { field_key: 'apelido', contact_field_mapping: 'last_name' },
    { field_key: 'mail', contact_field_mapping: 'email' },
    { field_key: 'tel', contact_field_mapping: 'phone' },
  ];
  const ok = { nome: 'Ana', apelido: 'Silva', mail: 'ana@exemplo.pt', tel: '912345678' };

  it('valores validos passam', () => {
    expect(validarContactosPublicos(z, ok, defs)).toEqual({ ok: true });
  });
  it('sem contactos nenhuns passa (passo sem esses campos)', () => {
    expect(validarContactosPublicos(z, { outro: 'x' }, defs)).toEqual({ ok: true });
  });
  it('email invalido e recusado, sem eco do valor', () => {
    const r = validarContactosPublicos(z, { ...ok, mail: 'nao-e-email' }, defs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toContain('nao-e-email');
  });
  it('telefone invalido e recusado', () => {
    expect(validarContactosPublicos(z, { ...ok, tel: '12' }, defs).ok).toBe(false);
  });
  it('nome com mais de 200 caracteres e recusado; com 200 passa', () => {
    expect(validarContactosPublicos(z, { ...ok, nome: 'a'.repeat(201) }, defs).ok).toBe(false);
    expect(validarContactosPublicos(z, { ...ok, nome: 'a'.repeat(200) }, defs).ok).toBe(true);
    expect(validarContactosPublicos(z, { ...ok, apelido: 'b'.repeat(201) }, defs).ok).toBe(false);
  });
  it('lista de emails: um invalido recusa o conjunto', () => {
    expect(validarContactosPublicos(z, { ...ok, mail: ['a@x.pt', 'lixo'] }, defs).ok).toBe(false);
    expect(validarContactosPublicos(z, { ...ok, mail: ['a@x.pt', 'b@x.pt'] }, defs).ok).toBe(true);
  });
  it('valor que nao e texto (objeto) e recusado', () => {
    expect(validarContactosPublicos(z, { ...ok, mail: { a: 1 } }, defs).ok).toBe(false);
  });
  it('marcadores de vazio (-, n/a) contam como ausentes', () => {
    expect(validarContactosPublicos(z, { ...ok, mail: 'n/a', tel: '-' }, defs).ok).toBe(true);
  });
});

describe('verificarLimitesCaptacao', () => {
  const mkLimiter = (permitido: (bucket: string) => boolean) => ({
    check: vi.fn(async (_s: unknown, o: { bucket: string }) => ({
      allowed: permitido(o.bucket),
      retryAfterSeconds: permitido(o.bucket) ? 0 : 120,
    })),
    record: vi.fn(async () => undefined),
  });
  const args = (limiter: ReturnType<typeof mkLimiter>, fp: string | null = 'fp1') => ({
    supabase: {}, organizationId: ORG, formKey: FORM, fingerprint: fp, bucketPrefix: 'create-lead', limiter,
  });

  it('constantes: 30 por 10 min por formulario, 3 por hora por pessoa', () => {
    expect(LIMITE_FORMULARIO).toEqual({ maxAttempts: 30, windowMinutes: 10 });
    expect(LIMITE_IMPRESSAO).toEqual({ maxAttempts: 3, windowMinutes: 60 });
  });
  it('dentro dos limites: verifica os dois baldes e regista os dois', async () => {
    const l = mkLimiter(() => true);
    const r = await verificarLimitesCaptacao(args(l));
    expect(r.allowed).toBe(true);
    const buckets = l.check.mock.calls.map((c) => (c[1] as any).bucket);
    expect(buckets).toEqual(['create-lead:formulario', 'create-lead:impressao']);
    expect((l.check.mock.calls[0][1] as any).identifier).toBe(`${ORG}:${FORM}`);
    expect(l.record).toHaveBeenCalledTimes(2);
  });
  it('limite do formulario excedido: recusa e nao regista nada', async () => {
    const l = mkLimiter((b) => !b.endsWith(':formulario'));
    const r = await verificarLimitesCaptacao(args(l));
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.result.retryAfterSeconds).toBe(120);
    expect(l.record).not.toHaveBeenCalled();
  });
  it('limite da pessoa excedido: recusa e nao regista nada', async () => {
    const l = mkLimiter((b) => !b.endsWith(':impressao'));
    const r = await verificarLimitesCaptacao(args(l));
    expect(r.allowed).toBe(false);
    expect(l.record).not.toHaveBeenCalled();
  });
  it('sem impressao digital so conta o balde do formulario', async () => {
    const l = mkLimiter(() => true);
    await verificarLimitesCaptacao(args(l, null));
    expect(l.check).toHaveBeenCalledTimes(1);
    expect(l.record).toHaveBeenCalledTimes(1);
  });
  it('o identificador do balde da pessoa e organizacao:impressao, nunca o email', async () => {
    const l = mkLimiter(() => true);
    await verificarLimitesCaptacao(args(l, 'abc123'));
    expect((l.check.mock.calls[1][1] as any).identifier).toBe(`${ORG}:abc123`);
    expect(l.record.mock.calls[1]).toEqual([expect.anything(), 'create-lead:impressao', `${ORG}:abc123`]);
  });
  it('a mesma impressao em organizacoes diferentes conta em baldes diferentes', async () => {
    const l = mkLimiter(() => true);
    await verificarLimitesCaptacao({ ...args(l, 'abc123'), organizationId: 'outra-org' });
    expect((l.check.mock.calls[1][1] as any).identifier).toBe('outra-org:abc123');
  });
  it('limiteImpressao sobe o limite so do balde da pessoa (insert-lead, com token)', async () => {
    const l = mkLimiter(() => true);
    expect(LIMITE_IMPRESSAO_COM_TOKEN).toEqual({ maxAttempts: 20, windowMinutes: 60 });
    await verificarLimitesCaptacao({ ...args(l, 'abc123'), limiteImpressao: LIMITE_IMPRESSAO_COM_TOKEN });
    expect(l.check.mock.calls[1][1]).toMatchObject({ maxAttempts: 20, windowMinutes: 60 });
    expect(l.check.mock.calls[0][1]).toMatchObject({ maxAttempts: 30, windowMinutes: 10 });
  });
  it('sem limiteImpressao usa o LIMITE_IMPRESSAO de 3 por hora', async () => {
    const l = mkLimiter(() => true);
    await verificarLimitesCaptacao(args(l, 'abc123'));
    expect(l.check.mock.calls[1][1]).toMatchObject({ maxAttempts: 3, windowMinutes: 60 });
  });
});

describe('resposta ao visitante anonimo', () => {
  const base = { submissionId: SUB, currentStep: 1, totalSteps: 2, isComplete: false, sanitized: {} };
  it('pessoa nova e pessoa conhecida recebem exatamente o mesmo corpo', () => {
    const nova = montarRespostaPublica({ ...base, created: true, negocioId: 'n1', entityId: 'e1' } as any);
    const conhecida = montarRespostaPublica({ ...base, created: false, negocioId: null, entityId: 'e2' } as any);
    expect(nova).toEqual(conhecida);
  });
  it('nunca expoe negocioId, entityId nem created', () => {
    const r = montarRespostaPublica({ ...base, created: true, negocioId: 'n1', entityId: 'e1' } as any);
    const txt = JSON.stringify(r);
    for (const proibido of ['negocio', 'entity', 'created', 'n1', 'e1']) expect(txt).not.toContain(proibido);
    expect(r).toMatchObject({ success: true, lead_id: SUB, target_id: SUB, target_type: 'lead' });
  });
  it('mensagem depende so do passo, nunca de a pessoa ser nova', () => {
    expect(montarRespostaPublica({ ...base, isComplete: true }).message).toBe('Lead created successfully');
    expect(montarRespostaPublica(base).message).toContain('Step 1 completed');
    expect(montarRespostaPublica(base).next_step).toBe(2);
  });
  it('honeypot: mesmo formato do sucesso real, com um id que nao existe', () => {
    const real = montarRespostaPublica(base);
    const falsa = montarRespostaHoneypot({ currentStep: 1, totalSteps: 2 });
    expect(Object.keys(falsa).sort()).toEqual(Object.keys(real).sort());
    expect(falsa.lead_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(falsa.lead_id).not.toBe(SUB);
    expect(falsa.target_id).toBe(falsa.lead_id);
  });
});

describe('getClientIp', () => {
  const req = (h: Record<string, string>) => new Request('https://x.test', { headers: h });
  it('prefere cf-connecting-ip ao x-forwarded-for forjavel', () => {
    expect(getClientIp(req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4, 203.0.113.7' })))
      .toBe('203.0.113.7');
  });
  it('depois x-real-ip, depois o primeiro salto do x-forwarded-for', () => {
    expect(getClientIp(req({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '1.2.3.4' }))).toBe('198.51.100.2');
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
  });
  it('sem cabecalhos devolve unknown', () => {
    expect(getClientIp(req({}))).toBe('unknown');
  });
});

describe('lerCorpoJson', () => {
  const pedido = (corpo: string) => new Request('https://x.test/f', { method: 'POST', body: corpo });
  it('JSON valido devolve o corpo', async () => {
    expect(await lerCorpoJson(pedido('{"a":1}'))).toEqual({ ok: true, body: { a: 1 } });
  });
  it('JSON invalido ou vazio devolve ok=false (o chamador responde 400, nao 500)', async () => {
    expect(await lerCorpoJson(pedido('{nao e json'))).toEqual({ ok: false });
    expect(await lerCorpoJson(pedido(''))).toEqual({ ok: false });
  });
});

describe('avisosDeRejeicao', () => {
  it('diz so que foi rejeitado, nunca o valor recebido', () => {
    const avisos = avisosDeRejeicao(
      { email_rejected: 'segredo@exemplo.pt', phone_rejected: '+351 912 345 678' },
      'create-lead',
    );
    expect(avisos).toHaveLength(2);
    const texto = avisos.join(' ');
    expect(texto).toContain('create-lead');
    expect(texto).not.toContain('segredo');
    expect(texto).not.toContain('912');
  });
  it('sem rejeicoes nao devolve nada', () => {
    expect(avisosDeRejeicao({}, 'create-lead')).toEqual([]);
    expect(avisosDeRejeicao({ email_rejected: null, phone_rejected: '' }, 'x')).toEqual([]);
  });
});

describe('PEDIDO_INVALIDO', () => {
  it('e uma mensagem generica, sem detalhes do schema', () => {
    expect(PEDIDO_INVALIDO).toEqual({ error: 'Invalid request' });
  });
});
