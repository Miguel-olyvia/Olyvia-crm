// Lógica pura do botão "Novo negócio": o que o formulário pede, a validação e o negócio de exemplo que sai dele. Nada
// aqui grava nem lê o relógio: o dia de hoje e o número de série chegam por parâmetro.
import type { NegocioMes } from "./negocioMetas";
import { DADOS_EXEMPLO } from "./negocioMetasExemplo";

/** Uma pessoa a escolher no formulário. A página monta a lista (Negócio e metas não importa de Pessoas). */
export interface PessoaOpcao {
  id: string;
  nome: string;
  contacto?: { telefone: string | null; email: string | null };
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

export type ErroCampo = "obrigatorio" | "comprido";
export type ErrosNovoNegocio = Partial<Record<"pessoaId" | "servico", ErroCampo>>;

/** Pessoa e Serviço são obrigatórios (o serviço sem espaços à volta e com um máximo); vazio quando está tudo certo. */
export function validarNovoNegocio(valores: Pick<ValoresNovoNegocio, "pessoaId" | "servico">): ErrosNovoNegocio {
  const erros: ErrosNovoNegocio = {};
  if (!valores.pessoaId?.trim()) erros.pessoaId = "obrigatorio";
  const servico = (valores.servico ?? "").trim();
  if (!servico) erros.servico = "obrigatorio";
  else if (servico.length > MAX_SERVICO) erros.servico = "comprido";
  return erros;
}

/** Soma `dias` a um dia AAAA-MM-DD (em UTC, sem fuso nem horário de verão). */
export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Um negócio criado nesta página: só existe em memória e leva a marca `novo`. */
export type NegocioNovo = NegocioMes & { novo: true };

export interface DadosCriarNegocio {
  pessoa: PessoaOpcao;
  servico: string;
  comercial: string;
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
    orcamentos: [],
    proposta: null,
    contrato: null,
    novo: true,
  };
}
