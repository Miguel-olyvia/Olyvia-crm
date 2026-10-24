/**
 * «Como conta» um valor no custo (fluxo 11): contas puras, sem dados de lado nenhum. Serve os equipamentos e os valores avulsos.
 *
 *  - «Pago de uma vez»: o valor todo conta no mês da entrega (ou da data).
 *  - «Repartido por N meses»: valor / N por mês, a partir do mês da entrega (ou da data), até completar os N meses ou até ao
 *    mês da devolução (inclusive). N vai de 1 a 120; por omissão 36 nos equipamentos. N = 1 equivale a «pago de uma vez».
 *  - «Todos os meses»: o valor é mensal e repete-se do mês de início até ao mês de fim (sem fim = continua), ou até à devolução.
 *
 * Nenhuma regra salta de mês sozinha: um valor conta no mês da sua data, nunca noutro. Nada disto entra no bruto do
 * processamento salarial. Os resultados em euros arredondam-se ao cêntimo; no último mês de um repartido fica o resto, por
 * isso a soma dos meses é sempre exatamente o valor.
 */
import { arredondar, indiceDoMes, mesDaData, type MesIso } from "./custo";

export const COMO_CONTA = ["umaVez", "repartido", "todosMeses"] as const;
export type ComoConta = (typeof COMO_CONTA)[number];

export const MESES_POR_OMISSAO = 36;
export const MESES_MINIMO = 1;
export const MESES_MAXIMO = 120;

export interface ContaItem {
  modo: ComoConta;
  /** Só no «repartido»: em quantos meses se reparte (1 a 120). */
  meses: number;
  /** Só no «todos os meses»: o primeiro mês (nos outros modos conta o mês da data). */
  inicio: MesIso | null;
  /** Só no «todos os meses»: o último mês; `null` = continua. */
  fim: MesIso | null;
}

export type ErroConta = "mesesInvalidos" | "semInicio" | "fimAntesInicio";

const ERROS_CONTA: readonly string[] = ["mesesInvalidos", "semInicio", "fimAntesInicio"];
/** Distingue um erro da conta (que se mostra junto do campo «Como conta») dos erros do resto do formulário. */
export const ehErroConta = (erro: string | null): erro is ErroConta => erro !== null && ERROS_CONTA.includes(erro);

export const contaUmaVez =(): ContaItem => ({ modo: "umaVez", meses: 1, inicio: null, fim: null });
export const contaRepartida = (meses: number = MESES_POR_OMISSAO): ContaItem => ({ modo: "repartido", meses, inicio: null, fim: null });
export const contaTodosMeses = (inicio: MesIso, fim: MesIso | null = null): ContaItem => ({ modo: "todosMeses", meses: 1, inicio, fim });

/** O que se conta: um valor, a data de que parte (entrega ou data) e, se houver, a devolução. */
export interface ItemParaConta {
  valor: number;
  data: string;
  conta: ContaItem;
  devolucao: string | null;
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const numeroDeMeses = (c: ContaItem): number =>
  c.modo === "umaVez" ? 1 : Math.min(MESES_MAXIMO, Math.max(MESES_MINIMO, Math.round(c.meses) || MESES_MINIMO));

/** Deixa só o que o modo usa (um «pago de uma vez» não leva meses nem fim), para não ficarem restos de um modo anterior. */
export function normalizarConta(c: ContaItem): ContaItem {
  if (c.modo === "umaVez") return contaUmaVez();
  if (c.modo === "repartido") return contaRepartida(numeroDeMeses(c));
  return contaTodosMeses(c.inicio ?? "", c.fim === "" ? null : c.fim);
}

export function validarConta(c: ContaItem): ErroConta | null {
  if (c.modo === "repartido" && !(Number.isInteger(c.meses) && c.meses >= MESES_MINIMO && c.meses <= MESES_MAXIMO)) return "mesesInvalidos";
  if (c.modo !== "todosMeses") return null;
  if (c.inicio === null || !MES.test(c.inicio)) return "semInicio";
  if (c.fim !== null && (!MES.test(c.fim) || c.fim < c.inicio)) return "fimAntesInicio";
  return null;
}

/** O primeiro mês em que o valor conta. */
export const primeiroMes = (i: ItemParaConta): MesIso => (i.conta.modo === "todosMeses" && i.conta.inicio ? i.conta.inicio : mesDaData(i.data));

/** O mês em que se soma `n` meses a `mes` (n pode ser 0). */
export function somarMesesAoMes(mes: MesIso, n: number): MesIso {
  const indice = indiceDoMes(mes) + n;
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, "0")}`;
}

/** O índice do último mês que conta (a devolução corta); `Infinity` se não tem fim. */
function ultimoIndice(i: ItemParaConta): number {
  const inicio = indiceDoMes(primeiroMes(i));
  const { modo, fim } = i.conta;
  const ultimo = modo === "umaVez" ? inicio : modo === "repartido" ? inicio + numeroDeMeses(i.conta) - 1 : fim ? indiceDoMes(fim) : Infinity;
  return i.devolucao ? Math.min(ultimo, indiceDoMes(mesDaData(i.devolucao))) : ultimo;
}

export const quotaMensal = (valor: number, n: number): number => arredondar(valor / n);

/** Quanto conta este valor no mês `mes` («AAAA-MM»): 0 fora do período. */
export function valorNoMes(i: ItemParaConta, mes: MesIso): number {
  const inicio = indiceDoMes(primeiroMes(i));
  const agora = indiceDoMes(mes);
  if (agora < inicio || agora > ultimoIndice(i)) return 0;
  if (i.conta.modo !== "repartido") return arredondar(i.valor);
  const n = numeroDeMeses(i.conta);
  return agora - inicio === n - 1 ? arredondar(i.valor - quotaMensal(i.valor, n) * (n - 1)) : quotaMensal(i.valor, n);
}

export interface SituacaoConta {
  /** O que conta no mês pedido. */
  doMes: number;
  /** O que já contou, até ao mês pedido inclusive. */
  contado: number;
  /** O que falta contar (0 se está tudo contado ou se foi devolvido); `null` no «todos os meses», que não tem total. */
  falta: number | null;
  mesesContados: number;
  /** Meses que faltam contar; `null` no «todos os meses». */
  mesesFalta: number | null;
  /** Já contou tudo (não se aplica ao «todos os meses», nem a um item devolvido a meio). */
  completo: boolean;
}

function contadoAte(i: ItemParaConta, meses: number): number {
  const n = numeroDeMeses(i.conta);
  if (i.conta.modo === "todosMeses") return arredondar(i.valor * meses);
  if (i.conta.modo === "umaVez") return meses >= 1 ? arredondar(i.valor) : 0;
  return meses >= n ? arredondar(i.valor) : arredondar(quotaMensal(i.valor, n) * meses);
}

export function situacaoDoItem(i: ItemParaConta, mes: MesIso): SituacaoConta {
  const inicio = indiceDoMes(primeiroMes(i));
  const agora = indiceDoMes(mes);
  const mesesContados = Math.max(0, Math.min(agora, ultimoIndice(i)) - inicio + 1);
  const base = { doMes: valorNoMes(i, mes), contado: contadoAte(i, mesesContados), mesesContados };
  if (i.conta.modo === "todosMeses") return { ...base, falta: null, mesesFalta: null, completo: false };
  const n = numeroDeMeses(i.conta);
  const devolvido = i.devolucao !== null && agora >= indiceDoMes(mesDaData(i.devolucao));
  const passados = Math.max(0, Math.min(n, agora - inicio + 1));
  return {
    ...base,
    falta: devolvido ? 0 : arredondar(i.valor - base.contado),
    mesesFalta: devolvido ? 0 : n - passados,
    completo: !devolvido && passados >= n,
  };
}

export type ChaveFrase = "umaVez" | "repartidoDevolucao" | "repartidoFim" | "todosMeses" | "todosMesesFim" | "todosMesesDevolucao";

export interface FraseConta {
  chave: ChaveFrase;
  valor: number;
  n: number;
  quota: number;
  inicio: MesIso;
  fim: MesIso | null;
}

/**
 * O efeito calculado, em dados (o texto traduz-se no ecrã): «900 € repartidos por 36 meses = 25 € por mês, de novembro de
 * 2026 …». `comDevolucao` diz se o valor acaba também com a devolução (equipamentos).
 */
export function fraseDaConta(i: ItemParaConta, comDevolucao: boolean): FraseConta {
  const inicio = primeiroMes(i);
  const n = numeroDeMeses(i.conta);
  const base = { valor: i.valor, n, quota: quotaMensal(i.valor, n), inicio, fim: null };
  if (i.conta.modo === "umaVez" || (i.conta.modo === "repartido" && n === 1)) return { ...base, chave: "umaVez" };
  if (i.conta.modo === "repartido") {
    return comDevolucao ? { ...base, chave: "repartidoDevolucao" } : { ...base, chave: "repartidoFim", fim: somarMesesAoMes(inicio, n - 1) };
  }
  if (i.conta.fim) return { ...base, chave: "todosMesesFim", fim: i.conta.fim };
  return { ...base, chave: comDevolucao ? "todosMesesDevolucao" : "todosMeses" };
}
