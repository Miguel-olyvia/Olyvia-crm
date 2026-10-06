/**
 * A obrigatoriedade do formulario de criar pessoa, pela configuracao da
 * admissao da organizacao (as tres posicoes: convite, ficha, opcional).
 *
 * Saiu de `novaPessoa.ts` (que passava das 800 linhas): so logica pura, sem
 * React nem base. `novaPessoa.ts` reexporta `camposDoConviteForaDoFormulario`
 * e `codigosObrigatoriosDoFormulario`, por isso quem as importava de la nao
 * muda; `problemasDeObrigatoriosDaConfiguracao` e usada por
 * `problemasDoRascunho`.
 *
 * Os imports de `novaPessoa` sao SO de tipos (apagados na compilacao): nao ha
 * dependencia circular em tempo de execucao.
 */
import {
  camposDoConvite,
  type ConfiguracaoCampo,
  type RascunhoConviteObrigatorios,
} from "@/lib/hr/admissaoObrigatorios";
import type { ProblemaCampo, QuemPreenche, RascunhoPessoais } from "@/lib/hr/novaPessoa";

/**
 * Onde vive, NESTE formulario, cada campo da pessoa que a configuracao da
 * admissao pode pedir. Os codigos que nao aparecem aqui (dependentes com
 * deficiencia, situacao do conjuge, naturalidade, habilitacoes, tamanhos de
 * farda, titular e banco da conta) nao existem neste formulario: nunca o
 * bloqueiam, ficam como pendencia na ficha (ver
 * `camposDoConviteForaDoFormulario`). O BIC ja NAO esta nesta lista: passou a
 * estar dentro do formulario.
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
  conta_numero: { campoId: "hr-novo-conta-numero", rotuloKey: "hr.campos.numeroConta" },
  conta_bic: { campoId: "hr-novo-conta-bic", rotuloKey: "hr.campos.swift" },
};

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
    // Sem campo neste formulario: ficam vazios e nunca entram na validacao.
    dependentes_deficientes: "",
    conjuge_situacao_profissional: "",
    naturalidade_freguesia: "",
    naturalidade_concelho: "",
    naturalidade_pais: "",
    habilitacao_academica: "",
    habilitacao_data_conclusao: "",
    nif: pessoais.nif,
    niss: pessoais.niss,
    tipo_documento: pessoais.tipo_documento,
    numero_documento: pessoais.numero_documento,
    validade_documento: pessoais.validade_documento,
    linha1: pessoais.morada_linha1,
    codigo_postal: pessoais.morada_codigo_postal,
    localidade: pessoais.morada_localidade,
    tamanho_cima: "",
    tamanho_baixo: "",
    tamanho_calcado: "",
    conta_numero: pessoais.conta_numero,
    conta_titular: "",
    conta_banco: "",
    conta_bic: pessoais.conta_bic,
  };
}

/**
 * Os campos da pessoa que ficam pendencia na ficha porque este formulario nao
 * os tem: o dialogo di-los a quem escolhe "O RH, agora", para ninguem achar
 * que a ficha ficou completa. Inclui as posicoes `convite` e `ficha` (as duas
 * viram pendencia; `opcional` nunca). Sem configuracao, devolve vazio.
 */
export function camposDoConviteForaDoFormulario(
  config: readonly ConfiguracaoCampo[] | null | undefined,
): string[] {
  if (!config) return [];
  return config
    .filter(
      (campo) =>
        campo.origem === "pessoa" &&
        (campo.posicao === "convite" || campo.posicao === "ficha") &&
        CAMPO_DO_FORMULARIO_POR_CODIGO[campo.codigo] === undefined,
    )
    .map((campo) => campo.codigo);
}

/**
 * Os campos da pessoa que a configuracao poe na posicao `convite` e que ESTE
 * formulario tem, ja com as condicoes de sempre (validade so se o documento
 * nao for cartao de cidadao; NIF ou NISS, basta um).
 */
export function problemasDeObrigatoriosDaConfiguracao(
  pessoais: RascunhoPessoais,
  config: readonly ConfiguracaoCampo[],
): ProblemaCampo[] {
  const valores = valoresDoFormularioParaAdmissao(pessoais);
  const problemas: ProblemaCampo[] = [];
  for (const campo of camposDoConvite(config)) {
    const onde = CAMPO_DO_FORMULARIO_POR_CODIGO[campo.codigo];
    if (!onde || !campo.condicao(valores)) continue;
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
 * ecra pintar o asterisco. Em modo `convite` so ha um (o e-mail, destino do
 * convite); em modo `rh` e o que a configuracao poe no convite E este
 * formulario tem -- sem as condicoes, que so se decidem com os valores.
 */
export function codigosObrigatoriosDoFormulario(
  quemPreenche: QuemPreenche,
  config: readonly ConfiguracaoCampo[] | null | undefined,
): ReadonlySet<string> {
  if (quemPreenche === "convite") return new Set(["email_pessoal"]);
  if (!config) return new Set();
  return new Set(
    camposDoConvite(config)
      .map((campo) => campo.codigo as string)
      .filter((codigo) => CAMPO_DO_FORMULARIO_POR_CODIGO[codigo] !== undefined),
  );
}
