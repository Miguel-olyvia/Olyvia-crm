/**
 * O custo de UMA pessoa num mês, montado a partir das contas puras de `custo.ts` e `contasDoMes.ts`. Sem dados de lado
 * nenhum: recebe a retribuição do mês, os valores avulsos (manuais) da pessoa e o seguro do cargo, e devolve cada linha do quadro (fluxo 11).
 *
 * A retribuição do mês JÁ leva os quilómetros e as ajudas de custo (vêm do processamento); os avulsos são só os lançamentos
 * manuais. A TSU incide sobre a retribuição sem km nem ajudas, e o seguro só sobre o salário base: ver `contasDoMes.ts`.
 * O equipamento (lista própria, `equipamentos.ts`) nunca entra no bruto: pesa só nos outros custos, conforme «como conta».
 */
import { arredondar, custoPorHora, horasPrevistasDoMes, somarMeses, taxaEfetiva, type MesIso } from "./custo";
import { contasDoMes, TSU_EMPREGADOR_PCT, type ContasDoMes, type DecomposicaoRetribuicao, type EntradaContas } from "./contasDoMes";
import { valorNoMes, type ContaItem, type ItemParaConta } from "./comoConta";
import { equipamentosDoMes, valorDoEquipamentoNoMes, type EquipamentoPessoa } from "./equipamentos";

/** `pontual` = o lancamento manual do processamento salarial (o unico avulso do custo); km e ajuda so existem no store de exemplo. */
export type TipoAvulso = "km" | "ajuda" | "pontual";

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

/** As definicoes por organizacao (`hr_custo_definicoes`): JA NAO entram no custo (a TSU e fixa, o seguro e do cargo, km e ajudas vem da regra salarial); ficam so para quem ainda as le (equipa, obra). */
export interface DefinicoesCusto {
  /** Percentagens. */
  taxaEmpresa: number;
  seguro: number;
  valorPorKm: number;
  ajudaPorDia: number;
}

/** Os valores com que a base cria as definições de uma organização (`hr_custo_definicoes`): o que se usa só enquanto não há definições lidas. */
export const DEFINICOES_OMISSAO: DefinicoesCusto = { taxaEmpresa: TSU_EMPREGADOR_PCT, seguro: 5, valorPorKm: 0.4, ajudaPorDia: 25 };

export interface EntradaCustoMes {
  mes: MesIso;
  /** A retribuicao do mes (com km e ajudas, SEM os manuais); `null` = sem retribuicao registada. */
  salarioMes: number | null;
  /** Os avulsos do mes: so lancamentos manuais, nunca km nem ajudas (ja estao em `salarioMes`). */
  avulsos: readonly AvulsoCusto[];
  /** Os equipamentos da pessoa (todos): só contam os que, conforme «como conta», têm valor nesse mês. */
  equipamentos: readonly EquipamentoPessoa[];
  /** O seguro de acidentes do CARGO (%), sobre o salario base; `null` = o cargo nao tem seguro. */
  seguroPct: number | null;
  /** Cargo desconhecido (so no gravado do fecho): o seguro nao entra e a linha di-lo. */
  seguroDesconhecido?: boolean;
  /** A retribuicao separada em partes (so o que o processamento devolveu); ausente = estimativa pelo cargo. */
  decomposicao?: DecomposicaoRetribuicao | null;
  /** `salarioMes` e uma estimativa pelo salario do cargo. */
  estimado?: boolean;
  excecaoTaxa: number | null;
  horasSemanais: number;
  /** Horas realmente feitas no mês. */
  horasFeitas: number;
}

export interface CustoDoMes {
  mes: MesIso;
  /** Os lancamentos manuais do mes (a coluna «avulsos»). */
  avulsos: number;
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
  /** O que cada linha da conta recebe: o ecra volta a chamar `contasDoMes` com esta entrada e a lingua. */
  entradaContas: EntradaContas;
  contas: ContasDoMes;
}

/** Os valores avulsos que contam: nunca os anulados. */
export const avulsosAtivos = (avulsos: readonly AvulsoCusto[]): AvulsoCusto[] => avulsos.filter((a) => a.anulado === null);

/** O valor avulso visto como um valor que conta (sem devolução). */
export const itemDoAvulso = (a: Pick<AvulsoCusto, "valor" | "data" | "conta">): ItemParaConta => ({ valor: a.valor, data: a.data, conta: a.conta, devolucao: null });

/** O que o valor avulso conta no mês. */
export const valorDoAvulsoNoMes = (a: AvulsoCusto, mes: MesIso): number => valorNoMes(itemDoAvulso(a), mes);

export function custoDoMes(e: EntradaCustoMes): CustoDoMes {
  const avulsos = somarMeses(avulsosAtivos(e.avulsos).map((a) => valorDoAvulsoNoMes(a, e.mes)));
  const doMes = equipamentosDoMes(e.equipamentos, e.mes);
  const outrosCustos = somarMeses(doMes.map((x) => valorDoEquipamentoNoMes(x, e.mes)));
  const entradaContas: EntradaContas = {
    retribuicaoMes: e.salarioMes,
    decomposicao: e.decomposicao ?? null,
    estimado: e.estimado ?? false,
    manuais: avulsos,
    equipamentos: outrosCustos,
    taxaPct: taxaEfetiva(TSU_EMPREGADOR_PCT, e.excecaoTaxa),
    taxaDaPessoa: e.excecaoTaxa !== null,
    seguroPct: e.seguroPct,
    ...(e.seguroDesconhecido ? { seguroDesconhecido: true } : {}),
  };
  const contas = contasDoMes(entradaContas);
  const horasPrevistas = horasPrevistasDoMes(e.horasSemanais, e.mes);
  return {
    mes: e.mes,
    avulsos,
    bruto: contas.bruto,
    parteSujeita: e.salarioMes,
    encargos: arredondar(contas.tsu + contas.seguro),
    seguro: contas.seguro,
    encargosTaxa: contas.tsu,
    outrosCustos,
    nEquipamentos: doMes.length,
    total: contas.total,
    repartido: contas.repartido?.valor ?? null,
    horasPrevistas,
    horasFeitas: e.horasFeitas,
    porHoraPrevista: custoPorHora(contas.total, horasPrevistas),
    porHoraFeita: custoPorHora(contas.total, e.horasFeitas),
    entradaContas,
    contas,
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
