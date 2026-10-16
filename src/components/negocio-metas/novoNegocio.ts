// Lógica pura do botão "Novo negócio": o que o formulário pede, a validação e o negócio de exemplo que sai dele. Nada
// aqui grava nem lê o relógio: o dia de hoje e o número de série chegam por parâmetro.
import type {
  DadosContactoNegocio, EstadoLevantamento, LevantamentoNegocio, MoradaObraNegocio, NegocioMes, RespostaNegocio, SeccaoVisitaNegocio,
  VisitaNegocio,
} from "./negocioMetas";
import { moradaAparada, temMorada, validarCodigoPostal, type MoradaObraForm } from "./moradaObra";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";
import { temLevantamento, validarLevantamento, type ErrosLevantamento, type LevantamentoForm } from "./levantamento";
import type { Respostas } from "./perguntasTipos";

/** Uma pessoa a escolher no formulário. A página monta a lista (Negócio e metas não importa de Pessoas). */
export interface PessoaOpcao {
  id: string;
  nome: string;
  contacto?: { telefone: string | null; email: string | null };
  /** Os dados da ficha, para pré-preencher a secção Contacto (todos opcionais). */
  email?: string;
  morada?: string;
  distrito?: string;
  nif?: string;
  empresa?: string;
  nifEmpresa?: string;
}

export const CHAVES_CONTACTO = ["email", "morada", "distrito", "nif", "empresa", "nifEmpresa"] as const;
export type ChaveContacto = (typeof CHAVES_CONTACTO)[number];

export const CONTACTO_VAZIO: DadosContactoNegocio = { email: "", morada: "", distrito: "", nif: "", empresa: "", nifEmpresa: "" };

/** Os seis campos de contacto de uma pessoa (texto vazio quando não os tem); sem pessoa, tudo vazio. */
export function preencherContactoDaPessoa(pessoa: PessoaOpcao | undefined | null): DadosContactoNegocio {
  return {
    email: pessoa?.email ?? pessoa?.contacto?.email ?? "",
    morada: pessoa?.morada ?? "",
    distrito: pessoa?.distrito ?? "",
    // Os NIF da ficha podem vir escritos com espaços ("204 567 890"): sem os tirar, o formulário nunca os validava.
    nif: (pessoa?.nif ?? "").replace(/\s+/g, ""),
    empresa: pessoa?.empresa ?? "",
    nifEmpresa: (pessoa?.nifEmpresa ?? "").replace(/\s+/g, ""),
  };
}

/** Ao mudar de pessoa: os campos tocados mantêm o que o utilizador escreveu, os outros passam a ser os da nova pessoa. */
export function reporContacto(
  atual: DadosContactoNegocio, tocados: ReadonlySet<ChaveContacto>, pessoa: PessoaOpcao | undefined | null,
): DadosContactoNegocio {
  const novo = preencherContactoDaPessoa(pessoa);
  return Object.fromEntries(CHAVES_CONTACTO.map((c) => [c, tocados.has(c) ? atual[c] : novo[c]])) as unknown as DadosContactoNegocio;
}

/** Os comerciais do exemplo (os das metas); o primeiro é o por omissão. */
export const COMERCIAIS_EXEMPLO: readonly string[] = DADOS_EXEMPLO.metasComerciais.map((m) => m.comercial);
export const COMERCIAL_POR_OMISSAO: string = COMERCIAIS_EXEMPLO[0];

/** O primeiro prazo de um negócio novo: levantamento daqui a 2 dias. */
export const DIAS_ATE_PRIMEIRO_PRAZO = 2;

/** O levantamento a meio, guardado sem criar o negócio: o que o formulário precisa para voltar a abrir como estava. */
export interface RascunhoLevantamento {
  linhas: LevantamentoForm["linhas"];
  observacoes: string;
  respostas: Respostas;
}

/**
 * O que o painel "Novo negócio" já traz preenchido quando a página o abre a partir de outro sítio (hoje, a visita
 * concluída de uma pessoa). Tudo opcional; sem isto o painel abre como sempre.
 */
export interface ValoresIniciaisNegocio {
  pessoaId?: string;
  comercial?: string;
  /** O levantamento já guardado (as linhas, as observações e as respostas das secções da visita); o formulário abre com ele. */
  levantamento?: RascunhoLevantamento;
  /** A aba Visita: o dia, quem fez e o estado do levantamento, e a morada da obra, que vem da visita. */
  visita?: {
    data: string;
    quemFez: string;
    estado: EstadoLevantamento;
    moradaObra: MoradaObraForm;
    /** A morada da visita é a que a lead indicou (só para dizer a origem na aba Qualificação). */
    igualALead: boolean;
    /** HH:MM da visita; falta nas visitas sem hora. */
    hora?: string;
    /** A nota de acesso da visita, se a tinha. */
    nota?: string;
  };
}

/** O que o formulário preenche. */
export interface ValoresNovoNegocio {
  pessoaId: string;
  comercial: string;
}

export type ErroCampo = "obrigatorio" | "comprido" | "invalido";
export type ErrosNovoNegocio = Partial<Record<"pessoaId" | "email" | "nif" | "nifEmpresa" | "codigoPostal", ErroCampo>>
  & ErrosLevantamento;

export type AbaNovoNegocio = "geral" | "qualificacao" | "visita";

/** Que abas têm erros (para o aviso na aba): a Geral os campos do negócio, a Qualificação a morada, a Visita o levantamento. */
export function abasComErros(erros: ErrosNovoNegocio): Record<AbaNovoNegocio, boolean> {
  return {
    geral: (["pessoaId", "email", "nif", "nifEmpresa"] as const).some((c) => !!erros[c]),
    qualificacao: !!erros.codigoPostal,
    visita: !!erros.levantamento || !!erros.linhas,
  };
}

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_NIF = /^\d{9}$/;

/**
 * A Pessoa é obrigatória; o contacto só valida o formato do que foi preenchido. O levantamento valida-se em
 * `validarLevantamento`; vazio quando está tudo certo.
 */
export function validarNovoNegocio(
  valores: Pick<ValoresNovoNegocio, "pessoaId"> & {
    contacto?: Partial<DadosContactoNegocio>;
    levantamento?: LevantamentoForm;
    moradaObra?: Pick<MoradaObraForm, "codigoPostal">;
  },
): ErrosNovoNegocio {
  const erros: ErrosNovoNegocio = { ...validarLevantamento(valores.levantamento) };
  if (valores.moradaObra && validarCodigoPostal(valores.moradaObra.codigoPostal)) erros.codigoPostal = "invalido";
  if (!valores.pessoaId?.trim()) erros.pessoaId = "obrigatorio";
  // O contacto é opcional: só se valida o formato do que foi preenchido.
  const email = valores.contacto?.email?.trim();
  if (email && !FORMATO_EMAIL.test(email)) erros.email = "invalido";
  const nif = valores.contacto?.nif?.trim();
  if (nif && !FORMATO_NIF.test(nif)) erros.nif = "invalido";
  const nifEmpresa = valores.contacto?.nifEmpresa?.trim();
  if (nifEmpresa && !FORMATO_NIF.test(nifEmpresa)) erros.nifEmpresa = "invalido";
  return erros;
}

const ORDEM_GERAL = ["pessoaId", "email", "nif", "nifEmpresa"] as const;
const CAMPO_GERAL: Record<(typeof ORDEM_GERAL)[number], string> = {
  pessoaId: "pessoa", email: "email", nif: "nif", nifEmpresa: "nifEmpresa",
};
const ORDEM_LINHA = ["divisao", "trabalho", "trabalhoOutro", "medida"] as const;

/** Onde pôr o foco depois de um envio recusado: a aba e o fim do id do campo (`<id>-<campo>`); a Geral vem primeiro. */
export function primeiroErro(
  erros: ErrosNovoNegocio, idsLinhas: readonly string[],
): { aba: AbaNovoNegocio; campo: string } | null {
  const geral = ORDEM_GERAL.find((c) => erros[c]);
  if (geral) return { aba: "geral", campo: CAMPO_GERAL[geral] };
  if (erros.codigoPostal) return { aba: "qualificacao", campo: "cp" };
  if (erros.levantamento) return { aba: "visita", campo: "add" };
  for (const linha of idsLinhas) {
    const campo = ORDEM_LINHA.find((c) => erros.linhas?.[linha]?.[c]);
    if (campo) return { aba: "visita", campo: `linha-${linha}-${campo}` };
  }
  return null;
}

/** Soma `dias` a um dia AAAA-MM-DD (em UTC, sem fuso nem horário de verão). */
export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

const aparar = (c: DadosContactoNegocio): DadosContactoNegocio => ({
  email: c.email.trim(), morada: c.morada.trim(), distrito: c.distrito.trim(),
  nif: c.nif.trim(), empresa: c.empresa.trim(), nifEmpresa: c.nifEmpresa.trim(),
});

/** Um negócio criado nesta página: só existe em memória e leva a marca `novo`. */
export type NegocioNovo = NegocioMes & { novo: true };

export interface DadosCriarNegocio {
  pessoa: PessoaOpcao;
  comercial: string;
  contacto?: DadosContactoNegocio;
  levantamento?: LevantamentoNegocio;
  qualificacao?: RespostaNegocio[];
  moradaObra?: MoradaObraNegocio;
  visita?: SeccaoVisitaNegocio[];
  /** As visitas do negócio (já por ordem cronológica); o levantamento em `levantamento` deriva delas. */
  visitas?: VisitaNegocio[];
}

/**
 * O negócio de exemplo (sem serviço: fica vazio): começa em Orçamento (sem orçamentos, por isso sem valor), com 0 dias, não parado e o primeiro
 * prazo daqui a 2 dias. O id é `n-novo-<sequência>`; várias pessoas (e a mesma) podem ter vários negócios.
 */
export function criarNegocioExemplo(dados: DadosCriarNegocio, hoje: string, sequencia: number): NegocioNovo {
  return {
    id: `n-novo-${sequencia}`,
    pessoaId: dados.pessoa.id,
    pessoa: dados.pessoa.nome,
    servico: "",
    comercial: dados.comercial,
    dias: 0,
    parado: 0,
    proximoPrazo: somarDias(hoje, DIAS_ATE_PRIMEIRO_PRAZO),
    contacto: dados.pessoa.contacto ?? { telefone: null, email: null },
    ...(dados.contacto ? { dadosContacto: aparar(dados.contacto) } : {}),
    ...(temLevantamento(dados.levantamento) ? { levantamento: dados.levantamento } : {}),
    ...(dados.qualificacao?.length ? { qualificacao: dados.qualificacao } : {}),
    ...(temMorada(dados.moradaObra) ? { moradaObra: moradaAparada(dados.moradaObra) } : {}),
    ...(dados.visita?.length ? { visita: dados.visita } : {}),
    ...(dados.visitas?.length ? { visitas: dados.visitas } : {}),
    orcamentos: [],
    proposta: null,
    contrato: null,
    novo: true,
  };
}
