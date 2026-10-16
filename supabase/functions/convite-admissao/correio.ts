/**
 * O correio da admissao: envio DIRECTO pelo SMTP da organizacao do processo.
 *
 * NUNCA pela `send-email`, que grava o `body_html` em `email_logs`: o codigo
 * OTP (e o link do convite, com o token) ficariam la em claro. Aqui nada se
 * grava: nem o corpo, nem o endereco, nem o texto do erro do SMTP (que pode
 * trazer o destinatario ou credenciais). Uma falha sai so como CODIGO.
 *
 * O SMTP resolve-se sempre pela organizacao do processo (`resolverSmtp` e
 * `resolveOrganizationSmtp`, que filtra `organization_id` e `is_active`). O
 * `index.ts` liga `resolverSmtp` e `enviarSmtp` a `_shared/smtp.ts`; este
 * modulo e puro (sem Deno, sem nodemailer) para ser testavel no vitest.
 */
import { UUID, emailValido } from "./pedidoCriar.ts";

export interface PedidoCorreio {
  /** A organizacao DO PROCESSO (a que a RPC devolveu), nunca uma do pedido do browser. */
  organizationId: string;
  /** Um unico destinatario: o e-mail FIXADO no convite. */
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

export type ResultadoCorreio =
  | { enviado: true }
  | { enviado: false; erroCodigo: "smtp_nao_configurado" | "smtp_falhou" | "pedido_invalido" };

export interface DepsCorreio {
  resolverSmtp(organizationId: string): Promise<{ smtp: unknown } | null>;
  enviarSmtp(smtp: unknown, mensagem: { to: string; subject: string; html: string; text: string }): Promise<unknown>;
}

export function criarEnviadorCorreio(deps: DepsCorreio): (pedido: PedidoCorreio) => Promise<ResultadoCorreio> {
  return async (pedido) => {
    if (!UUID.test(pedido.organizationId) || !emailValido(pedido.para)) {
      return { enviado: false, erroCodigo: "pedido_invalido" };
    }
    try {
      const resolvido = await deps.resolverSmtp(pedido.organizationId);
      if (!resolvido) return { enviado: false, erroCodigo: "smtp_nao_configurado" };
      await deps.enviarSmtp(resolvido.smtp, {
        to: pedido.para,
        subject: pedido.assunto,
        html: pedido.html,
        text: pedido.texto,
      });
      return { enviado: true };
    } catch {
      // O texto do erro nao sai: so o codigo.
      return { enviado: false, erroCodigo: "smtp_falhou" };
    }
  };
}

/**
 * O e-mail para MOSTRAR (nunca o completo): a primeira letra do local e do dominio e o sufixo do
 * dominio, ex. "j***@d***.pt". Um valor que nao seja um e-mail da "***".
 */
export function mascararEmail(email: unknown): string {
  if (typeof email !== "string") return "***";
  const m = /^([^@\s]+)@([^@\s.]+(?:\.[^@\s.]+)*)\.([^@\s.]+)$/.exec(email);
  if (!m) return "***";
  return `${m[1][0]}***@${m[2][0]}***.${m[3]}`;
}

/**
 * O e-mail do OTP: curto, SEM dados pessoais (nem nome, nem organizacao, nem
 * link) -- so o codigo e a validade.
 */
export function conteudoOtp(codigo: string, validadeMinutos: number): { assunto: string; html: string; texto: string } {
  if (!/^\d{6}$/.test(codigo)) throw new Error("otp_pedido_invalido");
  const minutos = Math.max(1, Math.round(validadeMinutos));
  const prazo = `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  return {
    assunto: "Código de verificação",
    html: `<p>O seu código de verificação é <strong>${codigo}</strong>.</p>` +
      `<p>É válido durante ${prazo}. Se não pediu este código, ignore esta mensagem.</p>`,
    texto: `O seu código de verificação é ${codigo}.\n` +
      `É válido durante ${prazo}. Se não pediu este código, ignore esta mensagem.`,
  };
}
