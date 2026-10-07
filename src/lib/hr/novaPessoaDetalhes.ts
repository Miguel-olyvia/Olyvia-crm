/**
 * Os campos do formulario "Nova pessoa" que o convite de admissao tambem pede
 * (fase 1): naturalidade, habilitacoes, dependentes com deficiencia, situacao
 * do conjuge, carta de conducao, fardamento, titular e banco da conta.
 *
 * Saiu de `novaPessoa.ts` (que ja passava das 800 linhas): so forma e funcoes
 * puras, sem React nem base. Quem escreve na base e `usePessoas.criarPessoa`.
 *
 * ONDE CAI CADA CAMPO
 * -------------------
 * - naturalidade, habilitacao, dependentes com deficiencia e situacao do
 *   conjuge -> `pessoas_dados_pessoais`;
 * - carta de conducao -> `pessoas_identificacao`;
 * - tamanhos de farda -> `pessoas_fardamento` (satelite proprio, gate
 *   `hr.pessoas.laborais.edit`);
 * - titular e banco -> `rpc_hr_definir_conta`, MAS so com numero de conta: a
 *   RPC exige o numero e e ela que grava titular e banco. Sem conta, o ecra
 *   desactiva os dois campos e aqui nunca seguem.
 *
 * Os imports de `novaPessoa` sao SO de tipos (apagados na compilacao).
 */
import { bicValido, contaValida, normalizarBic, normalizarConta } from "@/lib/hr/conta";
import { nifValido, nissValido } from "@/lib/hr/identificadoresPt";
import { numeroDe } from "@/lib/hr/numeros";
import type { ProblemaCampo, RascunhoPessoais } from "@/lib/hr/novaPessoa";
import type {
  ConjugeSituacaoProfissional,
  EstadoCivil,
  FormatoConta,
  HabilitacaoAcademica,
  TamanhoCalcado,
  TamanhoCalcas,
  TamanhoFardamento,
} from "@/types/hr";

/**
 * O maximo de dependentes e de dependentes com deficiencia: o CHECK da base
 * (`pessoas_dados_pessoais_dependentes_validos`, smallint) e 0 a 30.
 */
export const MAXIMO_DEPENDENTES = 30;
export const MAXIMO_DEPENDENTES_DEFICIENTES = MAXIMO_DEPENDENTES;

/** Texto preenchido que nao e um inteiro de 0 ao maximo (virgula e ponto decimais contam como erro). */
function inteiroInvalido(valor: string, maximo: number): boolean {
  if (valor.trim() === "") return false;
  const n = numeroDe(valor);
  return n === null || !Number.isInteger(n) || n < 0 || n > maximo;
}

export interface RascunhoDetalhesExtra {
  /** Numero 0..30; `""` (por preencher) nao e `0` (resposta). */
  dependentes_deficientes: string;
  /** So se pergunta e so segue com casado ou uniao de facto. */
  conjuge_situacao_profissional: ConjugeSituacaoProfissional | "";
  naturalidade_freguesia: string;
  naturalidade_concelho: string;
  /** Codigo ISO 3166-1 alpha-2, nunca o nome do pais. */
  naturalidade_pais: string;
  habilitacao_academica: HabilitacaoAcademica | "";
  habilitacao_data_conclusao: string;
  carta_conducao_numero: string;
  carta_conducao_categorias: string;
  carta_conducao_validade: string;
  /** Titular e banco da conta: so contam se houver numero de conta. */
  conta_titular: string;
  conta_banco: string;
  tamanho_cima: TamanhoFardamento | "";
  /** So segue quando o tamanho e `outro`. */
  tamanho_cima_detalhe: string;
  tamanho_baixo: TamanhoCalcas | "";
  tamanho_baixo_detalhe: string;
  tamanho_calcado: TamanhoCalcado | "";
  tamanho_calcado_detalhe: string;
}

export const DETALHES_EXTRA_VAZIOS: Readonly<RascunhoDetalhesExtra> = {
  dependentes_deficientes: "",
  conjuge_situacao_profissional: "",
  naturalidade_freguesia: "",
  naturalidade_concelho: "",
  naturalidade_pais: "",
  habilitacao_academica: "",
  habilitacao_data_conclusao: "",
  carta_conducao_numero: "",
  carta_conducao_categorias: "",
  carta_conducao_validade: "",
  conta_titular: "",
  conta_banco: "",
  tamanho_cima: "",
  tamanho_cima_detalhe: "",
  tamanho_baixo: "",
  tamanho_baixo_detalhe: "",
  tamanho_calcado: "",
  tamanho_calcado_detalhe: "",
};

/** Texto aparado; vazio e `null`. */
export function texto(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/** A situacao do conjuge so se aplica a quem tem conjuge ou unido de facto. */
export function temConjuge(estadoCivil: string): boolean {
  return estadoCivil === "casado" || estadoCivil === "uniao_de_facto";
}

/**
 * O que muda no rascunho ao escolher o estado civil: sem conjuge, a situacao
 * profissional do conjuge (que o ecra esconde) limpa-se -- senao ficava um valor
 * invisivel, reaparecia ao voltar a "casado" e contava como preenchido.
 */
export function patchEstadoCivil(estado: EstadoCivil | ""): Partial<RascunhoPessoais> {
  return temConjuge(estado)
    ? { estado_civil: estado }
    : { estado_civil: estado, conjuge_situacao_profissional: "" };
}

/** Idem para o tamanho de farda: o detalhe so existe com `outro`, e limpa-se ao sair de `outro`. */
export function patchTamanho(
  campo: "cima" | "baixo" | "calcado",
  tamanho: string,
): Partial<RascunhoPessoais> {
  const patch: Record<string, string> = { [`tamanho_${campo}`]: tamanho };
  if (tamanho !== "outro") patch[`tamanho_${campo}_detalhe`] = "";
  return patch as Partial<RascunhoPessoais>;
}

/** O detalhe de um tamanho so existe quando o tamanho e `outro`. */
function detalheSeOutro(tamanho: string, detalhe: string): string | null {
  return tamanho === "outro" ? texto(detalhe) : null;
}

/** Alguma das colunas novas de `pessoas_dados_pessoais` tem valor? */
export function temDadosPessoaisExtra(p: RascunhoPessoais): boolean {
  return (
    texto(p.dependentes_deficientes) !== null ||
    (temConjuge(p.estado_civil) && p.conjuge_situacao_profissional !== "") ||
    texto(p.naturalidade_freguesia) !== null ||
    texto(p.naturalidade_concelho) !== null ||
    texto(p.naturalidade_pais) !== null ||
    p.habilitacao_academica !== "" ||
    texto(p.habilitacao_data_conclusao) !== null
  );
}

/** As colunas novas de `pessoas_dados_pessoais`, normalizadas como o convite as normaliza. */
export function dadosPessoaisExtra(p: RascunhoPessoais): Record<string, unknown> {
  return {
    dependentes_deficientes: numeroDe(p.dependentes_deficientes),
    // Um valor deixado de um estado civil anterior nao fica gravado.
    conjuge_situacao_profissional:
      temConjuge(p.estado_civil) && p.conjuge_situacao_profissional !== ""
        ? p.conjuge_situacao_profissional
        : null,
    naturalidade_freguesia: texto(p.naturalidade_freguesia),
    naturalidade_concelho: texto(p.naturalidade_concelho),
    naturalidade_pais: texto(p.naturalidade_pais)?.toUpperCase() ?? null,
    habilitacao_academica: p.habilitacao_academica === "" ? null : p.habilitacao_academica,
    habilitacao_data_conclusao: texto(p.habilitacao_data_conclusao),
  };
}

export function temCartaConducao(p: RascunhoPessoais): boolean {
  return (
    texto(p.carta_conducao_numero) !== null ||
    texto(p.carta_conducao_categorias) !== null ||
    texto(p.carta_conducao_validade) !== null
  );
}

/** As colunas da carta de conducao, em `pessoas_identificacao`. */
export function cartaConducaoDoRascunho(p: RascunhoPessoais): Record<string, unknown> {
  return {
    carta_conducao_numero: texto(p.carta_conducao_numero),
    carta_conducao_categorias: texto(p.carta_conducao_categorias),
    carta_conducao_validade: texto(p.carta_conducao_validade),
  };
}

/**
 * A linha de `pessoas_fardamento`, ou `null` quando nao ha nenhum tamanho (um
 * detalhe solto, sem tamanho, nao cria linha).
 */
export function fardamentoDoRascunho(p: RascunhoPessoais): Record<string, unknown> | null {
  if (p.tamanho_cima === "" && p.tamanho_baixo === "" && p.tamanho_calcado === "") return null;
  return {
    tamanho_cima: p.tamanho_cima === "" ? null : p.tamanho_cima,
    tamanho_cima_detalhe: detalheSeOutro(p.tamanho_cima, p.tamanho_cima_detalhe),
    tamanho_baixo: p.tamanho_baixo === "" ? null : p.tamanho_baixo,
    tamanho_baixo_detalhe: detalheSeOutro(p.tamanho_baixo, p.tamanho_baixo_detalhe),
    tamanho_calcado: p.tamanho_calcado === "" ? null : p.tamanho_calcado,
    tamanho_calcado_detalhe: detalheSeOutro(p.tamanho_calcado, p.tamanho_calcado_detalhe),
  };
}

export interface ContaDoPayload {
  formato: FormatoConta;
  numero: string;
  swift: string | null;
  titular: string | null;
  banco: string | null;
}

/**
 * A conta (vai por `rpc_hr_definir_conta`) e o BIC sozinho (vai por
 * `rpc_hr_definir_bic`). Com numero, o BIC, o titular e o banco viajam dentro
 * de `conta`; sem numero so o BIC segue -- titular e banco nao, a RPC so os
 * grava com conta.
 */
export function contaDoRascunho(p: RascunhoPessoais): {
  conta: ContaDoPayload | null;
  bicSozinho: string | null;
} {
  const numero = normalizarConta(p.conta_numero);
  const bic = normalizarBic(p.conta_bic) || null;
  if (numero === "") return { conta: null, bicSozinho: bic };
  return {
    conta: {
      formato: p.conta_formato,
      numero,
      swift: bic,
      titular: texto(p.conta_titular),
      banco: texto(p.conta_banco),
    },
    bicSozinho: null,
  };
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Os problemas de FORMATO dos dados pessoais (vazio nunca e erro, malformado e
 * sempre): e-mail, NIF e NISS com digito de controlo, conta e BIC, dependentes
 * e dependentes com deficiencia (0 a 30).
 */
export function problemasDeFormatoDosPessoais(pessoais: RascunhoPessoais): ProblemaCampo[] {
  const problemas: ProblemaCampo[] = [];
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

  if (inteiroInvalido(pessoais.dependentes, MAXIMO_DEPENDENTES)) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-dependentes",
      rotuloKey: "hr.campos.dependentes",
      mensagemKey: "hr.form.erroNumero",
    });
  }
  if (inteiroInvalido(pessoais.dependentes_deficientes, MAXIMO_DEPENDENTES_DEFICIENTES)) {
    problemas.push({
      seccao: "pessoais",
      campoId: "hr-novo-dependentes-deficientes",
      rotuloKey: "hr.campos.dependentesDeficientes",
      mensagemKey: "hr.form.erroNumero",
    });
  }
  return problemas;
}
