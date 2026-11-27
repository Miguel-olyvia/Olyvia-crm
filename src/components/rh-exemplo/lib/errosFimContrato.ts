/**
 * As mensagens de erro das regras de fim de contrato, do lado do ecrã. Na apresentação não há base que levante
 * códigos HRV, mas o ecrã continua a perguntar "que texto mostro para este erro?" com a mesma chamada.
 */
import { isPermissionError } from "@/components/rh-exemplo/lib/errosDeBase";
import { captureFlowError, type BusinessFlow } from "@/components/rh-exemplo/hooks/captureFlowError";
import { getFriendlyErrorMessage, getLocalizedFallback } from "@/utils/friendlyError";

/** Código de erro de regra -> chave de tradução. */
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
  HRV14: "hr.fimContrato.erro.HRV14",
};
/** A base diz «Ha N item(ns) por devolver.» (HRV14): o N entra no texto; sem ele fica o texto sem número. */
const N_ITENS_POR_DEVOLVER = /\bHa (\d+) item/;
const CHAVE_HRV14 = "hr.fimContrato.erro.HRV14";

function comONumeroDeItens(texto: string, erro: unknown): string {
  const { message } = erro as { message?: unknown };
  const n = typeof message === "string" ? N_ITENS_POR_DEVOLVER.exec(message)?.[1] : undefined;
  return n ? texto.replace("{n}", n) : texto.replace(" ({n})", "");
}


function temPropria(objecto: object, chave: string): boolean {
  return Object.prototype.hasOwnProperty.call(objecto, chave);
}

/** A chave de tradução de um erro reconhecido, ou `null`. */
export function chaveDeErroFimContrato(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const { code } = erro as { code?: unknown };
  if (typeof code === "string" && temPropria(CHAVE_POR_CODIGO_FIM_CONTRATO, code)) {
    return CHAVE_POR_CODIGO_FIM_CONTRATO[code];
  }
  return null;
}

/** O texto que o utilizador lê. Um erro reconhecido tem texto próprio; os restantes passam pelo texto genérico. */
export async function mensagemDeErroFimContrato(erro: unknown, fluxo: BusinessFlow): Promise<string> {
  const chave = chaveDeErroFimContrato(erro);
  if (chave === CHAVE_HRV14) return comONumeroDeItens(getLocalizedFallback(chave), erro);
  if (chave !== null) return getLocalizedFallback(chave);
  if (!isPermissionError(erro)) captureFlowError(erro, fluxo);
  return getFriendlyErrorMessage(erro);
}
