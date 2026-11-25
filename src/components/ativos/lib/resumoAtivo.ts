/**
 * O que o ecrã de ativos mostra de relance, sem desenho: os totais do separador, a etiqueta de estado, a regra de depreciação em
 * frase e a vida restante. Tudo parte de `valorAtual` (a mesma conta do detalhe), por isso a soma das linhas bate com o total. A fase 1
 * não tem uso: nada aqui diz que um ativo está «parado».
 */
import { arredondar, indiceDoMes, mesDaData, type MesIso } from "@/components/rh-exemplo/lib/custo";
import { somarMesesAoMes } from "@/components/rh-exemplo/lib/comoConta";
import type { Ativo } from "./tipos";
import { depreciacaoMensal, valorAtual, vidaEfetivaMeses } from "./valorAtivo";

export interface TotaisAtivos {
  /** Os ativos em uso (os desativados ficam de fora). */
  quantidade: number;
  valorCompra: number;
  /** A soma do valor atual dos que depreciam no tempo. */
  valorAtual: number;
  /** Quantos em uso não têm valor atual (só vida em horas, ou modelo sem vida): contam na quantidade e na compra, não aqui. */
  semValorAtual: number;
}

export function totaisAtivos(lista: readonly Ativo[], mes: MesIso): TotaisAtivos {
  let valorCompra = 0;
  let atual = 0;
  let semValorAtual = 0;
  let quantidade = 0;
  for (const a of lista) {
    if (a.estado !== "ativo") continue;
    quantidade += 1;
    valorCompra += a.valorCompra;
    const v = valorAtual(a, mes);
    if (v === null) semValorAtual += 1;
    else atual += v;
  }
  return { quantidade, valorCompra: arredondar(valorCompra), valorAtual: arredondar(atual), semValorAtual };
}

export type ChaveEstado = "emUso" | "desativado" | "semEquipamento" | "semPessoa";
export type TomEstado = "bom" | "neutro" | "aviso";

export interface EstadoDoAtivo {
  chave: ChaveEstado;
  tom: TomEstado;
}

/**
 * A etiqueta de relance: «Em uso», «Desativado» e, quando falta a ligação, «Sem equipamento ligado» (serviço) ou «Sem pessoa ligada»
 * (pessoa). A ligação de uma pessoa lê-se da chave `ligado` da base, que vem mesmo sem permissão do RH (e mesmo que a pessoa já tenha
 * sido apagada): nunca se diz «Sem pessoa ligada» de um ativo que está atribuído.
 */
export function estadoDoAtivo(a: Ativo): EstadoDoAtivo {
  if (a.estado === "desativado") return { chave: "desativado", tom: "neutro" };
  if (a.grupo === "servico" && (!a.catEquipamentoId || !a.catEquipamento)) return { chave: "semEquipamento", tom: "aviso" };
  if (a.grupo === "pessoa" && !a.ligado) return { chave: "semPessoa", tom: "aviso" };
  return { chave: "emUso", tom: "bom" };
}

/** «2030-03» -> «03/2030». */
export const mesPt = (mes: MesIso): string => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

export type MotivoSemValor = "porUso" | "semVida";

/**
 * Porque não há valor atual: «por uso» só quando o modelo tem vida em HORAS; um ativo sem vida em meses e sem modelo com vida
 * (ou sem modelo lido) está «sem vida definida». `null` quando há vida em meses.
 */
export function motivoSemValor(a: Ativo): MotivoSemValor | null {
  if (vidaEfetivaMeses(a) !== null) return null;
  return a.catEquipamento?.vidaHoras ? "porUso" : "semVida";
}

export type FraseDepreciacao =
  | { chave: "porUso" }
  | { chave: "semVida" }
  | { chave: "semPerda" }
  | { chave: "desativada"; fim: string; valor: number }
  | { chave: "aindaNaoComeca"; inicio: string }
  | { chave: "completa"; valor: number }
  | { chave: "perdePouco"; fim: string }
  | { chave: "perdePorMes"; valor: number; fim: string };

/**
 * A regra de depreciação em dados (o texto traduz-se no ecrã): «perde 10,67 € por mês até 02/2030», «não perde valor» (residual igual
 * à compra), «por uso, sem depreciação no tempo». O mês em que se lê é `mes`. Nunca diz «perde 0,00 €».
 */
export function fraseDepreciacao(a: Ativo, mes: MesIso): FraseDepreciacao {
  const vida = vidaEfetivaMeses(a);
  const atual = valorAtual(a, mes);
  if (vida === null || atual === null) return { chave: motivoSemValor(a) ?? "semVida" };
  if (a.desativadoEm) return { chave: "desativada", fim: mesPt(mesDaData(a.desativadoEm)), valor: atual };
  if (a.valorCompra - a.valorResidual <= 0) return { chave: "semPerda" };
  const inicio = mesDaData(a.dataCompra);
  if (indiceDoMes(mes) < indiceDoMes(inicio)) return { chave: "aindaNaoComeca", inicio: mesPt(inicio) };
  const ultimo = somarMesesAoMes(inicio, vida - 1);
  if (indiceDoMes(mes) > indiceDoMes(ultimo)) return { chave: "completa", valor: atual };
  const quota = depreciacaoMensal(a) ?? 0;
  return quota < 0.01 ? { chave: "perdePouco", fim: mesPt(ultimo) } : { chave: "perdePorMes", valor: quota, fim: mesPt(ultimo) };
}

export interface VidaRestante {
  /** Meses que ainda faltam depreciar a partir do mês `mes` (0 no último mês e depois dele). */
  meses: number;
  /** O mês da última quota («MM/AAAA»). */
  fim: string;
  /** O último mês já passou. */
  acabou: boolean;
}

/** A vida que resta e quando acaba de depreciar. `null` quando não há vida em meses ou o ativo está desativado. */
export function vidaRestante(a: Ativo, mes: MesIso): VidaRestante | null {
  const vida = vidaEfetivaMeses(a);
  if (vida === null || a.estado === "desativado") return null;
  const inicio = mesDaData(a.dataCompra);
  const ultimo = somarMesesAoMes(inicio, vida - 1);
  const restantes = indiceDoMes(ultimo) - Math.max(indiceDoMes(mes), indiceDoMes(inicio) - 1);
  return { meses: Math.max(0, restantes), fim: mesPt(ultimo), acabou: indiceDoMes(mes) > indiceDoMes(ultimo) };
}
