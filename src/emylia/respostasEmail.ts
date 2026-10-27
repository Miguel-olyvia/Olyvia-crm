// As respostas das Edge Functions dos portais com o email (24/10/2026): criar-conta-portal e repor-password mandam o email pelo
// SMTP da organização (supabase/functions/_shared/enviarEmail.ts) e só devolvem a password quando o email NÃO seguiu. Sem
// supabase-js aqui, para se testar.
import type { ResultadoConta } from "./acessosPortal";

/** O email do envio: seguiu (`para`) ou não (`mensagem`, o motivo para o aviso no popup). Plano: sem strictNullChecks a
 *  união não se estreita. */
export interface EmailEnvio { enviado: boolean; para?: string; mensagem?: string;
  /** porque não seguiu: sem_smtp, limite, destino, erro, desligado (a versão do Ben de 23/10 dizia «falhou») */
  motivo?: string }

export function lerEmail(x: unknown): EmailEnvio | undefined {
  const e = x as { enviado?: unknown; para?: unknown; mensagem?: unknown; motivo?: unknown } | null | undefined;
  if (!e || typeof e !== "object") return undefined;
  if (e.enviado === true) return { enviado: true, para: typeof e.para === "string" ? e.para : "" };
  return { enviado: false, ...(typeof e.motivo === "string" ? { motivo: e.motivo } : {}),
    mensagem: typeof e.mensagem === "string" && e.mensagem ? e.mensagem : "O email não foi enviado — copie as credenciais." };
}

/** O email da resposta: o objeto `email` ou, de uma função mais antiga (14d145b), `email_enviado`/`email_motivo`. */
function emailDaResposta(r: { email?: unknown; email_enviado?: unknown; email_motivo?: unknown } | null): EmailEnvio | undefined {
  if (r?.email) return lerEmail(r.email);
  if (typeof r?.email_enviado !== "boolean") return undefined;
  return lerEmail({ enviado: r.email_enviado, motivo: typeof r.email_motivo === "string" ? r.email_motivo : undefined });
}

/** A resposta de criar-conta-portal. `credenciais`: a conta já existia mas levou credenciais novas (o reenvio). */
export function lerRespostaConta(data: unknown): ResultadoConta {
  const r = data as { criada?: boolean; credenciais?: boolean; password_temporaria?: unknown; email?: unknown; email_enviado?: unknown; email_motivo?: unknown } | null;
  const email = emailDaResposta(r);
  const password = typeof r?.password_temporaria === "string" ? r.password_temporaria : undefined;
  const nova = !!r?.criada || !!r?.credenciais;
  return { fase: "pronta", nova, ...(password ? { password } : {}), ...(email ? { email } : {}) };
}

/** A resposta de repor-password: a password (o email não seguiu) ou para quem foi enviada. */
export interface RespostaRepor {
  ok: boolean;
  /** só quando o email não seguiu (com `aviso`, o porquê) */
  password?: string; aviso?: string;
  /** o email seguiu para este endereço */
  enviadoPara?: string;
  /** a falha (ok: false) */
  mensagem?: string;
}

export function lerRespostaRepor(data: unknown): RespostaRepor {
  const r = data as { password_temporaria?: unknown; email?: unknown; email_enviado?: unknown; email_motivo?: unknown } | null;
  const email = emailDaResposta(r);
  if (email?.enviado) return { ok: true, enviadoPara: email.para };
  const p = r?.password_temporaria;
  if (typeof p === "string") return email && !email.enviado ? { ok: true, password: p, aviso: email.mensagem } : { ok: true, password: p };
  return { ok: false, mensagem: "A resposta não trouxe a password." };
}
