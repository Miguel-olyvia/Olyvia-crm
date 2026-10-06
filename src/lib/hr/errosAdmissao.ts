/**
 * Os erros do convite de admissao, do lado do ecra.
 *
 * `supabase.functions.invoke` devolve `data = null` quando a Edge Function
 * responde com HTTP nao-2xx (401, 409, 429...): o corpo `{ error: "..." }`
 * fica em `error.context`, que e uma `Response`. Sem ler esse corpo, o ecra
 * so sabe dizer "algo correu mal" -- e por isso que este ficheiro existe.
 *
 * NUNCA se mostra o codigo em bruto a quem preenche o convite: todo o codigo,
 * conhecido ou nao, acaba num texto na lingua do ecra.
 *
 * E o UNICO catalogo de erros do convite no cliente. A amarra a Edge Function
 * `convite-admissao` e `errosAdmissao.test.ts`: todo o codigo de
 * `CODIGOS_PUBLICOS` (`supabase/functions/convite-admissao/erros.ts`) tem de
 * ter chave de traducao em `CHAVE_POR_CODIGO` ou estar em
 * `CODIGOS_SEM_TEXTO_PROPRIO`; e cada chave tem de existir nas traducoes.
 */

import { rotuloDeCampoAdmissao } from "@/components/hr/rotuloCampoAdmissao";

export type TraduzirFn = (chave: string, params?: Record<string, string | number>) => string;

export interface CorpoErroEdge {
  error?: string;
  campos?: unknown;
  [chave: string]: unknown;
}

function comoObjecto(valor: unknown): CorpoErroEdge | null {
  return valor !== null && typeof valor === "object" ? (valor as CorpoErroEdge) : null;
}

/**
 * O corpo de erro da Edge Function, venha ele em `data` (2xx com `error`) ou
 * em `error.context` (nao-2xx). `null` quando nao ha corpo legivel.
 */
export async function corpoDeErroEdge(error: unknown, data: unknown): Promise<CorpoErroEdge | null> {
  const doData = comoObjecto(data);
  if (doData && typeof doData.error === "string") return doData;

  const contexto = comoObjecto(error)?.context as
    | { clone?: () => { json: () => Promise<unknown> } }
    | undefined;
  if (contexto && typeof contexto.clone === "function") {
    try {
      const corpo = comoObjecto(await contexto.clone().json());
      if (corpo && typeof corpo.error === "string") return corpo;
    } catch {
      // Corpo ausente ou que nao e JSON: cai no `null` abaixo.
    }
  }
  return null;
}

/** So o codigo do erro, ou `null`. */
export async function codigoDeErroEdge(error: unknown, data: unknown): Promise<string | null> {
  const corpo = await corpoDeErroEdge(error, data);
  return typeof corpo?.error === "string" ? corpo.error : null;
}

export type MotivoConvite =
  | "usado"
  | "substituido"
  | "expirado"
  | "bloqueado"
  | "inexistente"
  | "demasiadasTentativas";

/** Do codigo de recusa ao motivo mostrado quando o link deixa de servir. */
export function motivoDoCodigo(codigo: string | null): MotivoConvite {
  switch (codigo) {
    case "convite_ja_usado":
      return "usado";
    case "convite_revogado":
      return "substituido";
    case "convite_expirado":
      return "expirado";
    case "convite_bloqueado":
      return "bloqueado";
    case "demasiadas_tentativas":
      return "demasiadasTentativas";
    default:
      return "inexistente";
  }
}

/** Os codigos de campo que faltam: `campos[]` ou o formato antigo "admissao_incompleta: a, b". */
export function camposDeAdmissaoIncompleta(corpo: { error?: string; campos?: unknown }): string[] {
  if (Array.isArray(corpo.campos)) {
    return corpo.campos.filter((c): c is string => typeof c === "string" && c !== "");
  }
  const erro = corpo.error ?? "";
  const separador = erro.indexOf(":");
  if (!erro.startsWith("admissao_incompleta") || separador < 0) return [];
  return erro
    .slice(separador + 1)
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^[a-z0-9_]+$/.test(c));
}

const CHAVE_POR_CODIGO: Readonly<Record<string, string>> = {
  assinatura_obrigatoria: "hr.convite.erro.assinatura",
  nif_ja_existe: "hr.convite.erro.nifJaExiste",
  niss_ja_existe: "hr.convite.erro.nissJaExiste",
  nif_invalido: "hr.convite.erro.nifInvalido",
  niss_invalido: "hr.convite.erro.nissInvalido",
  iban_invalido: "hr.convite.erro.ibanInvalido",
  bic_invalido: "hr.convite.erro.bicInvalido",
  pais_invalido: "hr.convite.erro.paisInvalido",
  // Anexos do convite. Os codigos de tamanho reutilizam as chaves do lote B.
  anexo_formato_invalido: "hr.convite.erro.anexoFormato",
  anexo_demasiado_grande: "hr.convite.erro.anexoFormato",
  anexo_fotografia_formato: "hr.convite.erro.fotografiaFormato",
  anexo_fotografia_demasiado_grande: "hr.convite.erro.fotografiaGrande",
  anexo_maximo_ficheiros: "hr.convite.erro.anexosDemasiados",
  anexo_tipo_cheio: "hr.convite.erro.anexoTipoCheio",
  anexo_vazio: "hr.convite.erro.anexoVazio",
  anexo_limite_convite: "hr.convite.erro.anexoLimiteConvite",
  anexo_nao_encontrado: "hr.convite.erro.anexoNaoEncontrado",
  anexo_nao_carregado: "hr.convite.erro.anexoNaoCarregado",
  anexo_estado_invalido: "hr.convite.erro.anexoEstadoInvalido",
  anexo_tipo_invalido: "hr.convite.erro.anexoFalhaEnvio",
  anexo_falha_envio: "hr.convite.erro.anexoFalhaEnvio",
  admissao_incompleta: "hr.convite.erro.faltaPreencher",
  convite_invalido: "hr.convite.motivo.inexistente",
  convite_ja_usado: "hr.convite.motivo.usado",
  convite_revogado: "hr.convite.motivo.substituido",
  convite_expirado: "hr.convite.motivo.expirado",
  convite_bloqueado: "hr.convite.motivo.bloqueado",
  demasiadas_tentativas: "hr.convite.motivo.demasiadasTentativas",
  // Lado do RH (ecra autenticado): reaproveitam o texto que ja existe.
  ficha_incompleta: "hr.acesso.erroFichaIncompleta",
  sem_sessao: "friendlyError.sessionExpired",
  insufficient_privilege: "friendlyError.forbidden",
  pessoa_nao_encontrada: "hr.convite.erro.pessoaNaoEncontrada",
  validade_invalida: "hr.convite.erro.validadeInvalida",
  erro_inesperado: "hr.convite.erro.inesperado",
};

/**
 * Os codigos publicos da Edge Function `convite-admissao` que NAO tem texto
 * proprio, de proposito. `errosAdmissao.test.ts` exige que todo o codigo de
 * `CODIGOS_PUBLICOS` tenha chave em `CHAVE_POR_CODIGO` OU esteja aqui: um
 * codigo novo sem uma coisa nem outra faz o teste falhar em vez de cair em
 * silencio no texto generico.
 */
export const CODIGOS_SEM_TEXTO_PROPRIO: readonly string[] = [
  "pedido_invalido", // erro de programacao do cliente: texto generico
  "accao_desconhecida", // erro de programacao do cliente: texto generico
  "rascunho_nao_gravado", // nunca mostrado: o rascunho nao interrompe o preenchimento
  "rascunho_demasiado_grande", // idem
];

/** A chave de traducao do codigo, ou `null` quando nao ha texto proprio (pedido_invalido, desconhecido). */
export function chaveDeErroAdmissao(
  codigo: string,
): { chave: string; params?: Record<string, string> } | null {
  const chave = CHAVE_POR_CODIGO[codigo];
  return chave ? { chave } : null;
}

/** Sempre texto na lingua do ecra; o fallback e `hr.convite.erroSubmeter`. Nunca o codigo em bruto. */
export function mensagemErroAdmissao(
  t: TraduzirFn,
  corpo: { error?: string; campos?: unknown },
): string {
  const codigo = (corpo.error ?? "").split(":")[0].trim();
  const entrada = chaveDeErroAdmissao(codigo);
  if (!entrada) return t("hr.convite.erroSubmeter");
  if (codigo === "admissao_incompleta") {
    const campos = camposDeAdmissaoIncompleta(corpo)
      .map((c) => rotuloDeCampoAdmissao(t, c))
      .join(", ");
    return campos ? t(entrada.chave, { campos }) : t("hr.convite.erroSubmeter");
  }
  return t(entrada.chave, entrada.params);
}
