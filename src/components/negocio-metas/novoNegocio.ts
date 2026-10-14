// Lógica pura do botão "Novo negócio": o que o formulário pede, a validação e o negócio de exemplo que sai dele. Nada
// aqui grava nem lê o relógio: o dia de hoje e o número de série chegam por parâmetro.
import type { DadosContactoNegocio, NegocioMes } from "./negocioMetas";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";

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
    nif: pessoa?.nif ?? "",
    empresa: pessoa?.empresa ?? "",
    nifEmpresa: pessoa?.nifEmpresa ?? "",
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

/** Sugestões para o serviço (o campo é texto livre). */
export const SERVICOS_SUGERIDOS: readonly string[] = [
  "Casa de banho", "Cozinha", "Janelas", "Isolamento", "Remodelação total", "Outro",
];

export const MAX_SERVICO = 60;
/** O primeiro prazo de um negócio novo: levantamento daqui a 2 dias. */
export const DIAS_ATE_PRIMEIRO_PRAZO = 2;

/** O que o formulário preenche. */
export interface ValoresNovoNegocio {
  pessoaId: string;
  servico: string;
  comercial: string;
}

export type ErroCampo = "obrigatorio" | "comprido" | "invalido";
export type ErrosNovoNegocio = Partial<Record<"pessoaId" | "servico" | "email" | "nif" | "nifEmpresa", ErroCampo>>;

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATO_NIF = /^\d{9}$/;

/** Pessoa e Serviço são obrigatórios (o serviço sem espaços à volta e com um máximo); vazio quando está tudo certo. */
export function validarNovoNegocio(
  valores: Pick<ValoresNovoNegocio, "pessoaId" | "servico"> & { contacto?: Partial<DadosContactoNegocio> },
): ErrosNovoNegocio {
  const erros: ErrosNovoNegocio = {};
  if (!valores.pessoaId?.trim()) erros.pessoaId = "obrigatorio";
  const servico = (valores.servico ?? "").trim();
  if (!servico) erros.servico = "obrigatorio";
  else if (servico.length > MAX_SERVICO) erros.servico = "comprido";
  // O contacto é opcional: só se valida o formato do que foi preenchido.
  const email = valores.contacto?.email?.trim();
  if (email && !FORMATO_EMAIL.test(email)) erros.email = "invalido";
  const nif = valores.contacto?.nif?.trim();
  if (nif && !FORMATO_NIF.test(nif)) erros.nif = "invalido";
  const nifEmpresa = valores.contacto?.nifEmpresa?.trim();
  if (nifEmpresa && !FORMATO_NIF.test(nifEmpresa)) erros.nifEmpresa = "invalido";
  return erros;
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
  servico: string;
  comercial: string;
  contacto?: DadosContactoNegocio;
}

/**
 * O negócio de exemplo: começa em Orçamento (sem orçamentos, por isso sem valor), com 0 dias, não parado e o primeiro
 * prazo daqui a 2 dias. O id é `n-novo-<sequência>`; várias pessoas (e a mesma) podem ter vários negócios.
 */
export function criarNegocioExemplo(dados: DadosCriarNegocio, hoje: string, sequencia: number): NegocioNovo {
  return {
    id: `n-novo-${sequencia}`,
    pessoaId: dados.pessoa.id,
    pessoa: dados.pessoa.nome,
    servico: dados.servico.trim(),
    comercial: dados.comercial,
    dias: 0,
    parado: 0,
    proximoPrazo: somarDias(hoje, DIAS_ATE_PRIMEIRO_PRAZO),
    contacto: dados.pessoa.contacto ?? { telefone: null, email: null },
    ...(dados.contacto ? { dadosContacto: aparar(dados.contacto) } : {}),
    orcamentos: [],
    proposta: null,
    contrato: null,
    novo: true,
  };
}
