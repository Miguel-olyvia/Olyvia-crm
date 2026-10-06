/**
 * O rascunho do assistente de criacao de pessoa, e a sua validacao.
 *
 * CINCO SECCOES, DUAS OBRIGATORIEDADES
 * ------------------------------------
 * (1) Informacoes gerais, (2) Detalhes pessoais, (3) Informacoes laborais,
 * (4) Informacoes de contrato, (5) Configuracoes gerais.
 *
 * Na base, `pessoas` so tem dois NOT NULL de conteudo: `primeiro_nome` e
 * `apelido` (20261120030000). Logo o assistente tambem so exige esses dois --
 * VAZIO NUNCA E ERRO, MALFORMADO E SEMPRE ERRO. Quem tem uma admissao as
 * pressas escreve o nome, salta para o passo que quer, e grava.
 *
 * O QUE NAO ESTA AQUI, DE PROPOSITO
 * ---------------------------------
 * "Entidade legal" e "Grupo de colaboradores". A entidade legal e SEMPRE a da
 * organizacao activa e vem do contexto da empresa; nao se escolhe e nao se
 * manda ao servidor. O grupo de colaboradores nao existe no produto.
 *
 * Nao ha React nem acesso a base neste ficheiro: e forma e funcoes puras.
 */
import {
  type HorarioRascunho,
  type LinhaPlaneadoParaGravar,
  horarioVazio,
  minutosDe,
} from "@/lib/hr/horario";
import { bicValido, contaValida, normalizarBic, normalizarConta } from "@/lib/hr/conta";
import {
  problemasDosNumerosDoContrato,
  type CampoNumericoContrato,
} from "@/lib/hr/contrato";
import { horasImplausiveis } from "@/lib/hr/horas";
import { nifValido, nissValido } from "@/lib/hr/identificadoresPt";
import type { ConfiguracaoCampo } from "@/lib/hr/admissaoObrigatorios";
import { problemasDeObrigatoriosDaConfiguracao } from "@/lib/hr/novaPessoaAdmissao";
import { dataDeHoje, dataDoPeriodoExperimental } from "@/lib/hr/novaPessoaDatas";
import type {
  DiaSemana,
  EstadoCivil,
  FormatoConta,
  Genero,
  HorasFrequencia,
  Periodicidade,
  PoliticaFeriados,
  RegimeTrabalho,
  TipoContrato,
  TipoDocumento,
  TipoTrabalho,
} from "@/types/hr";

export type SeccaoId = "geral" | "pessoais" | "laborais" | "contrato" | "acesso";

export const SECCOES: readonly SeccaoId[] = [
  "geral",
  "pessoais",
  "laborais",
  "contrato",
  "acesso",
];

/**
 * Quem preenche os dados pessoais desta ficha:
 *  - `convite`: a propria pessoa, por convite. O formulario so exige nome,
 *    apelido e o e-mail pessoal (o destino do convite), e abre o envio do
 *    convite logo a seguir a criar;
 *  - `rh`: o RH, agora. Aplica-se a configuracao da organizacao: os campos da
 *    pessoa que estao na posicao `convite` passam a ser exigidos aqui.
 */
export type QuemPreenche = "convite" | "rh";

export interface RascunhoGeral {
  /**
   * UI, nao dados: decide que campos se exigem e se o convite se abre a
   * seguir. Nunca vai para a base.
   */
  quem_preenche: QuemPreenche;
  primeiro_nome: string;
  apelido: string;
  /** O futuro identificador de entrada, se se vier a autenticar por aqui. */
  email_trabalho: string;
  telefone_trabalho: string;
  numero_interno: string;
  /**
   * A conta de CRM escolhida para preencher (e, com permissao, ligar) esta
   * ficha. NUNCA vai para `pessoas` -- nao existe coluna nenhuma la para
   * isto. So alimenta `NovaPessoaPayload.contaALigar`, que o hook usa depois
   * do insert do nucleo para chamar `rpc_hr_ligar_conta`.
   */
  conta_id: string;
}

export interface RascunhoPessoais {
  data_nascimento: string;
  ocultar_aniversario: boolean;
  genero: Genero | "";
  /** Codigo ISO 3166-1 alpha-2, nunca o nome do pais. */
  nacionalidade: string;
  estado_civil: EstadoCivil | "";
  dependentes: string;
  telefone_pessoal: string;
  email_pessoal: string;
  tipo_documento: TipoDocumento | "";
  numero_documento: string;
  validade_documento: string;
  nif: string;
  /** Vai por RPC propria (`rpc_hr_definir_niss`): a coluna esta revogada ao
   * `authenticated` no INSERT. Falhar o NISS nao pode fazer perder o resto. */
  niss: string;
  morada_linha1: string;
  morada_linha2: string;
  morada_codigo_postal: string;
  morada_localidade: string;
  morada_distrito: string;
  morada_pais: string;
  /**
   * A conta bancaria. NAO vai por insert: `pessoas_dados_bancarios` tem a
   * escrita revogada e o unico caminho e `rpc_hr_definir_conta`, depois de a
   * pessoa existir. O numero acaba no Vault e a aplicacao nunca o volta a ver.
   */
  conta_formato: FormatoConta;
  conta_numero: string;
  /** O BIC (codigo SWIFT); na base e a coluna `swift`. Aplica-se a todos os formatos. */
  conta_bic: string;
  emergencia_nome: string;
  emergencia_relacao: string;
  emergencia_telefone: string;
}

export interface RascunhoLaborais {
  cargo: string;
  local_id: string;
  reporta_a_pessoa_id: string;
  data_admissao: string;
  data_antiguidade: string;
}

export interface RascunhoContrato {
  tipo_contrato: TipoContrato | "";
  regime: RegimeTrabalho;
  /**
   * UI, nao dados: `regime` nasce a `tempo_inteiro` e por isso nao se distingue
   * de uma escolha. Este sinalizador guarda o que a base nao consegue guardar
   * -- se o regime foi escolhido A MAO -- para o ecra saber quando pode deixa-lo
   * seguir o tipo de contrato e quando tem de se limitar a avisar. Nunca vai
   * para a base: o payload de escrita enumera os campos um a um.
   */
  regime_manual: boolean;
  data_inicio: string;
  data_fim: string;
  /**
   * UI, nao dados: so alimenta o calculo automatico de `data_fim` quando o
   * tipo de contrato tem termo (certo ou incerto), o mesmo padrao de
   * `dataDoPeriodoExperimental` -- a base nunca deriva uma data da outra por
   * trigger, so o ecra, e so uma vez. Nunca vai para a base.
   */
  duracao_meses: string;
  tem_periodo_experimental: boolean;
  periodo_experimental_dias: string;
  valor_base: string;
  moeda: string;
  periodicidade: Periodicidade;
  tipo_trabalho: TipoTrabalho | "";
  horas_trabalho: string;
  horas_frequencia: HorasFrequencia;
  tempo_trabalho_pct: string;
  dias_uteis: DiaSemana[];
  politica_feriados: PoliticaFeriados;
  horas_anuais_maximas: string;
  horas_semanais_maximas: string;
  /** `false` = horas iguais todas as semanas; `true` = abre o editor por dia. */
  horario_variavel: boolean;
  horario: HorarioRascunho;
}

export interface RascunhoAcesso {
  role_id: string;
  enviar_convite: boolean;
  email_convite: string;
}

export interface RascunhoPessoa {
  geral: RascunhoGeral;
  pessoais: RascunhoPessoais;
  laborais: RascunhoLaborais;
  contrato: RascunhoContrato;
  acesso: RascunhoAcesso;
}

export function rascunhoInicial(): RascunhoPessoa {
  return {
    geral: {
      // Por omissao a propria pessoa preenche, por convite: e o fluxo da
      // admissao. O RH que tem os dados a frente escolhe "O RH, agora".
      quem_preenche: "convite",
      primeiro_nome: "",
      apelido: "",
      email_trabalho: "",
      telefone_trabalho: "",
      numero_interno: "",
      conta_id: "",
    },
    pessoais: {
      data_nascimento: "",
      ocultar_aniversario: false,
      genero: "",
      nacionalidade: "",
      estado_civil: "",
      dependentes: "",
      telefone_pessoal: "",
      email_pessoal: "",
      tipo_documento: "",
      numero_documento: "",
      validade_documento: "",
      nif: "",
      niss: "",
      morada_linha1: "",
      morada_linha2: "",
      morada_codigo_postal: "",
      morada_localidade: "",
      morada_distrito: "",
      morada_pais: "PT",
      conta_formato: "iban",
      conta_numero: "",
      conta_bic: "",
      emergencia_nome: "",
      emergencia_relacao: "",
      emergencia_telefone: "",
    },
    laborais: {
      cargo: "",
      local_id: "",
      reporta_a_pessoa_id: "",
      data_admissao: "",
      data_antiguidade: "",
    },
    contrato: {
      tipo_contrato: "",
      regime: "tempo_inteiro",
      regime_manual: false,
      data_inicio: "",
      data_fim: "",
      duracao_meses: "",
      tem_periodo_experimental: false,
      periodo_experimental_dias: "",
      valor_base: "",
      moeda: "EUR",
      periodicidade: "mensal",
      tipo_trabalho: "",
      horas_trabalho: "",
      horas_frequencia: "semanal",
      // Sempre 100%, sem excepcao -- quem precisa de tempo parcial ja o
      // marca em `tipo_trabalho`/regime, ter os dois campos a dizer a
      // mesma coisa de forma independente era so uma fonte de
      // inconsistencia silenciosa. Campo bloqueado no ecra (SeccaoContrato).
      tempo_trabalho_pct: "100",
      dias_uteis: [],
      politica_feriados: "nao_laboral",
      horas_anuais_maximas: "",
      horas_semanais_maximas: "",
      horario_variavel: false,
      horario: horarioVazio(),
    },
    acesso: { role_id: "", enviar_convite: false, email_convite: "" },
  };
}

// -- Validacao ---------------------------------------------------------------

export interface ProblemaCampo {
  seccao: SeccaoId;
  /** `id` do campo no DOM, para o atalho do resumo poder focar. */
  campoId: string;
  /** Chave de traducao do rotulo, para o resumo dizer onde esta o problema. */
  rotuloKey: string;
  mensagemKey: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Onde vive, NESTE formulario, cada numero validado por `lib/hr/contrato`. */
const CAMPOS_NUMERICOS_DO_CONTRATO: Record<
  CampoNumericoContrato,
  { campoId: string; rotuloKey: string }
> = {
  horas: { campoId: "hr-novo-horas-trabalho", rotuloKey: "hr.contrato.horasTrabalho" },
  maximoSemanal: {
    campoId: "hr-novo-horas-semanais-maximas",
    rotuloKey: "hr.contrato.horasSemanaisMaximas",
  },
  maximoAnual: {
    campoId: "hr-novo-horas-anuais-maximas",
    rotuloKey: "hr.contrato.horasAnuaisMaximas",
  },
  fte: { campoId: "hr-novo-tempo-trabalho-pct", rotuloKey: "hr.contrato.tempoTrabalhoPct" },
  experimental: {
    campoId: "hr-novo-periodo-experimental-dias",
    rotuloKey: "hr.contrato.periodoExperimentalDias",
  },
};

function numeroDe(valor: string): number | null {
  const limpo = valor.trim().replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Todos os problemas de FORMATO e de COERENCIA do rascunho.
 *
 * Formato verifica-se campo a campo; coerencia (termo antes do inicio, maximo
 * semanal abaixo das horas contratadas) so aqui, porque so aqui existem todos
 * os valores ao mesmo tempo.
 *
 * OBRIGATORIEDADE, POR QUEM PREENCHE
 * ----------------------------------
 * `quem_preenche = 'convite'`: so primeiro nome, apelido e o e-mail pessoal
 * (o destino do convite). `quem_preenche = 'rh'`: alem dos nomes, tudo o que a
 * configuracao da organizacao poe na posicao `convite` -- se a configuracao
 * ainda nao chegou (ou quem preenche nao a pode ler) nao se inventa nada: so
 * os nomes. Os campos so do RH (data de admissao, cargo, tipo de contrato) nao
 * bloqueiam a criacao; ver `avisosDoRascunho`.
 */
export function problemasDoRascunho(
  rascunho: RascunhoPessoa,
  config?: readonly ConfiguracaoCampo[] | null,
): ProblemaCampo[] {
  const problemas: ProblemaCampo[] = [];
  const { geral, pessoais, contrato } = rascunho;

  if (geral.primeiro_nome.trim() === "") {
    problemas.push({
      seccao: "geral",
      campoId: "hr-novo-primeiro-nome",
      rotuloKey: "employees.form.firstName",
      mensagemKey: "hr.form.erroObrigatorio",
    });
  }
  if (geral.apelido.trim() === "") {
    problemas.push({
      seccao: "geral",
      campoId: "hr-novo-apelido",
      rotuloKey: "employees.form.lastName",
      mensagemKey: "hr.form.erroObrigatorio",
    });
  }
  if (geral.email_trabalho.trim() !== "" && !EMAIL.test(geral.email_trabalho.trim())) {
    problemas.push({
      seccao: "geral",
      campoId: "hr-novo-email-trabalho",
      rotuloKey: "hr.laborais.emailTrabalho",
      mensagemKey: "hr.form.erroEmail",
    });
  }
  if (pessoais.email_pessoal.trim() !== "" && !EMAIL.test(pessoais.email_pessoal.trim())) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-email-pessoal",
      rotuloKey: "hr.campos.emailPessoal",
      mensagemKey: "hr.form.erroEmail",
    });
  }
  // NIF e NISS: formato E digito de controlo -- a mesma regra que a base aplica
  // (`hr_nif_valido` / `hr_niss_valido`). Um numero com o digito errado e quase
  // sempre uma gralha e, gravado, ficava a bloquear a admissao.
  if (pessoais.nif.trim() !== "" && !nifValido(pessoais.nif)) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-nif",
      rotuloKey: "hr.campos.nif",
      mensagemKey: "hr.form.erroNif",
    });
  }
  if (pessoais.niss.trim() !== "" && !nissValido(pessoais.niss)) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-niss",
      rotuloKey: "hr.campos.niss",
      mensagemKey: "hr.form.erroNiss",
    });
  }
  if (
    pessoais.conta_numero.trim() !== "" &&
    !contaValida(pessoais.conta_formato, pessoais.conta_numero)
  ) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-conta-numero",
      rotuloKey: "hr.campos.numeroConta",
      // A mensagem distingue os dois ramos porque o remedio e diferente: num
      // IBAN falha o digito de controlo, nos outros o proprio formato.
      mensagemKey:
        pessoais.conta_formato === "iban" ? "hr.form.erroIban" : "hr.form.erroConta",
    });
  }
  if (pessoais.conta_bic.trim() !== "" && !bicValido(pessoais.conta_bic)) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-conta-bic",
      rotuloKey: "hr.campos.swift",
      mensagemKey: "hr.form.erroBic",
    });
  }
  // -- Obrigatoriedade, conforme quem preenche -------------------------------
  if (geral.quem_preenche === "convite") {
    // O convite vai para o e-mail pessoal: sem ele nao ha para onde o enviar.
    if (pessoais.email_pessoal.trim() === "") {
      problemas.push({
        seccao: "pessoais",
        campoId: "hr-novo-email-pessoal",
        rotuloKey: "hr.campos.emailPessoal",
        mensagemKey: "hr.form.erroObrigatorio",
      });
    }
  } else if (config) {
    problemas.push(...problemasDeObrigatoriosDaConfiguracao(pessoais, config));
  }

  const dependentes = numeroDe(pessoais.dependentes);
  if (pessoais.dependentes.trim() !== "" && (dependentes === null || dependentes < 0)) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-dependentes",
      rotuloKey: "hr.campos.dependentes",
      mensagemKey: "hr.form.erroNumero",
    });
  }

  // -- Contrato: formato ----------------------------------------------------
  const valorBase = numeroDe(contrato.valor_base);
  if (contrato.valor_base.trim() !== "" && (valorBase === null || valorBase < 0)) {
    problemas.push({
      seccao: "contrato",
      campoId: "hr-novo-valor-base",
      rotuloKey: "hr.contrato.valorBase",
      mensagemKey: "hr.form.erroNumero",
    });
  }
  // Os cinco numeros do contrato -- e o cruzamento entre dois deles -- estao
  // em `lib/hr/contrato.ts`, porque o separador Contratos da ficha edita
  // exactamente os mesmos e nao podem divergir. Aqui so se traduz o campo
  // abstracto para o `id` deste formulario.
  for (const problema of problemasDosNumerosDoContrato({
    horas: contrato.horas_trabalho,
    horas_frequencia: contrato.horas_frequencia,
    horas_semanais_maximas: contrato.horas_semanais_maximas,
    horas_anuais_maximas: contrato.horas_anuais_maximas,
    tempo_trabalho_pct: contrato.tempo_trabalho_pct,
    periodo_experimental_dias: contrato.tem_periodo_experimental
      ? contrato.periodo_experimental_dias
      : "",
  })) {
    const onde = CAMPOS_NUMERICOS_DO_CONTRATO[problema.campo];
    problemas.push({
      seccao: "contrato",
      campoId: onde.campoId,
      rotuloKey: onde.rotuloKey,
      mensagemKey: problema.mensagemKey,
    });
  }

  // -- Contrato: coerencia --------------------------------------------------
  if (
    contrato.data_inicio.trim() !== "" &&
    contrato.data_fim.trim() !== "" &&
    contrato.data_fim < contrato.data_inicio
  ) {
    problemas.push({
      seccao: "contrato",
      campoId: "hr-novo-data-fim",
      rotuloKey: "hr.contrato.dataFim",
      mensagemKey: "hr.form.erroDataFim",
    });
  }
  // -- Acesso ---------------------------------------------------------------
  if (rascunho.acesso.enviar_convite) {
    const email = rascunho.acesso.email_convite.trim() || geral.email_trabalho.trim();
    if (email === "" || !EMAIL.test(email)) {
      problemas.push({
        seccao: "acesso",
        campoId: "hr-novo-email-convite",
        rotuloKey: "hr.acesso.emailConvite",
        mensagemKey: "hr.form.erroEmailConvite",
      });
    }
  }

  return problemas;
}

/**
 * O que e legal mas provavelmente errado.
 *
 * NAO bloqueia a gravacao, e a distincao importa: um contrato de 3h por semana
 * e legal e existe. O que isto apanha e a UNIDADE TROCADA -- "40 mensais" da
 * 9,2h por semana, passa o tecto de 80h e nao passa por plausivel. Nenhum
 * CHECK consegue distinguir isso de um contrato real de 9h, porque as duas
 * linhas sao identicas; quem consegue e quem esta a preencher, se lhe
 * dissermos.
 */
export function avisosDoRascunho(rascunho: RascunhoPessoa): ProblemaCampo[] {
  const avisos: ProblemaCampo[] = [];
  const { contrato } = rascunho;

  const horas = numeroDe(contrato.horas_trabalho);
  if (horasImplausiveis(horas, contrato.horas_frequencia)) {
    avisos.push({
      seccao: "contrato",
      campoId: "hr-novo-horas-trabalho",
      rotuloKey: "hr.contrato.horasTrabalho",
      mensagemKey: "hr.form.avisoHorasImplausiveis",
    });
  }

  // Os campos so do RH (data de admissao, cargo, tipo de contrato) nao
  // bloqueiam a criacao -- quem tem uma admissao as pressas cria a ficha e
  // completa depois -- mas ficam como pendencia da ficha, e o ecra di-lo.
  if (rascunho.laborais.data_admissao.trim() === "") {
    avisos.push({
      seccao: "laborais",
      campoId: "hr-novo-data-admissao",
      rotuloKey: "employees.form.hireDate",
      mensagemKey: "hr.form.avisoCampoRhPendente",
    });
  }
  if (rascunho.laborais.cargo.trim() === "") {
    avisos.push({
      seccao: "laborais",
      campoId: "hr-novo-cargo",
      rotuloKey: "hr.columns.cargo",
      mensagemKey: "hr.form.avisoCampoRhPendente",
    });
  }
  if (contrato.tipo_contrato === "") {
    avisos.push({
      seccao: "contrato",
      campoId: "hr-novo-tipo-contrato",
      rotuloKey: "hr.contrato.tipoContrato",
      mensagemKey: "hr.form.avisoCampoRhPendente",
    });
  }

  return avisos;
}

/** A seccao tem algum valor preenchido? Alimenta o estado na lista de passos. */
export function seccaoPreenchida(rascunho: RascunhoPessoa, seccao: SeccaoId): boolean {
  switch (seccao) {
    case "geral":
      // `quem_preenche` nasce preenchido e nao conta: e uma escolha de UI, nao
      // um dado da pessoa.
      return Object.entries(rascunho.geral).some(
        ([chave, valor]) => chave !== "quem_preenche" && String(valor).trim() !== "",
      );
    case "pessoais":
      return Object.entries(rascunho.pessoais).some(([chave, valor]) => {
        if (chave === "ocultar_aniversario") return valor === true;
        // Estes dois nascem preenchidos por omissao e nao contam como seccao
        // preenchida: senao os Detalhes pessoais nasciam com visto.
        if (chave === "morada_pais" || chave === "conta_formato") return false;
        return String(valor).trim() !== "";
      });
    case "laborais":
      return Object.values(rascunho.laborais).some((v) => String(v).trim() !== "");
    case "contrato":
      return (
        rascunho.contrato.tipo_contrato !== "" ||
        rascunho.contrato.data_inicio.trim() !== "" ||
        rascunho.contrato.valor_base.trim() !== "" ||
        rascunho.contrato.horas_trabalho.trim() !== "" ||
        rascunho.contrato.horario_variavel
      );
    case "acesso":
      return rascunho.acesso.role_id !== "" || rascunho.acesso.enviar_convite;
    default:
      return false;
  }
}

// -- Rascunho -> payload de escrita ------------------------------------------

/**
 * O payload que o hook de escrita recebe. Ja normalizado: strings vazias
 * viraram `null`, numeros viraram numeros, e `organization_id` NAO esta aqui
 * de proposito -- vem sempre da organizacao activa, dentro do hook.
 */
export interface NovaPessoaPayload {
  nucleo: {
    primeiro_nome: string;
    apelido: string;
    email_trabalho: string | null;
    email_pessoal: string | null;
    telefone_trabalho: string | null;
    numero_interno: string | null;
    cargo: string | null;
    local_id: string | null;
    reporta_a_pessoa_id: string | null;
    data_admissao: string | null;
    data_antiguidade: string | null;
  };
  dadosPessoais: Record<string, unknown> | null;
  identificacao: Record<string, unknown> | null;
  /** Vai por `rpc_hr_definir_niss`, nunca por insert. */
  niss: string | null;
  morada: Record<string, unknown> | null;
  /**
   * Vai por `rpc_hr_definir_conta`, nunca por insert: a tabela tem a escrita
   * revogada. Como o NISS, pode falhar sozinha -- e a ficha fica criada.
   */
  conta: { formato: FormatoConta; numero: string; swift: string | null } | null;
  /**
   * O BIC escrito SEM numero de conta. Vai por `rpc_hr_definir_bic`, que grava
   * so o BIC; com numero, o BIC viaja dentro de `conta.swift`.
   */
  bicSozinho: string | null;
  emergencia: Record<string, unknown> | null;
  vinculo: Record<string, unknown> | null;
  /**
   * Versao inicial de `pessoas_vinculos_horas`, a par de `vinculo`. `null`
   * quando nao foram declaradas horas -- `pessoas_vinculos.horas_periodo` e
   * `horas_frequencia` sao DERIVADOS (20261130180000, trigger
   * `hr_pessoas_vinculos_horas_e_derivado`) e o proprio INSERT em
   * `pessoas_vinculos` deixou de os poder levar; esta e a unica via.
   */
  horasVinculo: { horas_periodo: number; horas_frequencia: HorasFrequencia; valido_de: string } | null;
  retribuicao: { valor_base: number; moeda: string; periodicidade: Periodicidade } | null;
  /** Linhas de `pessoas_horario_planeado`, uma por intervalo. */
  horario: LinhaPlaneadoParaGravar[] | null;
  acesso: { role_id: string | null; enviar_convite: boolean; email_convite: string | null };
  /**
   * O `id` da conta de CRM a ligar depois de a ficha existir, via
   * `rpc_hr_ligar_conta`. `null` quando ninguem escolheu conta, OU quando
   * escolheu so para PREENCHER e nao tem `hr.pessoas.conta.link` -- nesse
   * caso o ecra ja avisou que a ligacao nao ia acontecer, e aqui nao se
   * anuncia como falhado o que ninguem tentou.
   */
  contaALigar: string | null;
}

function texto(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

export function payloadDoRascunho(
  rascunho: RascunhoPessoa,
  linhasDeHorario: (horario: HorarioRascunho) => LinhaPlaneadoParaGravar[],
  /**
   * Se quem preenche NAO tem `hr.pessoas.conta.link`, a conta escolhida so
   * serviu para preencher -- `contaALigar` fica `null` e `criarPessoa` nunca
   * chama `rpc_hr_ligar_conta`. Sem este parametro seria facil mandar ao
   * servidor uma ligacao que o ecra ja disse que nao ia acontecer.
   */
  podeLigarConta: boolean,
): NovaPessoaPayload {
  const { geral, pessoais, laborais, contrato, acesso } = rascunho;

  const temPessoais =
    texto(pessoais.data_nascimento) !== null ||
    pessoais.genero !== "" ||
    texto(pessoais.nacionalidade) !== null ||
    pessoais.estado_civil !== "" ||
    texto(pessoais.dependentes) !== null ||
    texto(pessoais.telefone_pessoal) !== null ||
    pessoais.ocultar_aniversario;

  const temIdentificacao =
    pessoais.tipo_documento !== "" ||
    texto(pessoais.numero_documento) !== null ||
    texto(pessoais.validade_documento) !== null ||
    texto(pessoais.nif) !== null;

  const experimentalDias = contrato.tem_periodo_experimental
    ? numeroDe(contrato.periodo_experimental_dias)
    : null;

  const temVinculo =
    contrato.tipo_contrato !== "" ||
    texto(contrato.data_inicio) !== null ||
    texto(contrato.horas_trabalho) !== null ||
    contrato.tipo_trabalho !== "" ||
    contrato.dias_uteis.length > 0;

  const valorBase = numeroDe(contrato.valor_base);

  // Usada tanto em `vinculo.data_inicio` como em `horasVinculo.valido_de`: as
  // duas tem de nascer com a MESMA data (a versao de horas comeca exactamente
  // quando o vinculo comeca).
  const dataInicioVinculo = texto(contrato.data_inicio) ?? texto(laborais.data_admissao) ?? dataDeHoje();

  return {
    nucleo: {
      primeiro_nome: geral.primeiro_nome.trim(),
      apelido: geral.apelido.trim(),
      email_trabalho: texto(geral.email_trabalho),
      email_pessoal: texto(pessoais.email_pessoal),
      telefone_trabalho: texto(geral.telefone_trabalho),
      numero_interno: texto(geral.numero_interno),
      cargo: texto(laborais.cargo),
      local_id: texto(laborais.local_id),
      reporta_a_pessoa_id: texto(laborais.reporta_a_pessoa_id),
      data_admissao: texto(laborais.data_admissao),
      data_antiguidade: texto(laborais.data_antiguidade),
    },
    dadosPessoais: temPessoais
      ? {
          data_nascimento: texto(pessoais.data_nascimento),
          ocultar_aniversario: pessoais.ocultar_aniversario,
          genero: pessoais.genero === "" ? null : pessoais.genero,
          nacionalidade: texto(pessoais.nacionalidade)?.toUpperCase() ?? null,
          estado_civil: pessoais.estado_civil === "" ? null : pessoais.estado_civil,
          dependentes: numeroDe(pessoais.dependentes),
          telefone_pessoal: texto(pessoais.telefone_pessoal),
        }
      : null,
    identificacao: temIdentificacao
      ? {
          tipo_documento: pessoais.tipo_documento === "" ? null : pessoais.tipo_documento,
          numero_documento: texto(pessoais.numero_documento),
          validade_documento: texto(pessoais.validade_documento),
          // Sem espacos: `nifValido` aceita "123 456 789", a coluna nao.
          nif: texto(pessoais.nif.replace(/\s+/g, "")),
        }
      : null,
    niss: texto(pessoais.niss.replace(/\s+/g, "")),
    morada:
      texto(pessoais.morada_linha1) !== null
        ? {
            tipo: "residencia",
            linha1: pessoais.morada_linha1.trim(),
            linha2: texto(pessoais.morada_linha2),
            codigo_postal: texto(pessoais.morada_codigo_postal),
            localidade: texto(pessoais.morada_localidade),
            distrito: texto(pessoais.morada_distrito),
            pais: pessoais.morada_pais.trim().toUpperCase() || "PT",
            is_principal: true,
          }
        : null,
    conta:
      normalizarConta(pessoais.conta_numero) !== ""
        ? {
            formato: pessoais.conta_formato,
            numero: normalizarConta(pessoais.conta_numero),
            swift: normalizarBic(pessoais.conta_bic) || null,
          }
        : null,
    bicSozinho:
      normalizarConta(pessoais.conta_numero) === ""
        ? normalizarBic(pessoais.conta_bic) || null
        : null,
    emergencia:
      texto(pessoais.emergencia_nome) !== null && texto(pessoais.emergencia_telefone) !== null
        ? {
            nome: pessoais.emergencia_nome.trim(),
            relacao: texto(pessoais.emergencia_relacao),
            telefone: pessoais.emergencia_telefone.trim(),
            ordem: 1,
          }
        : null,
    vinculo: temVinculo
      ? {
          tipo_contrato: contrato.tipo_contrato === "" ? "sem_termo" : contrato.tipo_contrato,
          regime: contrato.regime,
          // horas_periodo/horas_frequencia NAO vao aqui desde 20261130180000:
          // sao DERIVADOS de pessoas_vinculos_horas por trigger, e o INSERT
          // directo e recusado (HR010). Ver `horasVinculo`, abaixo.
          data_inicio: dataInicioVinculo,
          data_fim: texto(contrato.data_fim),
          periodo_experimental_dias: experimentalDias,
          periodo_experimental_ate:
            experimentalDias === null
              ? null
              : dataDoPeriodoExperimental(dataInicioVinculo, experimentalDias),
          tipo_trabalho: contrato.tipo_trabalho === "" ? null : contrato.tipo_trabalho,
          tempo_trabalho_pct: numeroDe(contrato.tempo_trabalho_pct),
          dias_uteis: contrato.dias_uteis.length > 0 ? contrato.dias_uteis : null,
          politica_feriados: contrato.politica_feriados,
          horas_anuais_maximas: numeroDe(contrato.horas_anuais_maximas),
          horas_semanais_maximas: numeroDe(contrato.horas_semanais_maximas),
          estado: "activo",
        }
      : null,
    // Par de `vinculo`, e so existe quando ha horas declaradas: sem isto, a
    // pessoa fica legitimamente sem versao aberta (horas_periodo/
    // horas_frequencia ficam NULL em pessoas_vinculos, o mesmo estado de quem
    // e prestador de servicos). horas_frequencia da tabela nova e NOT NULL,
    // por isso so se cria o par quando ha quantidade.
    horasVinculo:
      temVinculo && numeroDe(contrato.horas_trabalho) !== null
        ? {
            horas_periodo: numeroDe(contrato.horas_trabalho) as number,
            horas_frequencia: contrato.horas_frequencia,
            valido_de: dataInicioVinculo,
          }
        : null,
    retribuicao:
      valorBase !== null
        ? {
            valor_base: valorBase,
            moeda: contrato.moeda.trim().toUpperCase() || "EUR",
            periodicidade: contrato.periodicidade,
          }
        : null,
    horario: contrato.horario_variavel ? linhasDeHorario(contrato.horario) : null,
    acesso: {
      role_id: texto(acesso.role_id),
      enviar_convite: acesso.enviar_convite,
      email_convite: texto(acesso.email_convite) ?? texto(geral.email_trabalho),
    },
    contaALigar: podeLigarConta ? texto(geral.conta_id) : null,
  };
}

/** Reexportado para quem valida horas nas seccoes, sem importar dois modulos. */
export { minutosDe };

/** Reexportados: moram em `novaPessoaAdmissao.ts` e `novaPessoaDatas.ts` (este ficheiro passava das 800 linhas). */
export { camposDoConviteForaDoFormulario, codigosObrigatoriosDoFormulario } from "@/lib/hr/novaPessoaAdmissao";
export { dataDeHoje, dataDoPeriodoExperimental, dataFimPorDuracaoMeses } from "@/lib/hr/novaPessoaDatas";
