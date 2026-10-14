/**
 * O custo de UMA pessoa num mês, montado a partir das contas puras de `custo.ts`. Sem dados de lado nenhum: recebe o salário
 * do mês, os valores avulsos da pessoa e as definições da empresa, e devolve cada linha do quadro (fluxo 11).
 *
 * A parte sujeita a encargos é só o salário em si; os quilómetros e as ajudas de custo ficam de fora. O equipamento
 * nunca entra no bruto: pesa só nos outros custos, 1/36 por mês.
 */
import {
  arredondar,
  custoPorHora,
  custoRepartido14em12,
  custoTotalDoMes,
  encargosDaEmpresa,
  equipamentoDoMes,
  equipamentoPorMes,
  horasPrevistasDoMes,
  saldoBancoEmEuros,
  somarMeses,
  taxaEfetiva,
  type MesIso,
} from "./custo";

export type TipoAvulso = "km" | "ajuda" | "equipamento";

export interface AvulsoCusto {
  id: string;
  pessoaId: string;
  tipo: TipoAvulso;
  /** A data que quem registou indicou (a entrega, no equipamento). */
  data: string;
  /** O mês em que conta: o da data, ou o primeiro mês aberto se o da data já fechou. */
  mesContagem: MesIso;
  /** A data indicada, só quando o mês dela já estava fechado (para a nota). */
  dataReal: string | null;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  /** km x valor por km, dias x valor diário, ou o valor de compra do equipamento. */
  valor: number;
  devolucao: string | null;
  autor: string;
  criadoEm: string;
  anulado: { motivo: string; por: string; em: string } | null;
}

export interface DefinicoesCusto {
  /** Percentagens. */
  taxaEmpresa: number;
  seguro: number;
  valorPorKm: number;
  ajudaPorDia: number;
}

export interface EntradaCustoMes {
  mes: MesIso;
  salarioMes: number | null;
  avulsos: readonly AvulsoCusto[];
  definicoes: DefinicoesCusto;
  excecaoTaxa: number | null;
  horasSemanais: number;
  /** Horas a favor no banco de horas (valor de exemplo). */
  saldoHoras: number;
  /** Horas realmente feitas no mês (valor de exemplo). */
  horasFeitas: number;
}

export interface CustoDoMes {
  mes: MesIso;
  kmEAjudas: number;
  bruto: number | null;
  parteSujeita: number | null;
  encargos: number;
  outrosCustos: number;
  total: number | null;
  repartido: number | null;
  horasPrevistas: number;
  horasFeitas: number;
  porHoraPrevista: number | null;
  porHoraFeita: number | null;
  saldoEuros: number | null;
}

/** Os valores avulsos que contam: nunca os anulados. */
export const avulsosAtivos = (avulsos: readonly AvulsoCusto[]): AvulsoCusto[] => avulsos.filter((a) => a.anulado === null);

export function custoDoMes(e: EntradaCustoMes): CustoDoMes {
  const ativos = avulsosAtivos(e.avulsos);
  const kmEAjudas = somarMeses(ativos.filter((a) => a.tipo !== "equipamento" && a.mesContagem === e.mes).map((a) => a.valor));
  const outrosCustos = somarMeses(
    ativos
      .filter((a) => a.tipo === "equipamento" && equipamentoDoMes({ entrega: a.data, devolucao: a.devolucao }, e.mes))
      .map((a) => equipamentoPorMes(a.valorUnitario)),
  );
  const bruto = e.salarioMes === null ? null : arredondar(e.salarioMes + kmEAjudas);
  const taxa = taxaEfetiva(e.definicoes.taxaEmpresa, e.excecaoTaxa);
  const encargos = e.salarioMes === null ? 0 : encargosDaEmpresa(e.salarioMes, taxa, e.definicoes.seguro);
  const total = custoTotalDoMes(bruto, encargos, outrosCustos);
  const horasPrevistas = horasPrevistasDoMes(e.horasSemanais, e.mes);
  return {
    mes: e.mes,
    kmEAjudas,
    bruto,
    parteSujeita: e.salarioMes,
    encargos,
    outrosCustos,
    total,
    repartido: custoRepartido14em12(e.salarioMes, encargos),
    horasPrevistas,
    horasFeitas: e.horasFeitas,
    porHoraPrevista: custoPorHora(total, horasPrevistas),
    porHoraFeita: custoPorHora(total, e.horasFeitas),
    saldoEuros: saldoBancoEmEuros(e.saldoHoras, e.salarioMes, horasPrevistas),
  };
}

/** Os meses de `inicio` a `fim`, ambos inclusive, em ordem; vazio se `inicio` vem depois de `fim`. */
export function mesesEntre(inicio: MesIso, fim: MesIso): MesIso[] {
  const lista: MesIso[] = [];
  let [ano, mes] = inicio.split("-").map(Number);
  while (`${ano}-${String(mes).padStart(2, "0")}` <= fim) {
    lista.push(`${ano}-${String(mes).padStart(2, "0")}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return lista;
}

/** O acumulado do ano (desde janeiro) e desde a admissão: soma dos totais mensais a partir do mês de admissão. */
export function acumulados(
  totaisPorMes: ReadonlyMap<MesIso, number | null>,
  admissao: MesIso | null,
  mesAtual: MesIso,
): { ano: number; admissao: number } {
  const inicio = admissao ?? mesAtual;
  const doAno = mesesEntre(`${mesAtual.slice(0, 4)}-01`, mesAtual).filter((m) => m >= inicio);
  return {
    ano: somarMeses(doAno.map((m) => totaisPorMes.get(m) ?? null)),
    admissao: somarMeses(mesesEntre(inicio, mesAtual).map((m) => totaisPorMes.get(m) ?? null)),
  };
}
