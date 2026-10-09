/**
 * Os erros do motor de fim de contrato, do lado do ecra.
 *
 * A base recusa com SQLSTATE proprio (HRV05 a HRV13); o PostgREST devolve-o em
 * `error.code`. NUNCA se mostra o codigo em bruto: todo o codigo conhecido acaba
 * num texto na lingua do ecra, e o desconhecido cai no `getFriendlyErrorMessage`.
 * Recusas de regra de negocio (os HRV) e de permissao nao vao para o Sentry --
 * sao a resposta correcta da base --; tudo o resto e defeito e e reportado.
 *
 *   HRV05 sem sessao, sem permissao, ou nao e o responsavel directo
 *   HRV06 contrato fora do ambito (so contratos com prazo, com data de fim e em vigor)
 *   HRV07 contrato marcado como nao renovavel
 *   HRV08 resposta invalida
 *   HRV09 limite de renovacoes atingido
 *   HRV10 a funcionalidade esta desligada
 *   HRV11 duracao de renovacao invalida
 *   HRV12 contador e decisao so mudam pelas RPCs
 *   HRV13 configuracao invalida
 */
import { captureFlowError, type BusinessFlow } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage, getLocalizedFallback } from "@/utils/friendlyError";
import { isPermissionError } from "@/lib/hr/hrDb";

/** SQLSTATE -> chave de traducao. */
export const CHAVE_POR_CODIGO_FIM_CONTRATO: Readonly<Record<string, string>> = {
  HRV05: "hr.fimContrato.erro.HRV05",
  HRV06: "hr.fimContrato.erro.HRV06",
  HRV07: "hr.fimContrato.erro.HRV07",
  HRV08: "hr.fimContrato.erro.HRV08",
  HRV09: "hr.fimContrato.erro.HRV09",
  HRV10: "hr.fimContrato.erro.HRV10",
  HRV11: "hr.fimContrato.erro.HRV11",
  HRV12: "hr.fimContrato.erro.HRV12",
  HRV13: "hr.fimContrato.erro.HRV13",
};

/** So chaves PROPRIAS (`constructor`, `toString`... do prototipo nao contam como codigo). */
function temPropria(objecto: object, chave: string): boolean {
  return Object.prototype.hasOwnProperty.call(objecto, chave);
}

/** A chave de traducao do erro, ou `null` quando nao e nosso. */
export function chaveDeErroFimContrato(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const { code } = erro as { code?: unknown };
  if (typeof code === "string" && temPropria(CHAVE_POR_CODIGO_FIM_CONTRATO, code)) {
    return CHAVE_POR_CODIGO_FIM_CONTRATO[code];
  }
  return null;
}

/** O texto para mostrar a quem usa o ecra, na lingua dele. */
export async function mensagemDeErroFimContrato(erro: unknown, fluxo: BusinessFlow): Promise<string> {
  const chave = chaveDeErroFimContrato(erro);
  if (chave !== null) return getLocalizedFallback(chave);
  if (!isPermissionError(erro)) captureFlowError(erro, fluxo);
  return getFriendlyErrorMessage(erro);
}
