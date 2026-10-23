// Os tipos e os formatos comuns dos dois dashboards (Pessoas e Negócios V2). Só dados e funções puras: nada aqui toca no Estado.
import { eur } from "./motor";

/** Uma barra (ou fatia) de um gráfico. `acao` é o que acontece ao carregar nela; sem `acao` a barra é só texto. */
export interface BarraG<A> {
  id: string;
  rotulo: string;
  n: number;
  /** Valor em euros que a barra soma (só nos gráficos de Negócios). */
  euros?: number;
  acao?: A;
}

/** Um cartão de métrica. `acao` ausente: o cartão é só informação. */
export interface CartaoG<A> {
  id: string;
  rotulo: string;
  valor: number;
  /** O valor é dinheiro (mostra-se com o símbolo do euro). */
  euros?: boolean;
  /** O valor é uma percentagem (mostra-se com %). */
  pct?: boolean;
  /** Uma linha pequena por baixo do número (por exemplo "3 ganhos e 2 perdidos"). */
  nota?: string;
  acao?: A;
  /** O que o botão faz, para quem usa leitor de ecrã, a dizer o filtro e o resultado (por exemplo "Filtrar por Leads ativas: 14 pessoas"). */
  acaoRotulo?: string;
}

/** "29 %": a parte de um total, arredondada; 0 quando o total é 0. */
export const pct = (n: number, total: number): number => (total > 0 ? Math.round((100 * n) / total) : 0);

export const pctTexto = (n: number, total: number): string => `${pct(n, total)} %`;

/** "1.234 €" sem os cêntimos quando são zero (a mesma regra da página de Negócios). */
export const eur0 = (x: number): string => eur(x).replace(/,00$/, "");
export const eurosTexto = (x: number): string => `${eur0(x)} €`;

/** O valor de um cartão em texto: um número, dinheiro ou uma percentagem. */
export const valorCartao = (c: Pick<CartaoG<unknown>, "valor" | "euros" | "pct">): string => (c.euros ? eurosTexto(c.valor) : c.pct ? `${c.valor} %` : String(c.valor));

/** Os mais numerosos primeiro; em empate, pelo nome (ordem portuguesa). */
export function porNumero<T extends { n: number; rotulo: string }>(l: readonly T[]): T[] {
  return [...l].sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, "pt"));
}

/** Conta quantos itens há por chave, sem ordem. */
export function contarPor<T>(itens: readonly T[], chave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of itens) { const k = chave(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return m;
}

/** "Site 4 (29 %), Meta Ads 3 (21 %)": o resumo de um gráfico para quem usa leitor de ecrã. */
export function resumoBarras<A>(barras: readonly BarraG<A>[], total: number): string {
  return barras.length ? barras.map((b) => `${b.rotulo} ${b.n} (${pctTexto(b.n, total)})`).join(", ") : "Sem dados";
}
