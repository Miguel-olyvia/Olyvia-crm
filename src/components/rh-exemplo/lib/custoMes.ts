/**
 * O custo de UMA pessoa num mês, montado a partir das contas puras de `custo.ts`. Sem dados de lado nenhum: recebe o salário
 * do mês, os valores avulsos da pessoa e as definições da empresa, e devolve cada linha do quadro (fluxo 11).
 *
 * A parte sujeita a encargos é só o salário em si; os quilómetros e as ajudas de custo ficam de fora. O equipamento
 * (lista própria, `equipamentos.ts`) nunca entra no bruto: pesa só nos outros custos, conforme «como conta».
 */
import {
  arredondar,
  custoPorHora,
  custoRepartido14em12,
  custoTotalDoMes,
  encargosDaEmpresa,
  horasPrevistasDoMes,
  saldoBancoEmEuros,
  somarMeses,
  taxaEfetiva,
  type MesIso,
} from "./custo";
import { valorNoMes, type ContaItem, type ItemParaConta } from "./comoConta";
import { equipamentosDoMes, valorDoEquipamentoNoMes, type EquipamentoPessoa } from "./equipamentos";

export type TipoAvulso = "km" | "ajuda";

export interface AvulsoCusto {
  id: string;
  pessoaId: string;
  tipo: TipoAvulso;
  /** A data que quem registou indicou: o valor conta no mês dela, nunca noutro. */
  data: string;
  /** Como conta: de uma vez (por omissão nos avulsos), repartido por N meses ou todos os meses. */
  conta: ContaItem;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  /** km x valor por km, ou dias x valor diário. */
  valor: number;
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
  /** Os equipamentos da pessoa (todos): só contam os que, conforme «como conta», têm valor nesse mês. */
  equipamentos: readonly EquipamentoPessoa[];
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
  /** Encargos da empresa com o seguro incluído (taxa + seguro). */
  encargos: number;
  /** Só o seguro (acidentes de trabalho): `encargosTaxa + seguro = encargos`, sempre ao cêntimo. */
  seguro: number;
  encargosTaxa: number;
  /** O que os equipamentos contam no mês (conforme «como conta»). */
  outrosCustos: number;
  nEquipamentos: number;
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

/** O valor avulso visto como um valor que conta (sem devolução). */
export const itemDoAvulso = (a: Pick<AvulsoCusto, "valor" | "data" | "conta">): ItemParaConta => ({ valor: a.valor, data: a.data, conta: a.conta, devolucao: null });

/** O que o valor avulso conta no mês. */
export const valorDoAvulsoNoMes = (a: AvulsoCusto, mes: MesIso): number => valorNoMes(itemDoAvulso(a), mes);

export function custoDoMes(e: EntradaCustoMes): CustoDoMes {
  const kmEAjudas = somarMeses(avulsosAtivos(e.avulsos).map((a) => valorDoAvulsoNoMes(a, e.mes)));
  const doMes = equipamentosDoMes(e.equipamentos, e.mes);
  const outrosCustos = somarMeses(doMes.map((x) => valorDoEquipamentoNoMes(x, e.mes)));
  const bruto = e.salarioMes === null ? null : arredondar(e.salarioMes + kmEAjudas);
  const taxa = taxaEfetiva(e.definicoes.taxaEmpresa, e.excecaoTaxa);
  const encargos = e.salarioMes === null ? 0 : encargosDaEmpresa(e.salarioMes, taxa, e.definicoes.seguro);
  const seguro = e.salarioMes === null ? 0 : arredondar((e.salarioMes * e.definicoes.seguro) / 100);
  const total = custoTotalDoMes(bruto, encargos, outrosCustos);
  const horasPrevistas = horasPrevistasDoMes(e.horasSemanais, e.mes);
  return {
    mes: e.mes,
    kmEAjudas,
    bruto,
    parteSujeita: e.salarioMes,
    encargos,
    seguro,
    encargosTaxa: arredondar(encargos - seguro),
    outrosCustos,
    nEquipamentos: doMes.length,
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
