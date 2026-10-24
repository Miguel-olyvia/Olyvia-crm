/**
 * Processamento salarial (fluxo 10): funções PURAS, pela ordem do documento.
 *  1-2. retribuição do mês e conversão por periodicidade
 *  3.   base do mês pelos duodécimos
 *  4.   valor da hora (retribuição mensal ÷ horas planeadas; sem duodécimos)
 *  5.   desconto = tempo em falta × valor da hora
 *  6.   componentes automáticos (só horas extra CONFIRMADAS)
 *  7.   subsídio de alimentação, de férias e de Natal
 *  8.   valores pontuais
 *  9.   total bruto: cada linha arredondada ao cêntimo (meio cêntimo para cima), total = soma das linhas.
 * O valor da hora e as contas intermédias nunca se arredondam.
 */
import type { Periodicidade } from "@/components/rh-exemplo/tipos";
import { pagamentoHorasExtra, type CodigoPagamentoHE, type HoraExtra, type RegrasPagamentoHE } from "./horasExtraRegras";

export type AvisoSalario = "sem_retribuicao" | "sem_horas_planeadas" | "duodecimos_por_decidir" | "sem_subsidio_pessoa";

/** Meio cêntimo para cima; o sinal não muda o arredondamento (−1,005 → −1,01). */
export function arredondarCentimo(valor: number): number {
  const sinal = valor < 0 ? -1 : 1;
  return (sinal * Math.round(Math.abs(valor) * 100 + 1e-9)) / 100;
}

export interface EntradaConversao {
  valor: number;
  periodicidade: Periodicidade;
  diasUteisMes: number;
  horasPlaneadasMes: number;
}

/** Passo 2: mensal = o valor · anual ÷ 12 · semanal × 52 ÷ 12 · diária × dias úteis · à hora × horas planeadas. */
export function converterParaMensal(e: EntradaConversao): number {
  switch (e.periodicidade) {
    case "mensal": return e.valor;
    case "anual": return e.valor / 12;
    case "semanal": return (e.valor * 52) / 12;
    case "diaria": return e.valor * e.diasUteisMes;
    case "hora": return e.valor * e.horasPlaneadasMes;
  }
}

/** Percentagem de duodécimos; sem escolha conta como 0 % (e o chamador avisa). */
const pctEfectiva = (pct: 0 | 50 | 100 | null): number => pct ?? 0;

/** Passo 3: 0 % → mensal · 50 % → mensal × 13 ÷ 12 · 100 % → mensal × 14 ÷ 12. */
export function baseDoMes(mensal: number, duodecimosPct: 0 | 50 | 100 | null): number {
  return (mensal * (12 + (2 * pctEfectiva(duodecimosPct)) / 100)) / 12;
}

/** Passo 4: sem horas planeadas não há valor da hora. */
export function valorDaHora(mensal: number, horasPlaneadasMes: number): number | null {
  return horasPlaneadasMes > 0 ? mensal / horasPlaneadasMes : null;
}

/** Passo 7b: em Dezembro, a parte do subsídio de Natal que não vem diluída. Outros meses, zero. */
export function subsidioNatalEmPagamento(mensal: number, duodecimosPct: 0 | 50 | 100 | null, mes: number): number {
  return mes === 12 ? mensal * (1 - pctEfectiva(duodecimosPct) / 100) : 0;
}

/** Dias úteis (seg-sex) de um mês, sem feriados. */
export function diasUteisDoMes(ano: number, mes: number): number {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= ultimo; d += 1) {
    const dia = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
    if (dia !== 0 && dia !== 6) n += 1;
  }
  return n;
}

export type ChaveLinha =
  | "base" | "desconto" | "subsidio_alimentacao" | "subsidio_ferias" | "subsidio_natal"
  | `he_${CodigoPagamentoHE}` | `pontual_${string}`;

export interface LinhaSalario {
  chave: ChaveLinha;
  /** Passo do documento onde nasce (3 a 8). */
  passo: number;
  /** Só a conta, em números: a língua vem da chave. */
  formula: string;
  valorExacto: number;
  valor: number;
  /** Texto livre (pontuais). */
  descricao?: string;
}

export interface Pontual {
  id: string;
  pessoaId: string;
  mes: string;
  descricao: string;
  valor: number;
}

export interface EntradaSalario {
  mes: number;
  retribuicao: { valor: number; periodicidade: Periodicidade; duodecimosPct: 0 | 50 | 100 | null; subsidioAlimentacaoDia: number | null } | null;
  diasUteisMes: number;
  horasPlaneadasMes: number;
  minutosEmFalta: number;
  diasElegiveisSubsidio: number;
  horasExtra: readonly HoraExtra[];
  regrasHE: RegrasPagamentoHE;
  subsidioFerias: number;
  pontuais: readonly Pontual[];
  /** Contrato que comeca ou acaba a meio do mes: so os dias em vigor pagam base. Omisso = o mes inteiro. */
  diasDeContrato?: { dias: number; doMes: number };
}

export interface ResultadoSalario {
  mensal: number | null;
  base: number | null;
  valorHora: number | null;
  linhas: LinhaSalario[];
  avisos: AvisoSalario[];
  /** `null` quando não há retribuição. */
  totalBruto: number | null;
}

const eur = (n: number): string => n.toFixed(2).replace(".", ",");
const hh = (min: number): string => String(Math.round((min / 60) * 100) / 100).replace(".", ",");

function linha(chave: ChaveLinha, passo: number, formula: string, valorExacto: number, descricao?: string): LinhaSalario {
  return { chave, passo, formula, valorExacto, valor: arredondarCentimo(valorExacto), descricao };
}

function linhasDeHorasExtra(e: EntradaSalario, vh: number | null): LinhaSalario[] {
  return pagamentoHorasExtra(e.horasExtra, vh, e.regrasHE).map((l) =>
    linha(`he_${l.codigo}`, 6, `${hh(l.minutos)} h × ${eur(vh ?? 0)} × ${l.pct / 100}`, l.valor));
}

function linhasDeSubsidios(e: EntradaSalario, mensal: number, avisos: AvisoSalario[]): LinhaSalario[] {
  const r = e.retribuicao!;
  const saida: LinhaSalario[] = [];
  if (r.subsidioAlimentacaoDia === null) avisos.push("sem_subsidio_pessoa");
  else saida.push(linha("subsidio_alimentacao", 7, `${e.diasElegiveisSubsidio} × ${eur(r.subsidioAlimentacaoDia)}`, e.diasElegiveisSubsidio * r.subsidioAlimentacaoDia));
  if (e.subsidioFerias !== 0) saida.push(linha("subsidio_ferias", 7, eur(e.subsidioFerias), e.subsidioFerias));
  const natal = subsidioNatalEmPagamento(mensal, r.duodecimosPct, e.mes);
  if (natal !== 0) saida.push(linha("subsidio_natal", 7, `${eur(mensal)} × (1 − ${pctEfectiva(r.duodecimosPct)} ÷ 100)`, natal));
  return saida;
}

export function calcularSalario(e: EntradaSalario): ResultadoSalario {
  const vazio: ResultadoSalario = { mensal: null, base: null, valorHora: null, linhas: [], avisos: ["sem_retribuicao"], totalBruto: null };
  if (!e.retribuicao) return vazio;
  const r = e.retribuicao;
  const avisos: AvisoSalario[] = [];
  const mensal = converterParaMensal({ valor: r.valor, periodicidade: r.periodicidade, diasUteisMes: e.diasUteisMes, horasPlaneadasMes: e.horasPlaneadasMes });
  const base = baseDoMes(mensal, r.duodecimosPct);
  const vh = valorDaHora(mensal, e.horasPlaneadasMes);
  if (r.duodecimosPct === null) avisos.push("duodecimos_por_decidir");
  if (vh === null) avisos.push("sem_horas_planeadas");

  const fracao = e.diasDeContrato && e.diasDeContrato.dias < e.diasDeContrato.doMes ? e.diasDeContrato : null;
  const formulaBase = `${eur(mensal)} × ${12 + (2 * pctEfectiva(r.duodecimosPct)) / 100} ÷ 12`;
  const linhas: LinhaSalario[] = [fracao
    ? linha("base", 3, `${formulaBase} × ${fracao.dias} ÷ ${fracao.doMes}`, (base * fracao.dias) / fracao.doMes)
    : linha("base", 3, formulaBase, base)];
  if (e.minutosEmFalta > 0 && vh !== null) linhas.push(linha("desconto", 5, `− ${hh(e.minutosEmFalta)} h × ${eur(vh)}`, -(e.minutosEmFalta / 60) * vh));
  linhas.push(...linhasDeHorasExtra(e, vh), ...linhasDeSubsidios(e, mensal, avisos));
  for (const p of e.pontuais) linhas.push(linha(`pontual_${p.id}`, 8, eur(p.valor), p.valor, p.descricao));

  const soma = linhas.reduce((s, l) => s + l.valor, 0);
  return { mensal, base, valorHora: vh, linhas, avisos, totalBruto: Math.max(0, arredondarCentimo(soma)) };
}
