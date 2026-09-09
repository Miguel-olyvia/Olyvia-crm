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
import type {
  DiaSemana,
  EstadoCivil,
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

export interface RascunhoGeral {
  primeiro_nome: string;
  apelido: string;
  nome_social: string;
  email_trabalho: string;
  telefone_trabalho: string;
  numero_interno: string;
}

export interface RascunhoPessoais {
  data_nascimento: string;
  ocultar_aniversario: boolean;
  genero: Genero | "";
  pronomes: string;
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
  data_inicio: string;
  data_fim: string;
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
      primeiro_nome: "",
      apelido: "",
      nome_social: "",
      email_trabalho: "",
      telefone_trabalho: "",
      numero_interno: "",
    },
    pessoais: {
      data_nascimento: "",
      ocultar_aniversario: false,
      genero: "",
      pronomes: "",
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
      data_inicio: "",
      data_fim: "",
      tem_periodo_experimental: false,
      periodo_experimental_dias: "",
      valor_base: "",
      moeda: "EUR",
      periodicidade: "mensal",
      tipo_trabalho: "",
      horas_trabalho: "",
      horas_frequencia: "semanal",
      tempo_trabalho_pct: "",
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
 */
export function problemasDoRascunho(rascunho: RascunhoPessoa): ProblemaCampo[] {
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
      rotuloKey: "hr.laborais.emailPessoal",
      mensagemKey: "hr.form.erroEmail",
    });
  }
  if (pessoais.nif.trim() !== "" && !/^\d{9}$/.test(pessoais.nif.trim())) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-nif",
      rotuloKey: "hr.campos.nif",
      mensagemKey: "hr.form.erroNif",
    });
  }
  if (pessoais.niss.trim() !== "" && !/^\d{11}$/.test(pessoais.niss.trim())) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-niss",
      rotuloKey: "hr.campos.niss",
      mensagemKey: "hr.form.erroNiss",
    });
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
  const pct = numeroDe(contrato.tempo_trabalho_pct);
  if (contrato.tempo_trabalho_pct.trim() !== "" && (pct === null || pct < 0 || pct > 100)) {
    problemas.push({
      seccao: "contrato",
      campoId: "hr-novo-tempo-trabalho-pct",
      rotuloKey: "hr.contrato.tempoTrabalhoPct",
      mensagemKey: "hr.form.erroPercentagem",
    });
  }
  const horas = numeroDe(contrato.horas_trabalho);
  if (contrato.horas_trabalho.trim() !== "" && (horas === null || horas < 0 || horas > 80)) {
    problemas.push({
      seccao: "contrato",
      campoId: "hr-novo-horas-trabalho",
      rotuloKey: "hr.contrato.horasTrabalho",
      mensagemKey: "hr.form.erroHoras",
    });
  }
  const maxSemanal = numeroDe(contrato.horas_semanais_maximas);
  if (
    contrato.horas_semanais_maximas.trim() !== "" &&
    (maxSemanal === null || maxSemanal < 0 || maxSemanal > 80)
  ) {
    problemas.push({
      seccao: "contrato",
      campoId: "hr-novo-horas-semanais-maximas",
      rotuloKey: "hr.contrato.horasSemanaisMaximas",
      mensagemKey: "hr.form.erroHoras",
    });
  }
  const maxAnual = numeroDe(contrato.horas_anuais_maximas);
  if (
    contrato.horas_anuais_maximas.trim() !== "" &&
    (maxAnual === null || maxAnual < 0 || maxAnual > 4000)
  ) {
    problemas.push({
      seccao: "contrato",
      campoId: "hr-novo-horas-anuais-maximas",
      rotuloKey: "hr.contrato.horasAnuaisMaximas",
      mensagemKey: "hr.form.erroNumero",
    });
  }
  const experimental = numeroDe(contrato.periodo_experimental_dias);
  if (
    contrato.tem_periodo_experimental &&
    contrato.periodo_experimental_dias.trim() !== "" &&
    (experimental === null || experimental < 0 || experimental > 1095)
  ) {
    problemas.push({
      seccao: "contrato",
      campoId: "hr-novo-periodo-experimental-dias",
      rotuloKey: "hr.contrato.periodoExperimentalDias",
      mensagemKey: "hr.form.erroDias",
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
  if (maxSemanal !== null && horas !== null && maxSemanal < horas) {
    problemas.push({
      seccao: "contrato",
      campoId: "hr-novo-horas-semanais-maximas",
      rotuloKey: "hr.contrato.horasSemanaisMaximas",
      mensagemKey: "hr.form.erroMaximoSemanal",
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

/** A seccao tem algum valor preenchido? Alimenta o estado na lista de passos. */
export function seccaoPreenchida(rascunho: RascunhoPessoa, seccao: SeccaoId): boolean {
  switch (seccao) {
    case "geral":
      return Object.values(rascunho.geral).some((v) => String(v).trim() !== "");
    case "pessoais":
      return Object.entries(rascunho.pessoais).some(([chave, valor]) => {
        if (chave === "ocultar_aniversario") return valor === true;
        if (chave === "morada_pais") return false;
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
    nome_social: string | null;
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
  emergencia: Record<string, unknown> | null;
  vinculo: Record<string, unknown> | null;
  retribuicao: { valor_base: number; moeda: string; periodicidade: Periodicidade } | null;
  /** Linhas de `pessoas_horario_planeado`, uma por intervalo. */
  horario: LinhaPlaneadoParaGravar[] | null;
  acesso: { role_id: string | null; enviar_convite: boolean; email_convite: string | null };
}

function texto(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

function numero(valor: string): number | null {
  return numeroDe(valor);
}

/**
 * Calcula a data de fim do periodo experimental a partir da duracao.
 *
 * A base guarda as duas coisas (`periodo_experimental_dias` e
 * `periodo_experimental_ate`) e NAO deriva uma da outra por trigger, para nao
 * haver duas fontes de verdade em silencio. Quem deriva e o ecra, aqui, e so
 * quando a duracao esta preenchida e a data nao.
 */
export function dataDoPeriodoExperimental(dataInicio: string, dias: number): string | null {
  if (dataInicio.trim() === "") return null;
  const inicio = new Date(`${dataInicio}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return null;
  inicio.setDate(inicio.getDate() + dias);
  // NAO se usa `toISOString`: ela converte para UTC e, em Lisboa no horario de
  // verao, devolvia o dia ANTERIOR -- 90 dias a partir de 1 de Janeiro davam
  // 31 de Marco em vez de 1 de Abril. A data e civil, nao um instante.
  const mes = String(inicio.getMonth() + 1).padStart(2, "0");
  const dia = String(inicio.getDate()).padStart(2, "0");
  return `${inicio.getFullYear()}-${mes}-${dia}`;
}

export function payloadDoRascunho(
  rascunho: RascunhoPessoa,
  linhasDeHorario: (horario: HorarioRascunho) => LinhaPlaneadoParaGravar[],
): NovaPessoaPayload {
  const { geral, pessoais, laborais, contrato, acesso } = rascunho;

  const temPessoais =
    texto(pessoais.data_nascimento) !== null ||
    pessoais.genero !== "" ||
    texto(pessoais.pronomes) !== null ||
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
    ? numero(contrato.periodo_experimental_dias)
    : null;

  const temVinculo =
    contrato.tipo_contrato !== "" ||
    texto(contrato.data_inicio) !== null ||
    texto(contrato.horas_trabalho) !== null ||
    contrato.tipo_trabalho !== "" ||
    contrato.dias_uteis.length > 0;

  const valorBase = numero(contrato.valor_base);

  return {
    nucleo: {
      primeiro_nome: geral.primeiro_nome.trim(),
      apelido: geral.apelido.trim(),
      nome_social: texto(geral.nome_social),
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
          pronomes: texto(pessoais.pronomes),
          nacionalidade: texto(pessoais.nacionalidade),
          estado_civil: pessoais.estado_civil === "" ? null : pessoais.estado_civil,
          dependentes: numero(pessoais.dependentes),
          telefone_pessoal: texto(pessoais.telefone_pessoal),
          email_comunicacoes: texto(pessoais.email_pessoal),
        }
      : null,
    identificacao: temIdentificacao
      ? {
          tipo_documento: pessoais.tipo_documento === "" ? null : pessoais.tipo_documento,
          numero_documento: texto(pessoais.numero_documento),
          validade_documento: texto(pessoais.validade_documento),
          nif: texto(pessoais.nif),
        }
      : null,
    niss: texto(pessoais.niss),
    morada:
      texto(pessoais.morada_linha1) !== null
        ? {
            tipo: "residencia",
            linha1: pessoais.morada_linha1.trim(),
            linha2: texto(pessoais.morada_linha2),
            codigo_postal: texto(pessoais.morada_codigo_postal),
            localidade: texto(pessoais.morada_localidade),
            distrito: texto(pessoais.morada_distrito),
            pais: pessoais.morada_pais.trim() || "PT",
            is_principal: true,
          }
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
          horas_semanais: numero(contrato.horas_trabalho),
          horas_frequencia: contrato.horas_frequencia,
          data_inicio: texto(contrato.data_inicio) ?? texto(laborais.data_admissao) ?? hoje(),
          data_fim: texto(contrato.data_fim),
          periodo_experimental_dias: experimentalDias,
          periodo_experimental_ate:
            experimentalDias === null
              ? null
              : dataDoPeriodoExperimental(
                  texto(contrato.data_inicio) ?? texto(laborais.data_admissao) ?? hoje(),
                  experimentalDias,
                ),
          tipo_trabalho: contrato.tipo_trabalho === "" ? null : contrato.tipo_trabalho,
          tempo_trabalho_pct: numero(contrato.tempo_trabalho_pct),
          dias_uteis: contrato.dias_uteis.length > 0 ? contrato.dias_uteis : null,
          politica_feriados: contrato.politica_feriados,
          horas_anuais_maximas: numero(contrato.horas_anuais_maximas),
          horas_semanais_maximas: numero(contrato.horas_semanais_maximas),
          estado: "activo",
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
  };
}

/**
 * A data de hoje como data CIVIL, no fuso de quem esta a usar a aplicacao.
 *
 * `toISOString().slice(0, 10)` parece equivalente e nao e: converte para UTC e,
 * em Lisboa, a meia-noite e meia devolve o dia anterior. Uma data de admissao
 * errada por um dia nao da erro nenhum -- so fica errada.
 */
export function dataDeHoje(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function hoje(): string {
  return dataDeHoje();
}

/** Reexportado para quem valida horas nas seccoes, sem importar dois modulos. */
export { minutosDe };
