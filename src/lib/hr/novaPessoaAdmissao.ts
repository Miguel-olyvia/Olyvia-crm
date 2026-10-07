/**
 * A obrigatoriedade do formulario de criar pessoa, pela configuracao da
 * admissao da organizacao (as tres posicoes: convite, ficha, opcional).
 *
 * REGRA: se o campo e obrigatorio, e obrigatorio -- tanto no convite como no RH
 * a preencher. O formulario mostra SEMPRE todos os campos; o que muda e QUEM os
 * preenche:
 *  - sem enviar convite (o RH preenche): os campos da posicao `convite` levam
 *    asterisco e BLOQUEIAM a criacao ate estarem preenchidos;
 *  - a enviar convite (a pessoa preenche): so se exige o e-mail pessoal; os
 *    obrigatorios ficam para a pessoa (o convite ja a impede de submeter sem
 *    eles) e nao levam asterisco aqui;
 *  - as posicoes `ficha` e `opcional` nunca bloqueiam: o que ficar por preencher
 *    aparece como pendencia na ficha (`camposPorPreencherNaFicha`).
 *
 * Saiu de `novaPessoa.ts` (que passava das 800 linhas): so logica pura, sem
 * React nem base. `novaPessoa.ts` reexporta `camposPorPreencherNaFicha` e
 * `codigosObrigatoriosDoFormulario`; `problemasDeObrigatoriosDaConfiguracao` e
 * usada por `problemasDoRascunho`.
 *
 * Os imports de `novaPessoa` sao SO de tipos (apagados na compilacao): nao ha
 * dependencia circular em tempo de execucao.
 */
import {
  CAMPOS_OBRIGATORIOS_ADMISSAO,
  camposDoConvite,
  type ConfiguracaoCampo,
  type RascunhoConviteObrigatorios,
} from "@/lib/hr/admissaoObrigatorios";
import type { ProblemaCampo, RascunhoPessoais } from "@/lib/hr/novaPessoa";

/**
 * Onde vive, NESTE formulario, cada campo da pessoa que a configuracao da
 * admissao pode pedir. Desde a fase 1 o formulario tem TODOS os que o convite
 * tem (a carta de conducao nao esta na configuracao, por isso nao aparece
 * aqui). Um codigo que nao apareca aqui -- por exemplo um campo novo do
 * servidor que o ecra ainda nao conhece -- nunca bloqueia: fica como pendencia
 * na ficha (ver `camposPorPreencherNaFicha`).
 */
const CAMPO_DO_FORMULARIO_POR_CODIGO: Readonly<
  Record<string, { campoId: string; rotuloKey: string }>
> = {
  data_nascimento: { campoId: "hr-novo-data-nascimento", rotuloKey: "employees.form.birthDate" },
  genero: { campoId: "hr-novo-genero", rotuloKey: "hr.campos.genero" },
  nacionalidade: { campoId: "hr-novo-nacionalidade", rotuloKey: "hr.campos.nacionalidade" },
  telefone_pessoal: { campoId: "hr-novo-telefone-pessoal", rotuloKey: "hr.campos.telefonePessoal" },
  email_pessoal: { campoId: "hr-novo-email-pessoal", rotuloKey: "hr.campos.emailPessoal" },
  estado_civil: { campoId: "hr-novo-estado-civil", rotuloKey: "hr.campos.estadoCivil" },
  dependentes: { campoId: "hr-novo-dependentes", rotuloKey: "hr.campos.dependentes" },
  dependentes_deficientes: {
    campoId: "hr-novo-dependentes-deficientes",
    rotuloKey: "hr.campos.dependentesDeficientes",
  },
  conjuge_situacao_profissional: {
    campoId: "hr-novo-conjuge-situacao",
    rotuloKey: "hr.campos.conjugeSituacaoProfissional",
  },
  naturalidade_freguesia: {
    campoId: "hr-novo-naturalidade-freguesia",
    rotuloKey: "hr.campos.naturalidadeFreguesia",
  },
  naturalidade_concelho: {
    campoId: "hr-novo-naturalidade-concelho",
    rotuloKey: "hr.campos.naturalidadeConcelho",
  },
  naturalidade_pais: {
    campoId: "hr-novo-naturalidade-pais",
    rotuloKey: "hr.campos.naturalidadePais",
  },
  habilitacao_academica: {
    campoId: "hr-novo-habilitacao",
    rotuloKey: "hr.campos.habilitacaoAcademica",
  },
  habilitacao_data_conclusao: {
    campoId: "hr-novo-habilitacao-data",
    rotuloKey: "hr.campos.habilitacaoDataConclusao",
  },
  tipo_documento: { campoId: "hr-novo-tipo-documento", rotuloKey: "hr.campos.tipoDocumento" },
  numero_documento: { campoId: "hr-novo-numero-documento", rotuloKey: "hr.campos.numeroDocumento" },
  validade_documento: {
    campoId: "hr-novo-validade-documento",
    rotuloKey: "hr.campos.validadeDocumento",
  },
  nif: { campoId: "hr-novo-nif", rotuloKey: "hr.campos.nif" },
  niss: { campoId: "hr-novo-niss", rotuloKey: "hr.campos.niss" },
  linha1: { campoId: "hr-novo-morada-linha1", rotuloKey: "hr.campos.enderecoRua" },
  codigo_postal: {
    campoId: "hr-novo-morada-codigo-postal",
    rotuloKey: "employees.form.postalCode",
  },
  localidade: { campoId: "hr-novo-morada-localidade", rotuloKey: "hr.campos.cidade" },
  tamanho_cima: { campoId: "hr-novo-tamanho-cima", rotuloKey: "hr.fardamento.tamanhoCima" },
  tamanho_baixo: { campoId: "hr-novo-tamanho-baixo", rotuloKey: "hr.fardamento.tamanhoBaixo" },
  tamanho_calcado: {
    campoId: "hr-novo-tamanho-calcado",
    rotuloKey: "hr.fardamento.tamanhoCalcado",
  },
  conta_numero: { campoId: "hr-novo-conta-numero", rotuloKey: "hr.campos.numeroConta" },
  conta_titular: { campoId: "hr-novo-conta-titular", rotuloKey: "hr.campos.titularConta" },
  conta_banco: { campoId: "hr-novo-conta-banco", rotuloKey: "hr.campos.banco" },
  conta_bic: { campoId: "hr-novo-conta-bic", rotuloKey: "hr.campos.swift" },
};

/**
 * Os quatro campos da seccao bancaria. Quem nao tem `hr.pessoas.bancarios.edit`
 * nao os pode escrever (o ecra desactiva-os): nao se exige o que nao se pode
 * preencher, e ficam como pendencia na ficha.
 */
export const CODIGOS_BANCARIOS: readonly string[] = [
  "conta_numero",
  "conta_bic",
  "conta_titular",
  "conta_banco",
];

/**
 * Os tres tamanhos de farda. Vivem em `pessoas_fardamento`, cuja RLS de escrita
 * exige `hr.pessoas.laborais.edit` (e nao `pessoais.edit`): sem ela o ecra
 * desactiva-os e ficam como pendencia na ficha. (Os `*_detalhe` so existem com
 * o tamanho `outro`, por isso seguem o mesmo destino.)
 */
export const CODIGOS_FARDAMENTO: readonly string[] = [
  "tamanho_cima",
  "tamanho_baixo",
  "tamanho_calcado",
];

/**
 * Titular e banco so se gravam com numero de conta (a RPC exige-o): sem conta
 * o ecra desactiva-os, por isso nao se exigem -- ficam como pendencia.
 */
export const CODIGOS_SO_COM_CONTA: readonly string[] = ["conta_titular", "conta_banco"];

/** Codigos que o utilizador nao pode preencher AGORA, por falta de permissao. */
export type CodigosIndisponiveis = ReadonlySet<string>;

/** Os codigos indisponiveis conforme as permissoes de escrita de quem cria. */
export function codigosIndisponiveis(pode: {
  bancarios: boolean;
  laborais: boolean;
}): CodigosIndisponiveis {
  return new Set<string>([
    ...(pode.bancarios ? [] : CODIGOS_BANCARIOS),
    ...(pode.laborais ? [] : CODIGOS_FARDAMENTO),
  ]);
}

/** Titular e banco sem numero de conta: nao se podem preencher, logo nao se exigem. */
function semContaParaTitularOuBanco(codigo: string, pessoais: RascunhoPessoais): boolean {
  return CODIGOS_SO_COM_CONTA.includes(codigo) && pessoais.conta_numero.trim() === "";
}

/** O que este formulario sabe dizer sobre cada codigo da lista de admissao. */
function valoresDoFormularioParaAdmissao(
  pessoais: RascunhoPessoais,
): RascunhoConviteObrigatorios {
  return {
    data_nascimento: pessoais.data_nascimento,
    genero: pessoais.genero,
    nacionalidade: pessoais.nacionalidade,
    telefone_pessoal: pessoais.telefone_pessoal,
    email_pessoal: pessoais.email_pessoal,
    estado_civil: pessoais.estado_civil,
    dependentes: pessoais.dependentes,
    dependentes_deficientes: pessoais.dependentes_deficientes,
    conjuge_situacao_profissional: pessoais.conjuge_situacao_profissional,
    naturalidade_freguesia: pessoais.naturalidade_freguesia,
    naturalidade_concelho: pessoais.naturalidade_concelho,
    naturalidade_pais: pessoais.naturalidade_pais,
    habilitacao_academica: pessoais.habilitacao_academica,
    habilitacao_data_conclusao: pessoais.habilitacao_data_conclusao,
    nif: pessoais.nif,
    niss: pessoais.niss,
    tipo_documento: pessoais.tipo_documento,
    numero_documento: pessoais.numero_documento,
    validade_documento: pessoais.validade_documento,
    linha1: pessoais.morada_linha1,
    codigo_postal: pessoais.morada_codigo_postal,
    localidade: pessoais.morada_localidade,
    tamanho_cima: pessoais.tamanho_cima,
    tamanho_baixo: pessoais.tamanho_baixo,
    tamanho_calcado: pessoais.tamanho_calcado,
    conta_numero: pessoais.conta_numero,
    conta_titular: pessoais.conta_titular,
    conta_banco: pessoais.conta_banco,
    conta_bic: pessoais.conta_bic,
  };
}

/**
 * Os codigos da pessoa que ficam como pendencia na ficha sem bloquear a
 * criacao, para o ecra o dizer a quem cria:
 *  - posicao `ficha`, com a condicao de sempre, e ainda por preencher;
 *  - posicao `convite` mas que este formulario nao pode exigir: um codigo que
 *    nao conhece, ou um `indisponivel` (a seccao bancaria, sem permissao).
 * `opcional` nunca. Sem configuracao, devolve vazio.
 */
export function camposPorPreencherNaFicha(
  config: readonly ConfiguracaoCampo[] | null | undefined,
  pessoais: RascunhoPessoais,
  indisponiveis?: CodigosIndisponiveis,
): string[] {
  if (!config) return [];
  const valores = valoresDoFormularioParaAdmissao(pessoais);
  const regras = new Map(CAMPOS_OBRIGATORIOS_ADMISSAO.map((c) => [c.codigo as string, c]));
  const porPreencher: string[] = [];
  for (const campo of config) {
    if (campo.origem !== "pessoa") continue;
    const conhecido = CAMPO_DO_FORMULARIO_POR_CODIGO[campo.codigo] !== undefined;
    if (campo.posicao === "convite") {
      if (
        !conhecido ||
        indisponiveis?.has(campo.codigo) ||
        semContaParaTitularOuBanco(campo.codigo, pessoais)
      ) {
        porPreencher.push(campo.codigo);
      }
      continue;
    }
    if (campo.posicao !== "ficha") continue;
    const regra = regras.get(campo.codigo);
    if (!conhecido || !regra) {
      porPreencher.push(campo.codigo);
      continue;
    }
    if (!regra.condicao(valores)) continue;
    if (String(valores[regra.codigo]).trim() === "") porPreencher.push(campo.codigo);
  }
  return porPreencher;
}

/**
 * Os campos da pessoa que a configuracao poe na posicao `convite` e que ESTE
 * formulario tem, ja com as condicoes de sempre (validade so se o documento
 * nao for cartao de cidadao; NIF ou NISS, basta um; situacao do conjuge so com
 * casado ou uniao de facto). Os `indisponiveis` nao se exigem.
 */
export function problemasDeObrigatoriosDaConfiguracao(
  pessoais: RascunhoPessoais,
  config: readonly ConfiguracaoCampo[],
  indisponiveis?: CodigosIndisponiveis,
): ProblemaCampo[] {
  const valores = valoresDoFormularioParaAdmissao(pessoais);
  const problemas: ProblemaCampo[] = [];
  for (const campo of camposDoConvite(config)) {
    const onde = CAMPO_DO_FORMULARIO_POR_CODIGO[campo.codigo];
    if (!onde || indisponiveis?.has(campo.codigo) || !campo.condicao(valores)) continue;
    // Titular e banco so se exigem com numero de conta (senao ficam desactivados).
    if (semContaParaTitularOuBanco(campo.codigo, pessoais)) continue;
    // `dependentes` 0 e resposta; o teste e sempre sobre texto vazio.
    if (String(valores[campo.codigo]).trim() !== "") continue;
    problemas.push({
      seccao: "pessoais",
      campoId: onde.campoId,
      rotuloKey: onde.rotuloKey,
      mensagemKey: "hr.form.erroObrigatorio",
    });
  }
  return problemas;
}

/**
 * Os codigos da pessoa que o formulario exige com a configuracao dada, para o
 * ecra pintar o asterisco. A enviar convite (`comConvite`) nenhum: a pessoa e
 * que os preenche. Sem convite e o que a configuracao poe na posicao `convite`
 * E este formulario tem e o utilizador pode escrever -- sem as condicoes, que so
 * se decidem com os valores. Sem configuracao, vazio.
 */
export function codigosObrigatoriosDoFormulario(
  comConvite: boolean,
  config: readonly ConfiguracaoCampo[] | null | undefined,
  indisponiveis?: CodigosIndisponiveis,
): ReadonlySet<string> {
  if (comConvite || !config) return new Set();
  return new Set(
    camposDoConvite(config)
      .map((campo) => campo.codigo as string)
      .filter(
        (codigo) =>
          CAMPO_DO_FORMULARIO_POR_CODIGO[codigo] !== undefined && !indisponiveis?.has(codigo),
      ),
  );
}
