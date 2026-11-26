/**
 * A conta de cada mês de um ativo e de quem a paga, a MESMA para o RH (o custo da pessoa) e para os Ativos (desenho v4, secção 2),
 * para nunca darem números diferentes. Puro: sem dados de lado nenhum, o «hoje» entra por argumento.
 *
 *  - Comprado: a quota de amortização do mês = amortizado até ao mês - amortizado até ao mês anterior (a soma das quotas é sempre
 *    exatamente compra - residual).
 *  - Alugado: a renda mensal INTEIRA em cada mês que o contrato toca (também no primeiro e no último), até à desativação.
 *  - De quem é o mês: de quem tem o equipamento no dia de referência D(M) (o último dia do mês, ou hoje no mês a decorrer, ou o fim do
 *    aluguer, ou a desativação, o que vier primeiro). O dia da devolução conta como dia com o equipamento. Mês inteiro de uma só
 *    pessoa; se ninguém o tem em D(M), o mês é da estrutura.
 *
 * A amortização repete a de `valorAtivo.ts` (`valorAtual`): o amortizado é a compra menos o valor atual.
 */
import { somarMesesAoMes } from "@/components/rh-exemplo/lib/comoConta";
import { arredondar, indiceDoMes, mesDaData, type MesIso } from "@/components/rh-exemplo/lib/custo";
import { valorAtual } from "./valorAtivo";

/** O que a conta precisa de um ativo comprado (os nomes dos campos de `Ativo`, para se poder passar um `Ativo` inteiro). */
export interface AtivoCompradoConta {
  forma: "comprado";
  valorCompra: number;
  valorResidual: number;
  dataCompra: string;
  vidaMeses: number | null;
  desativadoEm: string | null;
}

/** O que a conta precisa de um ativo alugado. */
export interface AtivoAlugadoConta {
  forma: "alugado";
  rendaMensal: number;
  inicioAluguer: string;
  fimAluguer: string | null;
  desativadoEm: string | null;
}

export type AtivoParaConta = AtivoCompradoConta | AtivoAlugadoConta;

/**
 * Uma ocupação (a linha de `pessoas_equipamentos` do ativo). `contaDesde` é o que a base devolve em `conta_desde`: a entrega, ou o
 * dia seguinte se outra ocupação do mesmo ativo foi devolvida no dia desta entrega (nesse dia ganha quem devolve).
 */
export interface OcupacaoParaConta {
  contaDesde: string;
  devolucao: string | null;
}

/** O último dia de um mês («AAAA-MM»), como «AAAA-MM-DD». */
export function ultimoDiaDoMes(mes: MesIso): string {
  const [ano, m] = mes.split("-").map(Number);
  const dia = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

const primeiroDiaDoMes = (mes: MesIso): string => `${mes}-01`;

/**
 * O dia de referência do mês M: o mais cedo entre o último dia de M, hoje (se M é o mês a decorrer), o fim do aluguer (alugado) e a
 * desativação. É o dia em que se vê quem tem o equipamento.
 */
export function diaDeReferencia(a: AtivoParaConta, mes: MesIso, hoje: string): string {
  const fim = ultimoDiaDoMes(mes);
  let dia = mesDaData(hoje) === mes && hoje < fim ? hoje : fim;
  if (a.forma === "alugado" && a.fimAluguer !== null && a.fimAluguer < dia) dia = a.fimAluguer;
  if (a.desativadoEm !== null && a.desativadoEm < dia) dia = a.desativadoEm;
  return dia;
}

/** A ocupação paga o mês M? Sim se cobre o dia de referência, o da devolução incluído. */
export function donoDoMes(o: OcupacaoParaConta, a: AtivoParaConta, mes: MesIso, hoje: string): boolean {
  const dia = diaDeReferencia(a, mes, hoje);
  return o.contaDesde <= dia && dia <= (o.devolucao ?? dia);
}

/** Os meses já contados do comprado até ao mês `mes` (o mês da compra já conta), limitados à vida e à desativação. */
export function mesesDecorridos(a: AtivoCompradoConta, mes: MesIso): number {
  if (a.vidaMeses === null || a.vidaMeses <= 0) return 0;
  const inicio = indiceDoMes(mesDaData(a.dataCompra));
  const ultimo = a.desativadoEm ? Math.min(inicio + a.vidaMeses - 1, indiceDoMes(mesDaData(a.desativadoEm))) : inicio + a.vidaMeses - 1;
  return Math.max(0, Math.min(indiceDoMes(mes), ultimo) - inicio + 1);
}

/** O que já se amortizou até ao mês `mes`, inclusive (compra - valor atual); 0 sem vida em meses. */
export function amortizadoAte(a: AtivoCompradoConta, mes: MesIso): number {
  const atual = valorAtual(a, mes);
  return atual === null ? 0 : arredondar(a.valorCompra - atual);
}

/** A quota de amortização do mês: o amortizado até ao mês menos o amortizado até ao mês anterior. */
export function quotaDoMes(a: AtivoCompradoConta, mes: MesIso): number {
  return arredondar(amortizadoAte(a, mes) - amortizadoAte(a, somarMesesAoMes(mes, -1)));
}

/** A renda do mês: inteira se o contrato toca o mês (e o ativo não foi desativado antes dele), senão 0. */
export function rendaDoMes(a: AtivoAlugadoConta, mes: MesIso): number {
  if (a.inicioAluguer > ultimoDiaDoMes(mes)) return 0;
  if (a.fimAluguer !== null && a.fimAluguer < primeiroDiaDoMes(mes)) return 0;
  if (a.desativadoEm !== null && a.desativadoEm < primeiroDiaDoMes(mes)) return 0;
  return arredondar(a.rendaMensal);
}

/** O que o ativo custa no mês (a quota ou a renda), de quem for o mês. */
export const valorDoAtivoNoMes = (a: AtivoParaConta, mes: MesIso): number => (a.forma === "comprado" ? quotaDoMes(a, mes) : rendaDoMes(a, mes));
