/**
 * O motor de fim de contrato, do lado do ecra: tipos, dominios e validacao.
 *
 * NENHUM VALOR LEGAL OU DE NEGOCIO ESTA AQUI. Os dias de aviso, o numero de
 * renovacoes, a duracao de cada uma e o que acontece ao atingir o limite vivem
 * na configuracao da organizacao (`hr_regras_fim_contrato`) e, por contrato,
 * numa excepcao (`pessoas_vinculos.fim_*`; NULL = herda). O ecra so mostra o que
 * a base devolve (`rpc_hr_vinculo_regra`, `rpc_hr_contratos_a_terminar`). O que
 * este ficheiro sabe sao os DOMINIOS (as opcoes dos CHECK da base) e os limites
 * dos CHECK de coluna, para nao mandar a base o que ela vai recusar.
 */

export const UNIDADES_DURACAO = ["meses", "dias"] as const;
export type UnidadeDuracao = (typeof UNIDADES_DURACAO)[number];

export const AO_ATINGIR_LIMITE = ["decisao_manual_rh", "converter_sem_termo"] as const;
export type AoAtingirLimite = (typeof AO_ATINGIR_LIMITE)[number];

export type FonteRegra = "organizacao" | "personalizado";

export const RESPOSTAS_INDICACAO = [
  "pretendo_continuar",
  "nao_pretendo_continuar",
  "ainda_por_decidir",
] as const;
export type RespostaIndicacao = (typeof RESPOSTAS_INDICACAO)[number];

export type OQueAcontece =
  | "desligado"
  | "termina"
  | "decisao_rh"
  | "renova_automaticamente"
  | "converte_sem_termo";

export type TipoRenovacao = "automatica" | "manual" | "conversao_sem_termo";

/** Limites dos CHECK de coluna (`dias_aviso BETWEEN 1 AND 365`, etc.). Nao sao regras de negocio. */
export const DIAS_AVISO_MIN = 1;
export const DIAS_AVISO_MAX = 365;

/** `hr_regras_fim_contrato`: as regras DA EMPRESA (os defaults). Sem linha = desligado. */
export interface RegraFimContratoOrg {
  ativo: boolean;
  dias_aviso: number;
  renovacao_automatica: boolean;
  max_renovacoes: number;
  duracao_renovacao_valor: number | null;
  duracao_renovacao_unidade: UnidadeDuracao | null;
  ao_atingir_limite: AoAtingirLimite;
}

/** O que o ecra mostra quando a organizacao ainda nao gravou nada: desligado, sem inventar numeros. */
export const REGRA_ORG_VAZIA: RegraFimContratoOrg = {
  ativo: false,
  dias_aviso: 30,
  renovacao_automatica: false,
  max_renovacoes: 0,
  duracao_renovacao_valor: null,
  duracao_renovacao_unidade: null,
  ao_atingir_limite: "decisao_manual_rh",
};

/** `rpc_hr_vinculo_regra`: a regra EFECTIVA de um contrato (a excepcao, ou a da organizacao). */
export interface RegraDoContrato {
  vinculo_id: string;
  ativo: boolean;
  renovacao_automatica: boolean;
  dias_aviso: number;
  max_renovacoes: number;
  duracao_valor: number | null;
  duracao_unidade: UnidadeDuracao | null;
  ao_atingir_limite: AoAtingirLimite;
  fonte: FonteRegra;
  renovacoes_realizadas: number;
  renovacoes_restantes: number;
  /** So contratos com prazo, com data de fim e em vigor. */
  no_ambito: boolean;
}

/** `rpc_hr_contratos_do_responsavel` e `rpc_hr_contrato_indicar`: so o que a chefia pode ver. */
export interface ContratoDoResponsavel {
  vinculo_id: string;
  pessoa_nome: string;
  tipo_contrato: string;
  data_fim: string;
  resposta: RespostaIndicacao | null;
  indicada_em: string | null;
}

/** `rpc_hr_contratos_a_terminar`. */
export interface ContratoATerminar {
  vinculo_id: string;
  pessoa_id: string;
  pessoa_nome: string;
  responsavel_nome: string | null;
  tipo_contrato: string;
  data_inicio: string;
  data_fim: string;
  /** Negativo se a data de fim ja passou. */
  dias_restantes: number;
  renovacoes_realizadas: number;
  max_renovacoes: number;
  ativo: boolean;
  renovacao_automatica: boolean;
  dias_aviso: number;
  ao_atingir_limite: AoAtingirLimite;
  fonte: FonteRegra;
  o_que_acontece: OQueAcontece;
  fim_decisao: string | null;
  resposta: RespostaIndicacao | null;
  resposta_em: string | null;
}

export interface RenovacaoContrato {
  id: string;
  vinculo_id: string;
  numero: number;
  tipo: TipoRenovacao;
  data_fim_anterior: string;
  data_fim_nova: string | null;
  feita_em: string;
  motivo: string | null;
}

export interface AvisoContrato {
  id: string;
  vinculo_id: string;
  ciclo_fim: string;
  marco: string;
  destino: string;
  estado: string;
  created_at: string;
}

export interface IndicacaoContrato {
  id: string;
  vinculo_id: string;
  ciclo_fim: string;
  resposta: RespostaIndicacao;
  indicada_em: string;
}

/** O formulario das regras (da organizacao ou da excepcao), tal como os inputs o guardam: texto. */
export interface FormRegraFimContrato {
  ativo: boolean;
  dias_aviso: string;
  /** "" = herda (so na excepcao); "sim" | "nao". */
  renovacao_automatica: "" | "sim" | "nao";
  max_renovacoes: string;
  duracao_valor: string;
  duracao_unidade: UnidadeDuracao | "";
  /** "" = herda (so na excepcao). */
  ao_atingir_limite: AoAtingirLimite | "";
}

export type ErroRegra = "dias" | "max" | "duracao";

/** Texto de input -> inteiro, ou `null` se vazio ou nao inteiro. */
export function inteiroOuNull(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isInteger(n) ? n : null;
}

/**
 * Os problemas do formulario, na medida em que a base os recusaria (HRV13):
 * dias de aviso entre 1 e 365, maximo de renovacoes inteiro e nao negativo,
 * duracao com valor positivo E unidade, ou nenhum dos dois. Campo vazio so e
 * valido onde "vazio" quer dizer "herda" (`herdaVazios`, na excepcao) ou onde
 * tem valor por omissao (`dias_aviso` na organizacao nao pode ficar vazio).
 */
export function problemasDaRegra(form: FormRegraFimContrato, herdaVazios: boolean): ErroRegra[] {
  const erros: ErroRegra[] = [];

  const dias = inteiroOuNull(form.dias_aviso);
  if (form.dias_aviso.trim() === "" ? !herdaVazios : dias === null || dias < DIAS_AVISO_MIN || dias > DIAS_AVISO_MAX) {
    erros.push("dias");
  }

  const max = inteiroOuNull(form.max_renovacoes);
  if (form.max_renovacoes.trim() === "" ? !herdaVazios : max === null || max < 0) {
    erros.push("max");
  }

  const temValor = form.duracao_valor.trim() !== "";
  const temUnidade = form.duracao_unidade !== "";
  const valor = inteiroOuNull(form.duracao_valor);
  if (temValor !== temUnidade || (temValor && (valor === null || valor <= 0))) {
    erros.push("duracao");
  }

  return erros;
}

/** Quando a duracao e "igual a inicial" (sem valor nem unidade). */
export function duracaoIgualInicial(valor: number | null, unidade: UnidadeDuracao | null): boolean {
  return valor === null || unidade === null;
}
