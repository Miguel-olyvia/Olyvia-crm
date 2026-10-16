// As condições da proposta (validade, prazo de execução, início, pagamento, garantia e notas): o formulário em texto, a validação e a
// conversão para o que o negócio guarda. Funções puras: o dia de hoje chega por parâmetro.
import { CATALOGO } from "./catalogoTrabalhos";
import type { LinhaTrabalho } from "./orcamentoCalculo";

export const VALIDADES = [15, 30, 60] as const;
export const PAGAMENTOS = ["adjudicacao", "metade", "tres", "fases"] as const;
export const GARANTIAS = [1, 2, 5] as const;
const PRAZO_MINIMO = 1;
const PRAZO_MAXIMO = 60;
export const MAX_NOTAS_PROPOSTA = 140;

/** Dias úteis de obra por unidade de mão de obra, para sugerir o prazo, e o prazo mais curto que se sugere. */
const DIAS_POR_UNIDADE = 0.4;
const PRAZO_SUGERIDO_MINIMO = 5;

type ChavePagamento = (typeof PAGAMENTOS)[number];

/** Tal como está no formulário: tudo texto. */
export interface CondicoesForm {
  validade: string;
  prazo: string;
  inicio: string;
  pagamento: string;
  garantia: string;
  notas: string;
}

/** O que o negócio guarda depois de enviar a proposta. */
export interface CondicoesProposta {
  /** Dias de validade. */
  validade: (typeof VALIDADES)[number];
  /** Dias úteis. */
  prazo: number;
  /** AAAA-MM-DD. */
  inicio: string;
  pagamento: ChavePagamento;
  /** Anos. */
  garantia: (typeof GARANTIAS)[number];
  notas: string;
}

export type ErroCondicao = "obrigatorio" | "invalido" | "passado" | "comprido";
export type ErrosCondicoes = Partial<Record<keyof CondicoesForm, ErroCondicao>>;

/** O prazo sugerido pela mão de obra do orçamento: 0,4 dias úteis por unidade, entre 5 e 60. */
function prazoSugerido(linhas: readonly LinhaTrabalho[]): number {
  const maoDeObra = linhas.reduce((soma, l) => soma + (CATALOGO[l.trabalho].tipo === "maoDeObra" ? l.quantidade : 0), 0);
  return Math.min(PRAZO_MAXIMO, Math.max(PRAZO_SUGERIDO_MINIMO, Math.round(maoDeObra * DIAS_POR_UNIDADE)));
}

/** O formulário abre com os valores habituais e o prazo sugerido; o início fica por escolher. */
export function condicoesIniciais(linhas: readonly LinhaTrabalho[]): CondicoesForm {
  return { validade: "30", prazo: String(prazoSugerido(linhas)), inicio: "", pagamento: "metade", garantia: "2", notas: "" };
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Um dia AAAA-MM-DD que existe no calendário (2026-13-45 não existe). */
function diaValido(texto: string): boolean {
  const m = DIA.exec(texto);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(a, mes - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === mes - 1 && data.getUTCDate() === d;
}

const escolha = (valor: string, opcoes: readonly (string | number)[]): ErroCondicao | undefined =>
  valor === "" ? "obrigatorio" : opcoes.map(String).includes(valor) ? undefined : "invalido";

function erroDoPrazo(texto: string): ErroCondicao | undefined {
  const prazo = texto.trim();
  if (prazo === "") return "obrigatorio";
  const n = Number(prazo);
  return /^\d+$/.test(prazo) && n >= PRAZO_MINIMO && n <= PRAZO_MAXIMO ? undefined : "invalido";
}

function erroDoInicio(inicio: string, hoje: string): ErroCondicao | undefined {
  if (inicio === "") return "obrigatorio";
  if (!diaValido(inicio)) return "invalido";
  return inicio < hoje ? "passado" : undefined;
}

/** Os erros, por campo (as notas são as únicas opcionais); `{}` quando estão completas. */
export function validarCondicoes(f: CondicoesForm, hoje: string): ErrosCondicoes {
  const erros: ErrosCondicoes = {
    validade: escolha(f.validade, VALIDADES), prazo: erroDoPrazo(f.prazo), inicio: erroDoInicio(f.inicio, hoje),
    pagamento: escolha(f.pagamento, PAGAMENTOS), garantia: escolha(f.garantia, GARANTIAS),
    notas: f.notas.trim().length > MAX_NOTAS_PROPOSTA ? "comprido" : undefined,
  };
  return Object.fromEntries(Object.entries(erros).filter(([, erro]) => erro !== undefined)) as ErrosCondicoes;
}

/** Converte condições JÁ validadas (ver `validarCondicoes`) no que o negócio guarda. */
export function paraCondicoes(f: CondicoesForm): CondicoesProposta {
  return {
    validade: Number(f.validade) as CondicoesProposta["validade"], prazo: Number(f.prazo.trim()), inicio: f.inicio,
    pagamento: f.pagamento as ChavePagamento, garantia: Number(f.garantia) as CondicoesProposta["garantia"], notas: f.notas.trim(),
  };
}
