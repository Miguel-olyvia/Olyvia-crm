/**
 * As regras de assiduidade da organizacao (`hr_regras_assiduidade`): por agora, o PRAZO para justificar uma falta ou uma
 * justificacao de dia, em dias uteis. Configuravel por organizacao, 5 por omissao (decisao de 27/10).
 *
 * ESTE FICHEIRO E O CONTRATO ENTRE O ECRA E AS RPCs `rpc_hr_regras_assiduidade_ler` e `_guardar`
 * (desenho em supabase/rascunhos/DESENHO-prazo-configuravel.md, seccao 4). Enquanto a migration nao estiver aplicada,
 * as RPCs nao existem: o ecra di-lo e calcula com a omissao, em vez de partir.
 *
 * Um so sitio para os numeros: os limites 1 a 30 sao os do CHECK da tabela e os da validacao da RPC.
 */

/** O prazo de quem nunca o configurou, e o que o ecra usa para CALCULAR quando a leitura falha. */
export const PRAZO_JUSTIFICACAO_OMISSAO = 5;
export const PRAZO_JUSTIFICACAO_MIN = 1;
export const PRAZO_JUSTIFICACAO_MAX = 30;

/** Dias de calendario que a janela dos desvios cobre, no minimo: o prazo de 5 dias uteis cabe sempre. */
const JANELA_MINIMA_DIAS = 30;
/** Folga acima do prazo convertido em dias de calendario (fins de semana incluidos). */
const JANELA_FOLGA_DIAS = 7;

/** `true` para um inteiro entre 1 e 30. Qualquer outra coisa (NaN, texto, decimal) nao e um prazo. */
export function prazoJustificacaoValido(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor >= PRAZO_JUSTIFICACAO_MIN && valor <= PRAZO_JUSTIFICACAO_MAX;
}

export interface RegrasAssiduidade {
  prazoJustificacaoDias: number;
  /** `false`: a organizacao nunca guardou um valor, o 5 e a omissao. */
  gravado: boolean;
  /** Quem consulta tem a permissao de gravar (a base volta a verificar ao gravar). */
  podeAlterar: boolean;
}

/** O que o ecra assume quando nao ha resposta utilizavel: 5, nao gravado, sem poder alterar. */
export const REGRAS_ASSIDUIDADE_OMISSAO: RegrasAssiduidade = {
  prazoJustificacaoDias: PRAZO_JUSTIFICACAO_OMISSAO,
  gravado: false,
  podeAlterar: false,
};

/**
 * O que `rpc_hr_regras_assiduidade_ler` devolve (`TABLE(prazo_justificacao_dias, gravado, updated_at, pode_alterar)`): o
 * PostgREST entrega uma lista de uma linha, ou o objecto se a funcao for escalar. Qualquer outra coisa e a omissao.
 */
export function lerRespostaDasRegras(data: unknown): RegrasAssiduidade {
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha || typeof linha !== "object") return REGRAS_ASSIDUIDADE_OMISSAO;
  const { prazo_justificacao_dias: prazo, gravado, pode_alterar: podeAlterar } = linha as Record<string, unknown>;
  return {
    prazoJustificacaoDias: prazoJustificacaoValido(prazo) ? prazo : PRAZO_JUSTIFICACAO_OMISSAO,
    gravado: gravado === true,
    podeAlterar: podeAlterar === true,
  };
}

/**
 * Quantos dias de calendario para tras se procuram marcacoes por justificar: o prazo em dias uteis convertido (7/5) mais
 * uma folga, e nunca menos de 30. Com o prazo maximo (30 dias uteis) sao 49.
 */
export function janelaDeDesviosDias(prazoDias: number): number {
  const prazo = prazoJustificacaoValido(prazoDias) ? prazoDias : PRAZO_JUSTIFICACAO_OMISSAO;
  return Math.max(JANELA_MINIMA_DIAS, Math.ceil((prazo * 7) / 5) + JANELA_FOLGA_DIAS);
}

/** Os prefixos que `rpc_hr_regras_assiduidade_guardar` levanta, traduzidos em chave. */
const PREFIXOS: ReadonlyArray<[string, string]> = [
  ["regras_assiduidade_sem_permissao", "rhRegrasAssid.erro.semPermissao"],
  ["regras_assiduidade_prazo_invalido", "rhRegrasAssid.erro.prazoInvalido"],
];

const mensagemDe = (erro: unknown): string =>
  typeof erro === "string"
    ? erro
    : typeof (erro as { message?: unknown } | null)?.message === "string"
      ? (erro as { message: string }).message
      : "";

/** A chave de traducao do erro, ou `null` se nao o reconhece (quem chama usa entao a mensagem amigavel). */
export function chaveDoErroDeRegrasAssiduidade(erro: unknown): string | null {
  const mensagem = mensagemDe(erro);
  if (!mensagem) return null;
  const encontrado = PREFIXOS.find(([prefixo]) => mensagem.includes(prefixo));
  return encontrado ? encontrado[1] : null;
}
