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
import type { EstadoContratoDerivado } from "@/lib/hr/estadoContrato";

// -- Uniao dos CHECK da base ------------------------------------------------

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

/** Dominio de `pessoas_dados_pessoais.conjuge_situacao_profissional` (20261124030000). */
export type ConjugeSituacaoProfissional = "trabalhador" | "nao_trabalhador";

/**
 * Dominio de `pessoas_dados_pessoais.habilitacao_academica` (20261124030000).
 * Ordem crescente de escolaridade, a ordem em que o selector as mostra.
 */
export type HabilitacaoAcademica =
  | "sem_escolaridade"
  | "1_ciclo"
  | "2_ciclo"
  | "3_ciclo"
  | "secundario"
  | "pos_secundario"
  | "licenciatura"
  | "mestrado"
  | "doutoramento"
  | "outro";

/** Dominio de `pessoas_fardamento.tamanho_cima` (20261124070000) -- so letras. */
export type TamanhoFardamento = "xs" | "s" | "m" | "l" | "xl" | "xxl" | "outro";

/**
 * Dominio de `pessoas_fardamento.tamanho_calcado` (20261202060000) -- numero
 * europeu de sapato. Ate 20261202060000 esta coluna chamava-se
 * `tamanho_blazer` e usava o dominio de letras de `TamanhoFardamento`.
 */
export type TamanhoCalcado =
  | "35" | "36" | "37" | "38" | "39" | "40" | "41" | "42" | "43" | "44" | "45" | "46" | "47" | "48"
  | "outro";

/**
 * Dominio de `pessoas_fardamento.tamanho_baixo` (calcas, 20261202060000) --
 * letras E numero europeu de calcas coexistem, nunca so um dos dois.
 */
export type TamanhoCalcas = TamanhoFardamento | "34" | "36" | "38" | "40" | "42" | "44" | "46" | "48" | "50" | "52" | "54" | "56" | "58" | "60";

/**
 * Dominio de `pessoas_vinculos.tipo_contrato` (20261120200000).
 *
 * `estagio` e `prestacao_servicos` continuam LEGAIS na base e por isso
 * continuam aqui -- o que muda e `TIPOS_CONTRATO`, a lista que os ecras
 * oferecem, que deixou de os propor. Encolher o dominio tornaria ilegais linhas
 * que ja estivessem gravadas.
 *
 * `tempo_parcial` e o SEXTO tipo, pedido e confirmado pelo utilizador. Repete a
 * palavra de `RegimeTrabalho` mas e outra coluna: aqui e a natureza do
 * contrato, la e quanto se trabalha.
 */
export type TipoContrato =
  | "sem_termo"
  | "termo_certo"
  | "termo_incerto"
  | "duracao_muito_curta"
  | "estagio"
  | "prestacao_servicos"
  | "temporario"
  | "tempo_parcial";
export type RegimeTrabalho = "tempo_inteiro" | "tempo_parcial";
export type EstadoVinculo = "activo" | "suspenso" | "terminado" | "futuro";

/**
 * Categoria legal da funcao (`pessoas_vinculos.categoria_funcao`), usada SO
 * para calcular a sugestao de periodo experimental -- ver
 * `lib/hr/periodoExperimental.ts`. NAO vem de `pessoas.cargo`: essa coluna e
 * texto livre e derivar um prazo legal de uma cadeia de caracteres escrita a
 * mao seria inventar direito. Escolhe-se aqui, explicitamente, por quem cria
 * o contrato.
 */
export type CategoriaFuncao = "geral" | "tecnica_confianca" | "direcao_quadro_superior";

/**
 * De onde veio o valor gravado em `periodo_experimental_dias` /
 * `periodo_experimental_ate` (`pessoas_vinculos.periodo_experimental_origem`).
 * "sugerido" = igual ao que `lib/hr/periodoExperimental.ts` calculou e aceite
 * sem alteracao; "manual" = escolhido ou corrigido a mao (reducao por IRCT,
 * exclusao, etc.). Nunca se infere -- so se grava quando alguem escolhe ou
 * aceita uma sugestao.
 */
export type PeriodoExperimentalOrigem = "sugerido" | "manual";
/** Dominio de `pessoas_retribuicoes.periodicidade` (20261120200000). */
export type Periodicidade = "hora" | "diaria" | "semanal" | "mensal" | "anual";

/**
 * Formato da conta bancaria (`pessoas_dados_bancarios.formato_conta`,
 * 20261120220000).
 *
 * O formato NAO abre um segundo caminho de dados: o numero da conta vai sempre
 * para o Vault pela mesma RPC, qualquer que seja o formato. O que ele muda e a
 * validacao -- so `iban` passa pelo mod-97.
 */
export type FormatoConta =
  | "iban"
  | "conta_mais_sort_code"
  | "conta_mais_routing"
  | "clabe"
  | "banco_mais_conta"
  | "outro";

/**
 * Modalidade de trabalho (`pessoas_vinculos.tipo_trabalho`, 20261120140000).
 *
 * NAO e o mesmo que `RegimeTrabalho`: esse diz quanto se trabalha (tempo
 * inteiro / parcial), este diz DONDE se trabalha. A migration tem um COMMENT a
 * dizer exactamente isto, porque foi confundido uma vez.
 */
export type TipoTrabalho = "presencial" | "remoto" | "hibrido";
/**
 * Unidade de `horas_periodo` (`pessoas_vinculos.horas_frequencia`).
 *
 * As quatro hipoteses sao escreviveis desde 20261120190000: o tecto de 80h
 * deixou de estar na quantidade crua e passou para
 * `horas_semanais_equivalentes`, a coluna gerada que converte tudo para semana.
 * Os factores de conversao vivem em `src/lib/hr/horas.ts` e sao os mesmos que
 * a base usa.
 */
export type HorasFrequencia = "diaria" | "semanal" | "mensal" | "anual";
export type PoliticaFeriados = "nao_laboral" | "trabalho_habitual";

/** Tipo de local de trabalho (`hr_locais_trabalho.tipo`, 20261120130000). */
export type TipoLocal =
  | "sede"
  | "escritorio"
  | "loja"
  | "armazem"
  | "obra"
  | "cliente"
  | "remoto"
  | "outro";

/** Origem de um intervalo realizado. `picagem` existe no dominio; a ingestao nao. */
export type OrigemRealizado = "manual" | "picagem" | "importacao";
export type EstadoRealizado = "registado" | "validado" | "rejeitado";
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
export const CONJUGE_SITUACOES_PROFISSIONAIS: readonly ConjugeSituacaoProfissional[] = [
  "trabalhador",
  "nao_trabalhador",
];
export const HABILITACOES_ACADEMICAS: readonly HabilitacaoAcademica[] = [
  "sem_escolaridade",
  "1_ciclo",
  "2_ciclo",
  "3_ciclo",
  "secundario",
  "pos_secundario",
  "licenciatura",
  "mestrado",
  "doutoramento",
  "outro",
];
export const TAMANHOS_FARDAMENTO: readonly TamanhoFardamento[] = [
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "outro",
];
export const TAMANHOS_CALCADO: readonly TamanhoCalcado[] = [
  "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48",
  "outro",
];
export const TAMANHOS_CALCAS: readonly TamanhoCalcas[] = [
  "xs", "s", "m", "l", "xl", "xxl",
  "34", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60",
  "outro",
];
/**
 * Os quatro estados de `pessoas_vinculos.estado`, na ordem em que os ecras os
 * oferecem. `estado_contrato` (o do ecra de negocio) e SEMPRE derivado destes
 * -- ver `lib/hr/estadoContrato.ts`.
 */
export const ESTADOS_VINCULO: readonly EstadoVinculo[] = [
  "activo",
  "suspenso",
  "futuro",
  "terminado",
];
/**
 * Os SEIS tipos que os ecras OFERECEM, nesta ordem -- a que o utilizador
 * escreveu e confirmou.
 *
 * Nao e o dominio da base: `estagio` e `prestacao_servicos` continuam legais
 * e leem-se sem problema; simplesmente nao se propoem. Devolve-los e
 * acrescentar uma linha aqui, nao uma migration.
 */
export const TIPOS_CONTRATO: readonly TipoContrato[] = [
  "termo_certo",
  "sem_termo",
  "termo_incerto",
  "duracao_muito_curta",
  "temporario",
  "tempo_parcial",
];
export const REGIMES_TRABALHO: readonly RegimeTrabalho[] = ["tempo_inteiro", "tempo_parcial"];
export const CATEGORIAS_FUNCAO: readonly CategoriaFuncao[] = [
  "geral",
  "tecnica_confianca",
  "direcao_quadro_superior",
];
export const TIPOS_TRABALHO: readonly TipoTrabalho[] = ["presencial", "remoto", "hibrido"];
/** Dia, semana, mes, ano -- na ordem pedida. */
export const HORAS_FREQUENCIAS: readonly HorasFrequencia[] = [
  "diaria",
  "semanal",
  "mensal",
  "anual",
];
export const POLITICAS_FERIADOS: readonly PoliticaFeriados[] = [
  "nao_laboral",
  "trabalho_habitual",
];
export const PERIODICIDADES: readonly Periodicidade[] = [
  "hora",
  "diaria",
  "semanal",
  "mensal",
  "anual",
];
export const FORMATOS_CONTA: readonly FormatoConta[] = [
  "iban",
  "conta_mais_sort_code",
  "conta_mais_routing",
  "clabe",
  "banco_mais_conta",
  "outro",
];
export const TIPOS_LOCAL: readonly TipoLocal[] = [
  "sede",
  "escritorio",
  "loja",
  "armazem",
  "obra",
  "cliente",
  "remoto",
  "outro",
];

/**
 * Os sete dias por indice, na convencao da BASE (`dia_semana` 0 = domingo),
 * que e a mesma de `resource_availability_rules`. O ecra mostra segunda
 * primeiro; o indice guardado nao muda por causa disso.
 */
export const DIAS_SEMANA_INDICES: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

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
  email_trabalho: string | null;
  email_pessoal: string | null;
  telefone_trabalho: string | null;
  /**
   * LEGADO parcial desde `20261202070000`. Continua a ser o cargo mostrado
   * quando `cargo_id` e nulo. Quando `cargo_id` esta preenchido, e o cargo do
   * catalogo (`hr_cargos`) que manda no salario -- este texto perde efeito.
   */
  cargo: string | null;
  /** Cargo do catalogo (`hr_cargos`). Quando preenchido, o salario base da
   * pessoa passa a ser IMPOSTO pelo cargo -- ver `hr_retribuicao_valor_conforme_cargo`. */
  cargo_id: string | null;
  /**
   * LEGADO. Texto livre da ronda 1, mantido por `20261120170000` como legenda.
   * A fonte de verdade do local passou a ser `local_id`.
   */
  local_trabalho: string | null;
  /** Local predefinido da pessoa (`hr_locais_trabalho`), usado quando um
   * intervalo de horario nao indica local. */
  local_id: string | null;
  // NAO existe `departamento` nem `estrutura` aqui, e nao e omissao.
  // "Departamento" ja e um TIPO DE ORGANIZACAO no produto -- holding,
  // empresa, filial, departamento, equipa, divisao, projeto -- e o organograma
  // existe e funciona (ver PessoasOrganogramaTab). A pessoa liga-se a
  // organizacoes, e e dessa ligacao que o organograma sai. Um campo de texto
  // livre ao lado seria uma segunda verdade sobre a mesma coisa: o erro que
  // estado_contrato ja custou uma migration a desfazer.
  entidade_legal_org_id: string | null;
  reporta_a_pessoa_id: string | null;
  data_admissao: string | null;
  data_antiguidade: string | null;
  data_saida: string | null;
  estado_registo: EstadoRegisto;
  notas: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Linha da lista: a pessoa mais o que se calcula em memoria para a mostrar. */
export interface PessoaListItem extends Pessoa {
  estadoAcesso: EstadoAcesso;
  /**
   * Derivado de `pessoas_vinculos` numa unica consulta agregada da lista
   * inteira (ver `usePessoas.ts`) -- nunca uma coluna. `null` significa "nao
   * sabemos", nao "sem contrato": e o que acontece quando a consulta de
   * vinculos falha (falta de `hr.pessoas.vinculos.view`, ou janela de
   * deploy), e a lista tem de ficar de pe mesmo assim.
   */
  estado_contrato_derivado: EstadoContratoDerivado | null;
}

// -- Satelites ---------------------------------------------------------------

export interface PessoaDadosPessoais {
  id: string;
  pessoa_id: string;
  organization_id: string;
  data_nascimento: string | null;
  ocultar_aniversario: boolean;
  genero: Genero | null;
  nacionalidade: string | null;
  telefone_pessoal: string | null;
  estado_civil: EstadoCivil | null;
  dependentes: number | null;
  irs_retencao_percentagem: number | null;

  // -- Admissao, 20261124030000 ---------------------------------------------
  naturalidade_freguesia: string | null;
  naturalidade_concelho: string | null;
  /** ISO alpha-2, como `nacionalidade`. */
  naturalidade_pais: string | null;
  conjuge_situacao_profissional: ConjugeSituacaoProfissional | null;
  dependentes_deficientes: number | null;
  habilitacao_academica: HabilitacaoAcademica | null;
  habilitacao_data_conclusao: string | null;
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

  // -- Carta de conducao, 20261124040000. Grants por coluna: uma coluna nova
  // nesta tabela nao aparece sozinha -- precisa de GRANT explicito (ver a
  // migration e o bloco de conferir la descrito).
  carta_conducao_numero: string | null;
  carta_conducao_categorias: string | null;
  carta_conducao_validade: string | null;
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
  /**
   * A QUANTIDADE de horas, na unidade de `horas_frequencia` -- e nao
   * necessariamente por semana. Chamava-se `horas_semanais` ate
   * 20261120190000. Nunca comparar directamente com `horas_semanais_maximas`:
   * podem estar em unidades diferentes. Comparar sempre a equivalente.
   */
  horas_periodo: number | null;
  data_inicio: string;
  data_fim: string | null;
  motivo_termo: string | null;
  periodo_experimental_ate: string | null;
  entidade_legal_org_id: string | null;
  estado: EstadoVinculo;

  // -- Camada de tempo de trabalho (20261120140000) -------------------------
  tipo_trabalho: TipoTrabalho | null;
  /** Da unidade a `horas_periodo`. Nunca nulo na base (default 'semanal'). */
  horas_frequencia: HorasFrequencia;
  /**
   * Coluna GERADA na base: nunca se escreve. `horas_periodo` convertida para
   * semana pelos factores de `src/lib/hr/horas.ts`. E a unica grandeza de horas
   * comparavel entre contratos, e a que leva o tecto de 80h.
   */
  horas_semanais_equivalentes: number | null;
  /** FTE em percentagem, 0..100. */
  tempo_trabalho_pct: number | null;
  /** Dias uteis do CONTRATO. `pessoas.dias_trabalho` e agora legenda legada. */
  dias_uteis: DiaSemana[] | null;
  politica_feriados: PoliticaFeriados;
  horas_anuais_maximas: number | null;
  horas_semanais_maximas: number | null;
  /** Duracao explicita, ao lado de `periodo_experimental_ate`. Nao a substitui. */
  periodo_experimental_dias: number | null;
  /** Escolhida por quem cria o contrato; alimenta so a sugestao de periodo experimental. */
  categoria_funcao: CategoriaFuncao | null;
  /** `null` = nunca foi gravado por este ecra (contrato anterior a esta funcionalidade). */
  periodo_experimental_origem: PeriodoExperimentalOrigem | null;

  // -- Admissao, 20261124080000 ----------------------------------------------
  /**
   * Categoria do IRCT (ex.: "Tecnico de Manutencao de 2.a"), texto livre. NAO
   * e `categoria_funcao`: essa e um dos tres baldes legais que determinam o
   * periodo experimental. As duas convivem e nao se confundem.
   */
  categoria_profissional: string | null;
  /** `null` = por decidir. So faz sentido em contratos a termo. */
  renovavel: boolean | null;
  isencao_horario: boolean;
  formacao_inicio: string | null;
  formacao_fim: string | null;
}

/**
 * `pessoas_vinculos_horas` (20261130120000). Versoes de horas contratadas,
 * validas por intervalo de datas -- copia estrutural de `PessoaRetribuicao`.
 * `pessoas_vinculos.horas_periodo`/`horas_frequencia` sao agora DERIVADOS
 * daqui (a versao em aberto da pessoa, escrita no vinculo em vigor por
 * trigger) -- nunca se escrevem directamente. Ver `usePessoaVinculoHoras.ts`.
 */
export interface PessoaVinculoHoras {
  id: string;
  pessoa_id: string;
  organization_id: string;
  vinculo_id: string | null;
  /** A quantidade, na unidade de `horas_frequencia` -- mesmo desenho de `PessoaVinculo.horas_periodo`. */
  horas_periodo: number;
  horas_frequencia: HorasFrequencia;
  /** Coluna GERADA na base: nunca se escreve. */
  horas_semanais_equivalentes: number | null;
  valido_de: string;
  /** `null` = em vigor (aberta). Uma so por PESSOA. */
  valido_ate: string | null;
  motivo: string | null;
  /** O aditamento assinado que origina esta versao, quando existir um. */
  documento_id: string | null;
  created_at?: string;
  updated_at?: string;
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
  /**
   * 0, 50 ou 100 -- percentagem de duodecimos (subsidios de ferias/Natal
   * pagos ao duodecimo). `null` = por decidir. Escreve-se na admissao e,
   * desde 20261201040000, tambem ao ALTERAR ou CORRIGIR uma versao de
   * retribuicao -- ver `PessoaRetribuicaoCard`.
   */
  duodecimos_pct: 0 | 50 | 100 | null;
  created_at?: string;
  updated_at?: string;
}

/** Como um codigo de processamento se calcula (`hr_codigos_processamento.modo_calculo`, 20261201260000). */
export type HrCodigoProcessamentoModoCalculo =
  | "manual"
  | "percentagem_hora_normal"
  | "valor_fixo_ocorrencia"
  | "valor_fixo_mensal";

/**
 * De onde vem automaticamente um codigo com esse modo (`hr_codigos_processamento.origem_automatica`,
 * 20261201260000). `horas_extra_noturnas` e TRANSVERSAL -- conta sempre, em cima de qualquer
 * outra origem (feriado/descanso trabalhado), nunca em vez dela.
 */
export type HrCodigoProcessamentoOrigemAutomatica =
  | "horas_extra"
  | "horas_extra_noturnas"
  | "feriado_trabalhado"
  | "descanso_trabalhado";

/**
 * `hr_codigos_processamento` (20261201190000; `organization_id` obrigatorio
 * desde 20261201250000). Catalogo de codigos de processamento salarial,
 * PROPRIO de cada organizacao -- ate 20261201250000 existiam codigos
 * TRANSVERSAIS (`organization_id` null, partilhados por todo o grupo), mas
 * essa nocao acabou por decisao de produto. Desde 20261201260000 a tabela
 * tambem guarda COMO cada codigo se calcula (`modo_calculo` e os seus
 * parametros) -- ainda sem ligacao nenhuma a assiduidade/picagens, isso fica
 * para uma fase seguinte.
 */
export interface HrCodigoProcessamento {
  id: string;
  organization_id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  activo: boolean;
  modo_calculo: HrCodigoProcessamentoModoCalculo;
  percentagem: number | null;
  valor_fixo: number | null;
  origem_automatica: HrCodigoProcessamentoOrigemAutomatica | null;
  created_at: string;
  updated_at: string;
}

/**
 * `hr_regras_subsidio_alimentacao` (20261201200000). A REGRA de elegibilidade
 * do subsidio de alimentacao da organizacao -- distinta de
 * `PessoaRetribuicao.subsidio_alimentacao`, que e a EXCEPCAO por pessoa.
 * Uma linha por organizacao.
 */
export interface HrRegraSubsidioAlimentacao {
  id: string;
  organization_id: string;
  valor_diario: number;
  modo: SubsidioAlimentacaoModo;
  minutos_minimos_dia: number;
  created_at: string;
  updated_at: string;
}

/** Dominio de `hr_periodos_processamento.estado` (20261201220000). */
export type EstadoPeriodoProcessamento = "aberto" | "fechado";

/**
 * `hr_periodos_processamento` (20261201220000). O ciclo de vida do periodo
 * mensal de "Processamento Salarial": um periodo por (organization_id, ano,
 * mes). So `aberto` -> `fechado`, nunca ao contrario por UPDATE directo (a
 * base bloqueia por trigger). SEM reabertura auditada nesta fase -- decisao de
 * produto pendente.
 */
export interface HrPeriodoProcessamento {
  id: string;
  organization_id: string;
  ano: number;
  mes: number;
  estado: EstadoPeriodoProcessamento;
  fechado_em: string | null;
  fechado_por: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * `hr_processamento_lancamentos` (20261201230000). Premio ou valor pontual
 * lancado a uma pessoa dentro de um periodo. Nunca se apaga -- so se anula
 * (`anulado_em`/`anulado_por`/`anulado_motivo`). Escrita SO por RPC
 * (`rpc_hr_processamento_lancamento_criar` / `_anular`), e so enquanto o
 * periodo estiver `aberto`.
 */
export interface HrProcessamentoLancamento {
  id: string;
  periodo_id: string;
  pessoa_id: string;
  organization_id: string;
  descricao: string;
  valor: number;
  codigo_processamento_id: string | null;
  anulado_em: string | null;
  anulado_por: string | null;
  anulado_motivo: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Dados bancarios SEM o numero da conta em claro.
 *
 * Na base nao existe coluna com o numero: existe `conta_secret_id` (Vault) e a
 * mascara. Nao ha RPC de leitura em claro -- por decisao escrita, nao por
 * esquecimento -- e por isso a aplicacao nunca ve o numero completo, em formato
 * nenhum. So os ultimos quatro caracteres.
 *
 * `conta_pais` so existe quando `formato_conta` e `iban`: nos outros formatos
 * nao ha pais derivavel do numero, e o CHECK
 * `pessoas_dados_bancarios_pais_so_para_iban` obriga a NULL.
 */
export interface PessoaDadosBancarios {
  id: string;
  pessoa_id: string;
  organization_id: string;
  formato_conta: FormatoConta;
  titular: string | null;
  banco: string | null;
  agencia: string | null;
  conta_ultimos4: string | null;
  conta_pais: string | null;
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

/**
 * Tamanhos de farda (`pessoas_fardamento`, 20261124070000).
 *
 * Tabela PROPRIA, e nao colunas em `pessoas_dados_pessoais`: quem encomenda
 * fardas precisa de ler o tamanho do blazer sem precisar de
 * `hr.pessoas.pessoais.view`, que devolve data de nascimento, estado civil e
 * retencao de IRS. As permissoes sao as de laborais (`hr.pessoas.laborais.*`),
 * ja existentes -- nao ha codigo novo so para isto.
 */
export interface PessoaFardamento {
  id: string;
  pessoa_id: string;
  organization_id: string;
  tamanho_cima: TamanhoFardamento | null;
  tamanho_cima_detalhe: string | null;
  tamanho_baixo: TamanhoCalcas | null;
  tamanho_baixo_detalhe: string | null;
  tamanho_calcado: TamanhoCalcado | null;
  tamanho_calcado_detalhe: string | null;
}

/**
 * Filiacao sindical (`pessoas_sindicalizacao`, 20261124100000) -- artigo 9.o
 * do RGPD, regime proprio, o MESMO de `pessoas_dados_saude`: tabela separada,
 * permissao propria (`hr.pessoas.sindicalizacao.view` / `.edit`, ambas
 * `is_dangerous`), auditada por trigger em `pessoas_acessos_sensiveis`. NAO
 * tem forma mascarada -- ao contrario do NISS, nao ha "os ultimos 4
 * caracteres do sindicato" que signifiquem alguma coisa. E tudo ou nada.
 */
export interface PessoaSindicalizacao {
  id: string;
  pessoa_id: string;
  organization_id: string;
  sindicalizado: boolean | null;
  sindicato: string | null;
  /** Preparado, sem calculo nesta ronda: a quota e retida no salario. */
  quota_percentagem: number | null;
}

/**
 * O convite de admissao (`pessoas_convites_admissao`, 20261124120000).
 *
 * NUNCA traz `token_hash` nem `rascunho`: sao as duas colunas excluidas do
 * `GRANT SELECT` da migration -- a segunda porque pode conter, a meio do
 * preenchimento, a resposta de sindicalizacao. Ler estes dois campos por aqui
 * nao e um esquecimento do tipo; e a mesma garantia que a base impoe.
 */
export interface PessoaConviteAdmissao {
  id: string;
  pessoa_id: string;
  organization_id: string;
  email_destino: string;
  valid_until: string;
  used_at: string | null;
  revoked_at: string | null;
  attempts: number;
  created_at: string;
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

// -- Locais de trabalho e horario (ronda 2) ---------------------------------

/** `hr_locais_trabalho` (20261120130000). Org-scoped, com nome unico por org. */
export interface LocalTrabalho {
  id: string;
  organization_id: string;
  nome: string;
  codigo: string | null;
  tipo: TipoLocal;
  /**
   * Referencia OPCIONAL a uma organizacao. E o que permite dizer "das 9 as 14
   * naquela empresa": o local aponta para ela. Nulo na maioria dos casos.
   */
  organizacao_ref_id: string | null;
  morada: string | null;
  cidade: string | null;
  codigo_postal: string | null;
  pais: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * A que no do organograma este centro pertence (20261130080000). Coluna
   * SIMPLES, sem versionamento e SEM peso nenhum na RLS -- e so
   * classificacao. Tem de pertencer a arvore da propria `organization_id`
   * (organizacao ou descendente dela); a base recusa por trigger o que nao
   * pertencer.
   */
  organograma_node_id: string | null;
  /**
   * Quem se contacta neste centro quando alguem falta (20261130165000).
   * Um centro tem UM contacto actual, nao um historico.
   */
  contacto_nome: string | null;
  contacto_telefone: string | null;
  activo: boolean;
  notas: string | null;
}

/**
 * `pessoas_horario_planeado` (20261120150000). UMA LINHA = UM INTERVALO.
 *
 * Dois intervalos no mesmo dia em locais diferentes sao DUAS linhas, cada uma
 * com o seu `local_id` -- e o requisito central do modulo.
 *
 * Cada linha e OU regra recorrente (`dia_semana` preenchido) OU excepcao por
 * data (`data` preenchida), nunca as duas (CHECK de ou-exclusivo na base).
 *
 * PRECEDENCIA: se existir qualquer linha viva com `data = D`, essa data e
 * definida EXCLUSIVAMENTE por essas linhas; o padrao semanal e ignorado nesse
 * dia. Uma excepcao com `nao_trabalha` e folga nessa data.
 */
export interface HorarioPlaneado {
  id: string;
  pessoa_id: string;
  organization_id: string;
  vinculo_id: string | null;
  local_id: string | null;
  /** 0 = domingo .. 6 = sabado. Nulo numa excepcao por data. */
  dia_semana: number | null;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  nao_trabalha: boolean;
  ordem: number;
  valido_de: string | null;
  valido_ate: string | null;
  notas: string | null;
  /** O intervalo errado que esta linha substitui. Nulo num lancamento original. */
  corrige_horario_id: string | null;
  /** Obrigatorio quando `corrige_horario_id` esta preenchido. */
  correccao_motivo: string | null;
  corrigido_por_anew_user_id: string | null;
  corrigido_por_pessoa_id: string | null;
}

/** `pessoas_horario_realizado` (20261120160000). O que aconteceu, por data. */
export interface HorarioRealizado {
  id: string;
  pessoa_id: string;
  organization_id: string;
  vinculo_id: string | null;
  local_id: string | null;
  planeado_id: string | null;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  /** Coluna GERADA na base: nunca se escreve. */
  minutos: number;
  origem: OrigemRealizado;
  estado: EstadoRealizado;
  validado_por: string | null;
  validado_em: string | null;
  motivo_rejeicao: string | null;
  notas: string | null;
}

/**
 * `pessoas_afectacoes` (20261130060000). Onde a pessoa trabalha, e desde
 * quando -- SEM HORAS (essas leem-se do horario). Varias linhas podem estar
 * em aberto ao mesmo tempo, desde que sejam de CENTROS diferentes; duas do
 * mesmo centro a cruzarem-se no tempo sao recusadas pela base.
 *
 * `pessoas.local_id` passa a ser DERIVADO desta tabela (a afectacao em aberto
 * mais recente) -- nao se escreve directamente. Ver `usePessoaAfectacoes.ts`.
 */
export type OrigemAfectacao = "declarada" | "do_horario" | "inferida";

export interface PessoaAfectacao {
  id: string;
  pessoa_id: string;
  organization_id: string;
  vinculo_id: string | null;
  local_id: string;
  valido_de: string;
  /** `null` = em vigor (aberta). */
  valido_ate: string | null;
  motivo: string | null;
  /**
   * declarada = RH escreveu-a directamente. do_horario = deduzida de um bloco
   * de horario existente. inferida = so havia `pessoas.local_id`, sem
   * horario -- o palpite mais fraco. Confirmar (`confirmada_por`/`confirmada_em`)
   * NAO muda a origem.
   */
  origem: OrigemAfectacao;
  confirmada_por: string | null;
  confirmada_em: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * `pessoas_colocacao_organograma` (20261130080000). A que no do organograma a
 * pessoa esta colocada -- FILIAL/ESTRUTURA, versionada por intervalo. DUAS
 * classificacoes INDEPENDENTES coexistem no RH: esta (da PESSOA) e a de
 * `LocalTrabalho.organograma_node_id` (do CENTRO, simples, sem historico).
 * Nenhuma se calcula da outra -- por isso uma pessoa classificada em Lisboa
 * afecta a um centro do Porto continua "de Lisboa", e isso mostra-se, nao se
 * esconde. A classificacao NUNCA limita a que centros a pessoa pode ser
 * afecta.
 *
 * `organograma_node_id` e FK simples e ANULAVEL a `anew_organizations`, fora
 * de qualquer chave composta e NUNCA usada como ambito de seguranca -- so
 * classificacao. `null` e sempre legitimo ("sem classificacao").
 */
export interface PessoaColocacaoOrganograma {
  id: string;
  pessoa_id: string;
  organization_id: string;
  organograma_node_id: string | null;
  valido_de: string;
  /** `null` = em vigor (aberta). */
  valido_ate: string | null;
  motivo: string | null;
  created_at?: string;
  updated_at?: string;
}

// -- Documentos (20261123020000..20261123030000) -----------------------------

/** Dominio de `pessoas_documentos_modelos.tipo` e `pessoas_documentos.tipo`. */
export type TipoDocumentoRH = "contrato" | "adenda" | "declaracao" | "recibo" | "outro";
export const TIPOS_DOCUMENTO_RH: readonly TipoDocumentoRH[] = [
  "contrato",
  "adenda",
  "declaracao",
  "recibo",
  "outro",
];

/** Dominio de `pessoas_documentos.estado`. Uma linha `assinado` e imutavel. */
export type EstadoDocumentoRH = "rascunho" | "a_aguardar_assinatura" | "assinado" | "anulado";
export const ESTADOS_DOCUMENTO_RH: readonly EstadoDocumentoRH[] = [
  "rascunho",
  "a_aguardar_assinatura",
  "assinado",
  "anulado",
];

/**
 * Dominio de `pessoas_documentos.assinatura_origem` (20261201070000). `null`
 * enquanto nao assinado, ou documento legado anterior a esta coluna.
 * `interna` = assinado DENTRO da app pela propria pessoa
 * (`rpc_hr_documento_assinar`). `externa` = ja vinha assinado em papel fora
 * do sistema; RH so registou e anexou o ficheiro
 * (`rpc_hr_documento_registar_assinatura_externa`).
 */
export type OrigemAssinaturaDocumentoRH = "interna" | "externa";

/** Um modelo de documento por organizacao. `corpo_html` tem SELECT directo
 *  aqui -- ao contrario de `PessoaDocumento`, esta tabela nao tem grants por
 *  coluna, so a permissao `hr.pessoas.documentos.modelos.view` na RLS. */
export interface PessoaDocumentoModelo {
  id: string;
  organization_id: string;
  nome: string;
  tipo: TipoDocumentoRH;
  corpo_html: string;
  variaveis: string[];
  activo: boolean;
}

/**
 * Metadados de `pessoas_documentos`. NUNCA `corpo_html`: essa coluna continua
 * fechada por GRANT de coluna (migration 20261123030000) e so sai pela RPC
 * `rpc_hr_documento_ver_conteudo`. Pedi-la aqui faz o PostgREST recusar o
 * select e perder a linha inteira -- a mesma licao do NISS.
 *
 * `ficheiro_caminho`, `ficheiro_hash_sha256` e `ficheiro_anexado_em` JA estao
 * no GRANT de metadados desde 20261130065000 -- sao metadados legiveis, ao
 * contrario de `corpo_html`. O CONTEUDO do ficheiro nunca vem por aqui: so
 * pelo URL assinado de curta duracao emitido pela Edge Function
 * `hr-documento-ficheiro-url`, que audita antes de o devolver.
 */
export interface PessoaDocumento {
  id: string;
  pessoa_id: string;
  organization_id: string;
  vinculo_id: string | null;
  modelo_id: string | null;
  tipo: TipoDocumentoRH;
  titulo: string;
  estado: EstadoDocumentoRH;
  ficheiro_caminho: string | null;
  ficheiro_hash_sha256: string | null;
  ficheiro_anexado_em: string | null;
  emitido_em: string | null;
  emitido_por: string | null;
  assinado_em: string | null;
  /** `null` enquanto nao assinado, ou documento legado anterior a 20261201070000. */
  assinatura_origem: OrigemAssinaturaDocumentoRH | null;
  anulado_em: string | null;
  anulado_motivo: string | null;
  created_at?: string;
}
