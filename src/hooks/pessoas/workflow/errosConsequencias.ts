// O erro de gravar uma consequência: NG008, NG009 e 42501 com as mensagens do separador «Negócios»; NG026 (a conta pertence a mais do que uma
// organização com Pessoas) ainda não está no mapa geral de erros (`errosNeg.ts`, que não se mexe aqui), por isso reconhece-se na causa.
import { ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO } from "../errosNeg";
import { chaveErroNegocios } from "./errosWorkflow";

export const CHAVE_ERRO_NG026 = "pessoasPagina.real.workflow.neg.cons.error.ng026";
const NG026 = /(?<![A-Za-z0-9])NG026(?![0-9])/;

function textoDe(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function ehNg026(causa: unknown): boolean {
  if (typeof causa !== "object" || causa === null) return false;
  const c = causa as { code?: unknown; message?: unknown; details?: unknown };
  if (c.code === "NG026") return true;
  return [textoDe(c.message), textoDe(c.details)].some((t) => t !== null && NG026.test(t));
}

/** A chave de tradução do erro de uma gravação das consequências. */
export function chaveErroConsequencias(erro: unknown): string {
  if (erro instanceof ErroNeg && erro.codigo === null && ehNg026(erro.causa)) return CHAVE_ERRO_NG026;
  return chaveErroNegocios(erro) ?? CHAVE_ERRO_GENERICO;
}
