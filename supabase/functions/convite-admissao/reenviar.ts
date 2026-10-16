/**
 * A accao `reenviar` do RH: reenvia o MESMO link do convite (sem o regenerar).
 *
 * O handler valida o JWT, deriva o actor DELE, valida os ids e aplica os
 * limites; este modulo chama `rpc_hr_convite_admissao_reenviar` (so
 * `service_role`, com `p_actor`), compoe o e-mail com o token que a RPC
 * devolve e envia-o por correio directo (NUNCA pela `send-email`, que gravaria
 * o link em `email_logs`).
 *
 * O TOKEN so serve a Edge para compor o e-mail: nunca vai para o browser, nem
 * para o Sentry, nem para a consola. O destinatario e o e-mail FIXADO no
 * convite, e o SMTP e o da organizacao DO PROCESSO (ambos vindos da RPC).
 */
import type { PedidoCorreio, ResultadoCorreio } from "./correio.ts";
import { eObjecto, respostaErro, respostaErroRpc, type ClienteRpc, type RespostaAccaoPortal } from "./accoesPortal.ts";
import { UUID, emailValido, formatarValidade, htmlConvite, linkDoConvite, textoConvite } from "./pedidoCriar.ts";

export interface ArgsReenviar {
  svc: ClienteRpc;
  enviarCorreio: (pedido: PedidoCorreio) => Promise<ResultadoCorreio>;
  conviteId: string;
  organizationId: string;
  /** auth.users.id, derivado do JWT. */
  actor: string;
  baseUrl: string;
  reportar(origem: string, erro: unknown): void;
  registarErro(erro: Error): void;
}

const ASSUNTO = "Convite de admissão";

/** Melhor-esforco: o resultado do envio fica no convite, so com o CODIGO do erro. */
async function registarEnvio(args: ArgsReenviar, resultado: ResultadoCorreio): Promise<void> {
  try {
    const { error } = await args.svc.rpc("rpc_hr_convite_admissao_registar_envio", {
      p_convite_id: args.conviteId,
      p_enviado: resultado.enviado,
      p_erro: resultado.enviado ? null : resultado.erroCodigo,
    });
    if (error) args.reportar("reenviar registar_envio", error);
  } catch (e) {
    args.reportar("reenviar registar_envio", e);
  }
}

export async function reenviarConvite(args: ArgsReenviar): Promise<RespostaAccaoPortal> {
  const { data, error } = await args.svc.rpc("rpc_hr_convite_admissao_reenviar", {
    p_convite_id: args.conviteId,
    p_organization_id: args.organizationId,
    p_actor: args.actor,
  });
  if (error) {
    const r = respostaErroRpc(args, "reenviar", error, false);
    // "Sem permissao" e "nao existe" dao o MESMO erro, para nao revelar processos.
    return r.body.error === "insufficient_privilege" ? respostaErro("nao_encontrado") : r;
  }

  const token = eObjecto(data) ? data.token : undefined;
  if (
    !eObjecto(data) || typeof token !== "string" || token.length < 20 || token.length > 200 ||
    !emailValido(data.email_destino) || typeof data.organization_id !== "string" || !UUID.test(data.organization_id)
  ) {
    args.registarErro(new Error("convite-admissao reenviar: resposta da RPC invalida"));
    return respostaErro("erro_inesperado");
  }

  const link = linkDoConvite(args.baseUrl, token);
  const validade = typeof data.valid_until === "string" ? data.valid_until : null;
  const prazo = formatarValidade(validade);
  let resultado: ResultadoCorreio;
  try {
    resultado = await args.enviarCorreio({
      organizationId: data.organization_id,
      para: data.email_destino,
      assunto: ASSUNTO,
      html: htmlConvite(link, prazo),
      texto: textoConvite(link, prazo),
    });
  } catch (e) {
    args.reportar("reenviar correio", e);
    resultado = { enviado: false, erroCodigo: "smtp_falhou" };
  }
  await registarEnvio(args, resultado);

  if (!resultado.enviado) {
    args.registarErro(new Error(`convite-admissao reenviar: correio ${resultado.erroCodigo}`));
    return respostaErro("email_nao_enviado");
  }
  return { status: 200, body: { ok: true, email_enviado: true, valid_until: validade } };
}
