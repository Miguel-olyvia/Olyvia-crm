/**
 * O que o ecrã de ativos mostra de relance, sem desenho: os totais do separador, a etiqueta de estado e a regra de depreciação
 * em frase. Tudo parte de `valorAtual` (a mesma conta do detalhe), por isso a soma das linhas bate com o total. A fase 1 não tem
 * uso: nada aqui diz que um ativo está «parado».
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
  /** Quantos em uso não têm valor atual (só vida em horas): contam na quantidade e na compra, não aqui. */
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
 * (pessoa). Com o RH oculto não se sabe quem tem o ativo de pessoa, por isso não se acusa a falta.
 */
export function estadoDoAtivo(a: Ativo, rhOculto: boolean): EstadoDoAtivo {
  if (a.estado === "desativado") return { chave: "desativado", tom: "neutro" };
  if (a.grupo === "servico" && (!a.catEquipamentoId || !a.catEquipamento)) return { chave: "semEquipamento", tom: "aviso" };
  if (a.grupo === "pessoa" && !rhOculto && !a.atribuicao) return { chave: "semPessoa", tom: "aviso" };
  return { chave: "emUso", tom: "bom" };
}

/** «2030-03» -> «03/2030». */
export const mesPt = (mes: MesIso): string => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

export type FraseDepreciacao =
  | { chave: "porUso" }
  | { chave: "desativada"; fim: string; valor: number }
  | { chave: "aindaNaoComeca"; inicio: string }
  | { chave: "completa"; valor: number }
  | { chave: "perdePorMes"; valor: number; fim: string };

/**
 * A regra de depreciação em dados (o texto traduz-se no ecrã): «perde 10,67 € por mês até 02/2030», «por uso, sem depreciação no
 * tempo», «deixou de depreciar em 04/2026». O mês em que se lê é `mes`.
 */
export function fraseDepreciacao(a: Ativo, mes: MesIso): FraseDepreciacao {
  const vida = vidaEfetivaMeses(a);
  const atual = valorAtual(a, mes);
  if (vida === null || atual === null) return { chave: "porUso" };
  if (a.desativadoEm) return { chave: "desativada", fim: mesPt(mesDaData(a.desativadoEm)), valor: atual };
  const inicio = mesDaData(a.dataCompra);
  if (indiceDoMes(mes) < indiceDoMes(inicio)) return { chave: "aindaNaoComeca", inicio: mesPt(inicio) };
  const ultimo = somarMesesAoMes(inicio, vida - 1);
  if (indiceDoMes(mes) > indiceDoMes(ultimo)) return { chave: "completa", valor: atual };
  return { chave: "perdePorMes", valor: depreciacaoMensal(a) ?? 0, fim: mesPt(ultimo) };
}
