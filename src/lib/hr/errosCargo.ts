/**
 * Os erros do cargo e do salario, do lado do ecra (fluxo 2).
 *
 * A base recusa com SQLSTATE proprio (HRC01 a HRC13) e mensagem
 * "token: frase em portugues". O PostgREST devolve `error.code` com o
 * SQLSTATE; quando ele falta (ou e um 23514 generico), o token antes dos dois
 * pontos da mensagem diz o mesmo. As recusas de igualdade salarial mantem o
 * 23514 e a mensagem a comecar por "igualdade_salarial:".
 *
 * NUNCA se mostra o codigo em bruto: todo o codigo conhecido acaba num texto na
 * lingua do ecra, e o desconhecido cai no `getFriendlyErrorMessage`.
 *
 * E o UNICO catalogo destes codigos no cliente. A amarra as migrations do fluxo 2
 * e `fluxo2CargoMigrations.test.ts`: todo o HRC que a base lanca tem de ter chave
 * aqui, e `errosCargo.test.ts` exige que cada chave exista nas cinco linguas.
 */
import { captureFlowError, type BusinessFlow } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage, getLocalizedFallback } from "@/utils/friendlyError";
import { isPermissionError } from "@/lib/hr/hrDb";

/** SQLSTATE (ou "igualdade_salarial") -> chave de traducao. */
export const CHAVE_POR_CODIGO: Readonly<Record<string, string>> = {
  HRC01: "hr.cargos.erro.salarioSoPorPeriodos",
  HRC02: "hr.cargos.erro.naoEncontrado",
  HRC03: "hr.cargos.erro.dadosInvalidos",
  HRC04: "hr.cargos.erro.dataInvalida",
  HRC05: "hr.cargos.erro.noPassado",
  HRC06: "hr.cargos.erro.alteracaoPosterior",
  HRC07: "hr.cargos.erro.semAlteracao",
  HRC08: "hr.cargos.erro.cargoObrigatorio",
  HRC09: "hr.cargos.erro.desactivado",
  HRC10: "hr.cargos.erro.soPorRpc",
  HRC11: "hr.cargos.erro.retribuicaoSemCargo",
  HRC12: "hr.cargos.erro.pessoaNaoEncontrada",
  HRC13: "hr.cargos.erro.demasiadosCortes",
  igualdade_salarial: "hr.cargos.erro.igualdadeSalarial",
  // 23P01 (exclusao): dois periodos do mesmo cargo, ou dois cargos da mesma
  // pessoa, que se cruzam. So se reconhece pelo TOKEN da mensagem: um 23P01
  // generico de outra tabela nao e nosso. Tem chave propria: o problema e uma
  // data que cruza outro periodo, e a mensagem diz isso.
  periodo_sobreposto: "hr.cargos.erro.sobreposto",
};

/** O token da mensagem ("alteracao_posterior_existe: ...") -> SQLSTATE (ou pseudo-codigo). */
export const CODIGO_POR_TOKEN: Readonly<Record<string, string>> = {
  cargo_salario_so_por_periodos: "HRC01",
  cargo_nao_encontrado: "HRC02",
  cargo_dados_invalidos: "HRC03",
  data_invalida: "HRC04",
  cargo_periodo_no_passado: "HRC05",
  alteracao_posterior_existe: "HRC06",
  sem_alteracao: "HRC07",
  cargo_obrigatorio: "HRC08",
  cargo_desactivado: "HRC09",
  cargo_so_por_rpc: "HRC10",
  retribuicao_sem_cargo: "HRC11",
  pessoa_nao_encontrada: "HRC12",
  retribuicao_demasiados_cortes: "HRC13",
  igualdade_salarial: "igualdade_salarial",
  cargo_periodo_sobreposto: "periodo_sobreposto",
  pessoa_cargo_sobreposto: "periodo_sobreposto",
};

/**
 * So chaves PROPRIAS: `in` e a indexacao simples apanham `constructor`,
 * `toString`, `__proto__`... do prototipo, e um erro com `code: "constructor"`
 * viraria um "codigo conhecido". Equivale a `Object.hasOwn`, que a lib ES2020
 * do projecto (tsconfig.app.json) ainda nao declara.
 */
function temPropria(objecto: object, chave: string): boolean {
  return Object.prototype.hasOwnProperty.call(objecto, chave);
}

/**
 * O codigo conhecido deste erro (HRC01..HRC13 ou "igualdade_salarial"), ou
 * `null`. Le `error.code`; em falta, ou se for um SQLSTATE generico (23514), o
 * token antes dos dois pontos da `message`.
 */
export function codigoDeErroCargo(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  if (typeof code === "string" && temPropria(CHAVE_POR_CODIGO, code)) return code;
  if (typeof message === "string") {
    const token = message.split(":")[0].trim();
    if (temPropria(CODIGO_POR_TOKEN, token)) return CODIGO_POR_TOKEN[token];
  }
  return null;
}

/** A chave de traducao do erro, ou `null` quando nao e nosso (cai no `getFriendlyErrorMessage`). */
export function chaveDeErroCargo(erro: unknown): string | null {
  const codigo = codigoDeErroCargo(erro);
  return codigo === null ? null : CHAVE_POR_CODIGO[codigo] ?? null;
}

/**
 * O texto para mostrar a quem usa o ecra. Recusas de regra de negocio (codigos
 * nossos) e de permissao nao vao para o Sentry: sao a resposta correcta da
 * base. Tudo o resto e defeito e e reportado em `fluxo`.
 */
export async function mensagemDeErroCargo(erro: unknown, fluxo: BusinessFlow): Promise<string> {
  const chave = chaveDeErroCargo(erro);
  if (chave !== null) return getLocalizedFallback(chave);
  if (!isPermissionError(erro)) captureFlowError(erro, fluxo);
  return getFriendlyErrorMessage(erro);
}
