/**
 * Tipos do modulo de Recursos Humanos -- Modulo 1 (Colaboradores).
 *
 * Espelham as onze tabelas criadas pelas migrations 20261120010000..20261120090000.
 * NAO ha aqui logica nenhuma: sao a forma das linhas e os valores que os CHECK
 * da base permitem, escritos uma vez para nao andarem espalhados por strings.
 *
 * PORQUE ESTAO AQUI E NAO EM integrations/supabase/types.ts
 * -------------------------------------------------------
 * Esse ficheiro e GERADO a partir do esquema remoto. Enquanto as migrations de
 * RH nao forem aplicadas, o gerador nao conhece a tabela `pessoas` -- e nao se
 * edita um ficheiro gerado a mao. Estes tipos sao a ponte, e ficam registados
 * como divida: depois do `db push` e da regeneracao, os selects passam a poder
 * usar os tipos gerados e este ficheiro reduz-se aos unioes de CHECK.
 */

// -- Uniao dos CHECK da base ------------------------------------------------

export type EstadoContrato = "em_curso" | "suspenso" | "terminado";
export type EstadoRegisto = "activo" | "arquivado";
export type DiaSemana = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";

export type Genero = "feminino" | "masculino" | "nao_binario" | "outro" | "nao_divulgar";
export type EstadoCivil =
  | "solteiro"
  | "casado"
  | "uniao_de_facto"
  | "divorciado"
  | "viuvo"
  | "separado";
export type TipoDocumento = "cartao_cidadao" | "passaporte" | "titulo_residencia" | "outro";
export type TipoMorada = "residencia" | "fiscal" | "correspondencia";

export type TipoContrato =
  | "sem_termo"
  | "termo_certo"
  | "termo_incerto"
  | "estagio"
  | "prestacao_servicos"
  | "temporario";
export type RegimeTrabalho = "tempo_inteiro" | "tempo_parcial";
export type EstadoVinculo = "activo" | "terminado" | "futuro";
export type Periodicidade = "mensal" | "anual" | "hora";
export type SubsidioAlimentacaoModo = "dinheiro" | "cartao";
export type EstadoConta = "activa" | "revogada";

export const DIAS_SEMANA: readonly DiaSemana[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
export const GENEROS: readonly Genero[] = [
  "feminino",
  "masculino",
  "nao_binario",
  "outro",
  "nao_divulgar",
];
export const ESTADOS_CIVIS: readonly EstadoCivil[] = [
  "solteiro",
  "casado",
  "uniao_de_facto",
  "divorciado",
  "viuvo",
  "separado",
];
export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = [
  "cartao_cidadao",
  "passaporte",
  "titulo_residencia",
  "outro",
];
export const ESTADOS_CONTRATO: readonly EstadoContrato[] = ["em_curso", "suspenso", "terminado"];

/**
 * Estado do acesso, mostrado na lista ao lado do estado do contrato.
 *
 * NAO e uma coluna: e derivado da conta ligada em `pessoas_contas`. Sao dois
 * ciclos de vida independentes -- uma pessoa com contrato em curso pode nao
 * ter conta nenhuma, e uma conta revogada nao termina contrato nenhum.
 */
export type EstadoAcesso = "ativo" | "convidado" | "semConta";

// -- Nucleo ------------------------------------------------------------------

export interface Pessoa {
  id: string;
  organization_id: string;
  numero_interno: string | null;
  primeiro_nome: string;
  apelido: string;
  /** Coluna gerada na base: nunca se escreve. */
  nome_completo: string;
  nome_social: string | null;
  email_trabalho: string | null;
  email_pessoal: string | null;
  telefone_trabalho: string | null;
  cargo: string | null;
  local_trabalho: string | null;
  entidade_legal_org_id: string | null;
  reporta_a_pessoa_id: string | null;
  data_admissao: string | null;
  data_antiguidade: string | null;
  data_saida: string | null;
  estado_contrato: EstadoContrato;
  estado_registo: EstadoRegisto;
  dias_trabalho: DiaSemana[] | null;
  notas: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Linha da lista: a pessoa mais o que se calcula em memoria para a mostrar. */
export interface PessoaListItem extends Pessoa {
  estadoAcesso: EstadoAcesso;
}

// -- Satelites ---------------------------------------------------------------

export interface PessoaDadosPessoais {
  id: string;
  pessoa_id: string;
  organization_id: string;
  data_nascimento: string | null;
  ocultar_aniversario: boolean;
  genero: Genero | null;
  pronomes: string | null;
  nacionalidade: string | null;
  telefone_pessoal: string | null;
  email_comunicacoes: string | null;
  estado_civil: EstadoCivil | null;
  dependentes: number | null;
  irs_retencao_percentagem: number | null;
}

/**
 * Identificacao SEM o NISS.
 *
 * A coluna `niss` esta revogada a `authenticated` ao nivel da coluna
 * (migration 20261120040000): nenhum select do cliente a pode pedir, e por
 * isso ela nao existe neste tipo -- de proposito, para que um `select` que a
 * inclua nao compile. O valor em claro so vem da RPC `rpc_hr_revelar_niss`.
 */
export interface PessoaIdentificacao {
  id: string;
  pessoa_id: string;
  organization_id: string;
  tipo_documento: TipoDocumento | null;
  numero_documento: string | null;
  validade_documento: string | null;
  nif: string | null;
  niss_ultimos4: string | null;
}

export interface PessoaMorada {
  id: string;
  pessoa_id: string;
  organization_id: string;
  tipo: TipoMorada;
  linha1: string;
  linha2: string | null;
  codigo_postal: string | null;
  localidade: string | null;
  distrito: string | null;
  pais: string;
  is_principal: boolean;
}

export interface PessoaContactoEmergencia {
  id: string;
  pessoa_id: string;
  organization_id: string;
  nome: string;
  relacao: string | null;
  telefone: string;
  telefone_alternativo: string | null;
  email: string | null;
  ordem: number;
}

export interface PessoaVinculo {
  id: string;
  pessoa_id: string;
  organization_id: string;
  tipo_contrato: TipoContrato;
  regime: RegimeTrabalho;
  horas_semanais: number | null;
  data_inicio: string;
  data_fim: string | null;
  motivo_termo: string | null;
  periodo_experimental_ate: string | null;
  entidade_legal_org_id: string | null;
  estado: EstadoVinculo;
}

export interface PessoaRetribuicao {
  id: string;
  pessoa_id: string;
  organization_id: string;
  vinculo_id: string | null;
  valor_base: number;
  moeda: string;
  periodicidade: Periodicidade;
  subsidio_alimentacao: number | null;
  subsidio_alimentacao_modo: SubsidioAlimentacaoModo | null;
  valido_de: string;
  valido_ate: string | null;
  motivo: string | null;
}

/**
 * Dados bancarios SEM IBAN em claro.
 *
 * Na base nao existe coluna de IBAN: existe `iban_secret_id` (Vault) e a
 * mascara. Nao ha RPC de leitura em claro nesta ronda, por isso a aplicacao
 * nunca ve o numero completo -- so os ultimos quatro digitos.
 */
export interface PessoaDadosBancarios {
  id: string;
  pessoa_id: string;
  organization_id: string;
  titular: string | null;
  banco: string | null;
  iban_ultimos4: string | null;
  iban_pais: string | null;
  swift: string | null;
  is_principal: boolean;
}

export interface PessoaDadosSaude {
  id: string;
  pessoa_id: string;
  organization_id: string;
  incapacidade_percentagem: number | null;
  incapacidade_comprovativo_valido_ate: string | null;
  necessidades_adaptacao: string | null;
  observacoes: string | null;
}

export interface PessoaConta {
  id: string;
  pessoa_id: string;
  organization_id: string;
  anew_user_id: string;
  entity_id: string | null;
  estado: EstadoConta;
  ligada_em: string;
  revogada_em: string | null;
}
