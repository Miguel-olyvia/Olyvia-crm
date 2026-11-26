/**
 * O que o ecrã de Ativos mostra da conta de um ativo, sem desenho: a amortização ao abrir o ativo, quem paga cada mês (cada pessoa e a
 * estrutura), o custo parado de um separador e os avisos de um aluguer esquecido. Puro: o «hoje» e o mês entram por argumento.
 * Parte sempre de `contaAtivo.ts` (a mesma conta do custo da pessoa no RH), por isso os números nunca divergem.
 */
import { somarMesesAoMes } from "@/components/rh-exemplo/lib/comoConta";
import { arredondar, indiceDoMes, mesDaData, type MesIso } from "@/components/rh-exemplo/lib/custo";
import {
  amortizadoAte,
  donoDoMes,
  mesesDecorridos,
  valorDoAtivoNoMes,
  type AtivoAlugadoConta,
  type AtivoCompradoConta,
  type AtivoParaConta,
  type OcupacaoParaConta,
} from "./contaAtivo";
import type { Ativo, OcupacaoDoAtivo } from "./tipos";
import { valorAtual, vidaEfetivaMeses } from "./valorAtivo";

/** O ativo como a conta o quer; `null` se faltam os dados dela (comprado sem compra ou data, alugado sem renda ou início). */
export function contaDoAtivo(a: Ativo): AtivoParaConta | null {
  if (a.forma === "alugado") {
    if (a.rendaMensal === null || a.inicioAluguer === null) return null;
    return { forma: "alugado", rendaMensal: a.rendaMensal, inicioAluguer: a.inicioAluguer, fimAluguer: a.fimAluguer, desativadoEm: a.desativadoEm };
  }
  if (a.valorCompra === null || a.dataCompra === null) return null;
  return {
    forma: "comprado", valorCompra: a.valorCompra, valorResidual: a.valorResidual, dataCompra: a.dataCompra,
    // Um serviço sem vida própria usa a do modelo do catálogo.
    vidaMeses: vidaEfetivaMeses(a), desativadoEm: a.desativadoEm,
  };
}

/** A ocupação como a conta a quer: conta desde `conta_desde` (ou, sem ele, desde a entrega). */
export const ocupacaoParaConta = (o: Pick<OcupacaoDoAtivo, "entrega" | "devolucao" | "contaDesde">): OcupacaoParaConta => ({
  contaDesde: o.contaDesde ?? o.entrega,
  devolucao: o.devolucao,
});

/**
 * O mês da última quota de um comprado: o mês da compra mais a vida menos um, ou o mês da desativação se for antes. `null` sem vida em
 * meses (por uso, ou sem vida definida).
 */
export function fimDaAmortizacao(a: AtivoCompradoConta): MesIso | null {
  if (a.vidaMeses === null || a.vidaMeses <= 0) return null;
  const ultimo = somarMesesAoMes(mesDaData(a.dataCompra), a.vidaMeses - 1);
  if (a.desativadoEm === null) return ultimo;
  const desativado = mesDaData(a.desativadoEm);
  return indiceDoMes(desativado) < indiceDoMes(ultimo) ? desativado : ultimo;
}

export interface ResumoAmortizacao {
  valorCompra: number;
  valorResidual: number;
  /** O que já se amortizou até ao mês, em euros. */
  amortizado: number;
  /** O amortizado sobre o que se pode amortizar (compra menos residual), de 0 a 100, com uma casa decimal. */
  percentagem: number;
  valorAtual: number;
  /** O que falta amortizar, em euros. */
  falta: number;
  mesesDecorridos: number;
  /** Os meses que o ativo chega a amortizar (a vida, ou menos se foi desativado). */
  mesesTotais: number;
  /** O mês da última quota («AAAA-MM»). */
  fim: MesIso;
  /** O mês pedido é depois do último (ou igual): já está totalmente amortizado, ou a amortização parou. */
  concluida: boolean;
}

/** O que se vê ao abrir um comprado: quanto já amortizou desde a compra, quanto vale e quando acaba. `null` sem vida em meses. */
export function resumoAmortizacao(a: AtivoCompradoConta, mes: MesIso): ResumoAmortizacao | null {
  const fim = fimDaAmortizacao(a);
  if (fim === null) return null;
  const atual = valorAtual(a, mes);
  if (atual === null) return null;
  const amortizado = amortizadoAte(a, mes);
  const base = Math.max(0, a.valorCompra - a.valorResidual);
  return {
    valorCompra: a.valorCompra,
    valorResidual: a.valorResidual,
    amortizado,
    percentagem: base <= 0 ? 0 : Math.min(100, Math.round((amortizado / base) * 1000) / 10),
    valorAtual: atual,
    falta: Math.max(0, arredondar(base - amortizado)),
    mesesDecorridos: mesesDecorridos(a, mes),
    mesesTotais: mesesDecorridos(a, fim),
    fim,
    concluida: indiceDoMes(mes) >= indiceDoMes(fim),
  };
}

export interface ParteDoReparto {
  valor: number;
  meses: number;
}

export interface RepartoDoAtivo {
  /** Uma entrada por ocupação, pela mesma ordem de `ocupacoes`. */
  pessoas: ParteDoReparto[];
  /** Os meses em que ninguém tinha o equipamento no dia de referência: custo da estrutura. */
  estrutura: ParteDoReparto;
  total: ParteDoReparto;
}

/** O primeiro mês com custo e o último até `ate`; `null` se o ativo ainda não começou ou já não custa nada. */
function intervaloComCusto(a: AtivoParaConta, ate: MesIso): [MesIso, MesIso] | null {
  let primeiro: MesIso;
  let ultimo: MesIso = ate;
  if (a.forma === "comprado") {
    primeiro = mesDaData(a.dataCompra);
    const fim = fimDaAmortizacao(a);
    if (fim === null) return null;
    if (indiceDoMes(fim) < indiceDoMes(ultimo)) ultimo = fim;
  } else {
    primeiro = mesDaData(a.inicioAluguer);
    const paragem = [a.fimAluguer, a.desativadoEm].filter((d): d is string => d !== null).sort()[0];
    if (paragem && indiceDoMes(mesDaData(paragem)) < indiceDoMes(ultimo)) ultimo = mesDaData(paragem);
  }
  return indiceDoMes(primeiro) > indiceDoMes(ultimo) ? null : [primeiro, ultimo];
}

/**
 * De quem foi cada mês de um ativo até `ate`, inclusive: de quem o tem no dia de referência do mês (o dia da devolução conta), e da
 * estrutura se ninguém o tem. Mês inteiro de uma só pessoa. Com `ate` no fim da vida (ou do contrato) dá o total: 1 200 € no portátil
 * do desenho, 21 600 € na viatura.
 */
export function repartoDoAtivo(a: AtivoParaConta, ocupacoes: readonly OcupacaoParaConta[], ate: MesIso, hoje: string): RepartoDoAtivo {
  const pessoas = ocupacoes.map(() => ({ valor: 0, meses: 0 }));
  const estrutura = { valor: 0, meses: 0 };
  const total = { valor: 0, meses: 0 };
  const intervalo = intervaloComCusto(a, ate);
  if (intervalo) {
    const [primeiro, ultimo] = intervalo;
    for (let i = indiceDoMes(primeiro); i <= indiceDoMes(ultimo); i += 1) {
      const mes = somarMesesAoMes(primeiro, i - indiceDoMes(primeiro));
      const valor = valorDoAtivoNoMes(a, mes);
      if (valor === 0) continue;
      const dono = ocupacoes.findIndex((o) => donoDoMes(o, a, mes, hoje));
      const parte = dono >= 0 ? pessoas[dono] : estrutura;
      parte.valor = arredondar(parte.valor + valor);
      parte.meses += 1;
      total.valor = arredondar(total.valor + valor);
      total.meses += 1;
    }
  }
  return { pessoas, estrutura, total };
}

/**
 * O que ficou parado num mês, em euros: a soma do que cada ativo custa nesse mês quando ninguém o tem no dia de referência. É o que o
 * separador Estrutura mostra como «equipamentos parados (sem pessoa)».
 */
export function custoParadoNoMes(ativos: readonly { conta: AtivoParaConta; ocupacoes: readonly OcupacaoParaConta[] }[], mes: MesIso, hoje: string): number {
  let soma = 0;
  for (const { conta, ocupacoes } of ativos) {
    if (ocupacoes.some((o) => donoDoMes(o, conta, mes, hoje))) continue;
    soma += valorDoAtivoNoMes(conta, mes);
  }
  return arredondar(soma);
}

/** `custoParadoNoMes` sobre os ativos de Pessoas em uso (os desativados e os sem conta legível ficam de fora). */
export function custoParadoDosAtivos(ativos: readonly Ativo[], mes: MesIso, hoje: string): number {
  const itens = ativos.flatMap((a) => {
    const conta = a.estado === "ativo" ? contaDoAtivo(a) : null;
    return conta ? [{ conta, ocupacoes: a.ocupacoes.map(ocupacaoParaConta) }] : [];
  });
  return custoParadoNoMes(itens, mes, hoje);
}

export type AvisoDoAtivo ="alugadoSemFimDevolvido" | "aluguerTerminadoEntregue";

/**
 * Os avisos de um alugado que a base não recusa mas que merecem ser vistos: «sem fim, devolvido e nunca desativado» (a renda continua a
 * contar como custo de estrutura para sempre) e «contrato terminado com o equipamento ainda entregue». Só nos alugados em uso.
 */
export function avisosDoAtivo(a: Ativo, hoje: string): AvisoDoAtivo[] {
  if (a.forma !== "alugado" || a.estado !== "ativo") return [];
  const entregue = a.ocupacoes.some((o) => o.devolucao === null);
  const avisos: AvisoDoAtivo[] = [];
  if (a.fimAluguer === null && a.ocupacoes.length > 0 && !entregue) avisos.push("alugadoSemFimDevolvido");
  if (a.fimAluguer !== null && a.fimAluguer < hoje && entregue) avisos.push("aluguerTerminadoEntregue");
  return avisos;
}

export type { AtivoAlugadoConta, AtivoCompradoConta };
