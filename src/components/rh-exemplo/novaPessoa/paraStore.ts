// Dos valores do formulário "Nova pessoa" para o que se grava na memória: tudo normalizado como o assistente real o
// normaliza (vazio é `null`, NIF sem espaços, país em maiúsculas) e nada inventado. Funções puras.
import type { ExtrasNovaPessoa } from "@/components/rh-exemplo/dados/fichaNovaPessoa";
import type { NovaPessoaExemplo } from "@/components/rh-exemplo/hooks/usePessoas";
import {
  CAMPOS_OBRIGATORIOS_ADMISSAO, pendenciasDoRascunho, type ConfiguracaoCampo, type RascunhoConviteObrigatorios,
} from "@/components/rh-exemplo/lib/admissaoObrigatorios";
import { normalizarBic, normalizarConta } from "@/components/rh-exemplo/lib/conta";
import {
  cartaConducaoDoRascunho, dadosPessoaisExtra, fardamentoDoRascunho,
} from "@/components/rh-exemplo/lib/novaPessoaDetalhes";
import { dataDoPeriodoExperimental } from "@/components/rh-exemplo/lib/novaPessoaDatas";
import { numeroDe } from "@/components/rh-exemplo/lib/numeros";
import type { Pendencia } from "@/components/rh-exemplo/hooks/useAdmissaoPendencias";
import type { TipoContrato } from "@/components/rh-exemplo/tipos";
import { textoOuNull as texto, type ValoresNovaPessoa } from "./tiposNova";

type Normalizado = Pick<ExtrasNovaPessoa, "dadosPessoais" | "identificacao" | "morada" | "emergencia" | "bancarios">;

const algum = (...valores: string[]): boolean => valores.some((v) => v.trim() !== "");
const semEspacos = (v: string): string => v.replace(/\s+/g, "");
const upper = (v: string): string | null => texto(v)?.toUpperCase() ?? null;

function dadosPessoais(v: ValoresNovaPessoa): ExtrasNovaPessoa["dadosPessoais"] {
  const p = v.pessoais;
  return {
    data_nascimento: texto(p.data_nascimento),
    ocultar_aniversario: p.ocultar_aniversario,
    genero: p.genero === "" ? null : p.genero,
    nacionalidade: upper(p.nacionalidade),
    telefone_pessoal: texto(p.telefone_pessoal),
    estado_civil: p.estado_civil === "" ? null : p.estado_civil,
    dependentes: numeroDe(p.dependentes),
    irs_retencao_percentagem: null,
    ...dadosPessoaisExtra(p),
  } as ExtrasNovaPessoa["dadosPessoais"];
}

function identificacao(v: ValoresNovaPessoa): ExtrasNovaPessoa["identificacao"] {
  const p = v.pessoais;
  return {
    tipo_documento: p.tipo_documento === "" ? null : p.tipo_documento,
    numero_documento: texto(p.numero_documento),
    validade_documento: texto(p.validade_documento),
    nif: texto(semEspacos(p.nif)),
    niss_ultimos4: null,
    ...cartaConducaoDoRascunho(p),
  } as ExtrasNovaPessoa["identificacao"];
}

function morada(v: ValoresNovaPessoa): ExtrasNovaPessoa["morada"] {
  const p = v.pessoais;
  if (!algum(p.morada_linha1, p.morada_linha2, p.morada_codigo_postal, p.morada_localidade, p.morada_distrito)) return null;
  return {
    tipo: "residencia",
    linha1: p.morada_linha1.trim(),
    linha2: texto(p.morada_linha2),
    codigo_postal: texto(p.morada_codigo_postal),
    localidade: texto(p.morada_localidade),
    distrito: texto(p.morada_distrito),
    pais: upper(p.morada_pais) ?? "PT",
    is_principal: true,
  };
}

function emergencia(v: ValoresNovaPessoa): ExtrasNovaPessoa["emergencia"] {
  const p = v.pessoais;
  const e = v.extra;
  if (!algum(p.emergencia_nome, p.emergencia_relacao, p.emergencia_telefone, e.emergencia_telefone_alt, e.emergencia_email)) return null;
  return {
    nome: p.emergencia_nome.trim(),
    relacao: texto(p.emergencia_relacao),
    telefone: p.emergencia_telefone.trim(),
    telefone_alternativo: texto(e.emergencia_telefone_alt),
    email: texto(e.emergencia_email),
    ordem: 1,
  };
}

function bancarios(v: ValoresNovaPessoa): ExtrasNovaPessoa["bancarios"] {
  const p = v.pessoais;
  const numero = normalizarConta(p.conta_numero);
  if (!algum(numero, p.conta_titular, p.conta_banco, v.extra.conta_agencia, p.conta_bic)) return null;
  return {
    formato_conta: p.conta_formato,
    titular: texto(p.conta_titular),
    banco: texto(p.conta_banco),
    agencia: texto(v.extra.conta_agencia),
    conta_ultimos4: numero === "" ? null : numero.slice(-4),
    conta_pais: p.conta_formato === "iban" && numero !== "" ? numero.slice(0, 2) : null,
    swift: texto(normalizarBic(p.conta_bic)),
    is_principal: true,
  };
}

function normalizadosPessoais(v: ValoresNovaPessoa): Normalizado {
  return {
    dadosPessoais: dadosPessoais(v), identificacao: identificacao(v), morada: morada(v),
    emergencia: emergencia(v), bancarios: bancarios(v),
  };
}

function saude(v: ValoresNovaPessoa): ExtrasNovaPessoa["saude"] {
  const e = v.extra;
  if (!algum(e.saude_incapacidade, e.saude_validade, e.saude_adaptacoes, e.saude_observacoes)) return null;
  return {
    incapacidade_percentagem: numeroDe(e.saude_incapacidade),
    incapacidade_comprovativo_valido_ate: texto(e.saude_validade),
    necessidades_adaptacao: texto(e.saude_adaptacoes),
    observacoes: texto(e.saude_observacoes),
  };
}

function sindicalizacao(v: ValoresNovaPessoa): ExtrasNovaPessoa["sindicalizacao"] {
  const e = v.extra;
  if (e.sindicalizado === "") return null;
  return {
    sindicalizado: e.sindicalizado === "sim",
    // O sindicato e a quota só contam para quem está sindicalizado.
    sindicato: e.sindicalizado === "sim" ? texto(e.sindicato) : null,
    quota_percentagem: e.sindicalizado === "sim" ? numeroDe(e.sindicato_quota) : null,
  };
}

/** O fim só existe num contrato com termo. */
function dataFimDe(v: ValoresNovaPessoa): string | null {
  const tipo = v.contrato.tipo_contrato;
  return tipo === "" || tipo === "sem_termo" ? null : texto(v.contrato.data_fim);
}

function vinculo(v: ValoresNovaPessoa): ExtrasNovaPessoa["vinculo"] {
  const c = v.contrato;
  const e = v.extra;
  const inicio = texto(c.data_inicio) ?? texto(v.laborais.data_admissao);
  const dias = c.tem_periodo_experimental ? numeroDe(c.periodo_experimental_dias) : null;
  return {
    tipo_contrato: c.tipo_contrato === "" ? "sem_termo" : c.tipo_contrato,
    regime: c.regime,
    regime_contratual: c.regime_contratual,
    data_fim: dataFimDe(v),
    motivo_termo: null,
    periodo_experimental_dias: dias,
    periodo_experimental_ate: dias === null || inicio === null ? null : dataDoPeriodoExperimental(inicio, dias),
    periodo_experimental_origem: dias === null ? null : "manual",
    tipo_trabalho: c.tipo_trabalho === "" ? null : c.tipo_trabalho,
    tempo_trabalho_pct: numeroDe(c.tempo_trabalho_pct),
    dias_uteis: c.dias_uteis.length > 0 ? c.dias_uteis : null,
    politica_feriados: c.politica_feriados,
    horas_anuais_maximas: numeroDe(c.horas_anuais_maximas),
    horas_semanais_maximas: numeroDe(c.horas_semanais_maximas),
    categoria_funcao: e.categoria_funcao === "" ? null : e.categoria_funcao,
    categoria_profissional: texto(e.categoria_profissional),
    renovavel: e.renovavel === "" ? null : e.renovavel === "sim",
    isencao_horario: e.isencao_horario,
    formacao_inicio: null,
    formacao_fim: null,
  };
}

/** O que cada código de admissão da pessoa vale neste formulário, para saber o que fica por preencher. */
export function valoresDeAdmissao(v: ValoresNovaPessoa): RascunhoConviteObrigatorios {
  const p = v.pessoais;
  return {
    data_nascimento: p.data_nascimento, genero: p.genero, nacionalidade: p.nacionalidade,
    telefone_pessoal: p.telefone_pessoal, email_pessoal: p.email_pessoal, estado_civil: p.estado_civil,
    dependentes: p.dependentes, dependentes_deficientes: p.dependentes_deficientes,
    conjuge_situacao_profissional: p.conjuge_situacao_profissional, naturalidade_freguesia: p.naturalidade_freguesia,
    naturalidade_concelho: p.naturalidade_concelho, naturalidade_pais: p.naturalidade_pais,
    habilitacao_academica: p.habilitacao_academica, habilitacao_data_conclusao: p.habilitacao_data_conclusao,
    nif: p.nif, niss: p.niss, tipo_documento: p.tipo_documento, numero_documento: p.numero_documento,
    validade_documento: p.validade_documento, linha1: p.morada_linha1, codigo_postal: p.morada_codigo_postal,
    localidade: p.morada_localidade, tamanho_cima: p.tamanho_cima, tamanho_baixo: p.tamanho_baixo,
    tamanho_calcado: p.tamanho_calcado, conta_numero: p.conta_numero, conta_titular: p.conta_titular,
    conta_banco: p.conta_banco, conta_bic: p.conta_bic,
  };
}

/** O que fica por preencher na ficha: os campos da pessoa que a configuração não deixa opcionais e estão vazios. */
export function pendenciasDaNova(
  v: ValoresNovaPessoa, config: readonly ConfiguracaoCampo[] | null | undefined,
): Pendencia[] {
  return pendenciasDoRascunho(valoresDeAdmissao(v), CAMPOS_OBRIGATORIOS_ADMISSAO).flatMap((codigo): Pendencia[] => {
    const posicao = config?.find((c) => c.codigo === codigo)?.posicao ?? "convite";
    return posicao === "ficha" || posicao === "convite" ? [{ codigo, origem: "pessoa", posicao }] : [];
  });
}

export interface OpcoesGravar {
  config?: readonly ConfiguracaoCampo[] | null;
  comConvite: boolean;
}

export function extrasDeValores(v: ValoresNovaPessoa, o: OpcoesGravar): ExtrasNovaPessoa {
  const horas = numeroDe(v.contrato.horas_trabalho);
  const subsidio = numeroDe(v.contrato.subsidio);
  return {
    pessoa: {
      numero_interno: texto(v.geral.numero_interno),
      email_trabalho: texto(v.geral.email_trabalho) ?? (v.extra.criar_acesso ? texto(v.extra.email_acesso) : null),
      email_pessoal: texto(v.pessoais.email_pessoal),
      telefone_trabalho: texto(v.geral.telefone_trabalho),
      data_admissao: texto(v.laborais.data_admissao),
      data_antiguidade: texto(v.laborais.data_antiguidade),
    },
    nomeTratamento: texto(v.extra.nome_tratamento),
    semLocal: v.laborais.local_id === "",
    ...normalizadosPessoais(v),
    niss: texto(semEspacos(v.pessoais.niss)),
    contaNumero: texto(normalizarConta(v.pessoais.conta_numero)),
    fardamento: fardamentoDoRascunho(v.pessoais) as ExtrasNovaPessoa["fardamento"],
    saude: saude(v),
    sindicalizacao: sindicalizacao(v),
    vinculo: vinculo(v),
    horas: horas === null ? null : { periodo: horas, frequencia: v.contrato.horas_frequencia },
    retribuicao: {
      subsidio,
      modo: v.contrato.subsidio_modo === "" ? null : v.contrato.subsidio_modo,
      duodecimos: Number(v.contrato.duodecimos_pct || 0) as 0 | 50 | 100,
    },
    criarAcesso: v.extra.criar_acesso,
    anexos: v.extra.anexos.map(({ tipo, nome, tamanho, mime }) => ({ tipo, nome, tamanho, mime })),
    convite: o.comConvite ? { email: texto(v.pessoais.email_pessoal) } : null,
    pendencias: pendenciasDaNova(v, o.config),
  };
}

/** O que `criarPessoa` recebe. Só se chama com os valores já validados. */
export function paraNovaPessoa(v: ValoresNovaPessoa, o: OpcoesGravar): NovaPessoaExemplo {
  const inicio = texto(v.contrato.data_inicio) ?? v.laborais.data_admissao;
  return {
    primeiro_nome: v.geral.primeiro_nome.trim(),
    apelido: v.geral.apelido.trim(),
    cargoId: v.laborais.cargo_id,
    localId: v.laborais.local_id,
    tipoContrato: (v.contrato.tipo_contrato || "sem_termo") as TipoContrato,
    dataInicio: inicio,
    dataFim: dataFimDe(v),
    reportaAId: texto(v.laborais.reporta_a_pessoa_id),
    extras: extrasDeValores(v, o),
  };
}
