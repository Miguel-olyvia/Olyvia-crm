/**
 * O enviador de SMS (SMSAPI) do codigo de assinatura dos documentos do portal.
 * Copia o jeito da Edge `sms-otp` do CRM (POST a sms.do, Bearer, formato json), que
 * NAO se importa nem se altera. Sem Deno: o `fetch` e o token entram por parametro,
 * por isso testavel (nos testes nunca se chama a rede).
 *
 * REGRAS: nunca se regista o token, o numero, o texto da mensagem nem a resposta da
 * SMSAPI (traz o numero). Uma falha sai so como CODIGO. Timeout de 8 s.
 */
import type { PedidoSms, ResultadoSms } from "./accoesDocumentos.ts";

export const URL_SMSAPI = "https://api.smsapi.com/sms.do";
const TIMEOUT_MS = 8000;
const TELEMOVEL_E164 = /^\+[1-9][0-9]{6,14}$/;

export interface DepsSmsApi {
  /** O segredo SMSAPI_TOKEN; sem ele (vazio) o envio falha FECHADO com sms_nao_configurado. */
  token: string | null | undefined;
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{
    ok: boolean;
    json(): Promise<unknown>;
  }>;
}

export function criarEnviadorSms(deps: DepsSmsApi): (pedido: PedidoSms) => Promise<ResultadoSms> {
  return async (pedido) => {
    if (typeof deps.token !== "string" || deps.token.trim() === "") return { enviado: false, erroCodigo: "sms_nao_configurado" };
    if (!TELEMOVEL_E164.test(pedido.telefone) || pedido.texto.trim() === "") return { enviado: false, erroCodigo: "pedido_invalido" };
    const controlo = new AbortController();
    const temporizador = setTimeout(() => controlo.abort(), TIMEOUT_MS);
    try {
      const resposta = await deps.fetch(URL_SMSAPI, {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.token}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          to: pedido.telefone.replace("+", ""),
          message: pedido.texto,
          format: "json",
          encoding: "utf-8",
        }).toString(),
        signal: controlo.signal,
      });
      const corpo = await resposta.json().catch(() => null);
      const comErro = corpo !== null && typeof corpo === "object" && "error" in corpo && Boolean((corpo as { error: unknown }).error);
      return resposta.ok && !comErro ? { enviado: true } : { enviado: false, erroCodigo: "sms_falhou" };
    } catch {
      // O texto do erro nao sai: so o codigo.
      return { enviado: false, erroCodigo: "sms_falhou" };
    } finally {
      clearTimeout(temporizador);
    }
  };
}
