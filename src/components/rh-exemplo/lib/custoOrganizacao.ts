/**
 * O custo de TODAS as pessoas num mês (módulo «Custos» do RH), em contas puras. Cada linha usa o MESMO `custoDoMes` da aba
 * Custo da ficha, e a retribuição do mês é a do «Cálculo do mês» (o total bruto de cada pessoa), por isso o módulo, as
 * fichas e o cálculo batem por construção: nada aqui refaz uma conta de salário.
 */
import { arredondar, custoPorHora, horasPrevistasDoMes, somarMeses, type MesIso } from "./custo";
import { custoDoMes, type AvulsoCusto, type CustoDoMes, type DefinicoesCusto } from "./custoMes";
import type { EquipamentoPessoa } from "./equipamentos";

/** Valores de exemplo (não vêm do banco de horas nem da assiduidade): só para mostrar a conta; não mexem no custo total. */
export const SALDO_BANCO_HORAS_EXEMPLO = 3;
export const HORAS_FEITAS_A_MAIS_EXEMPLO = 2;

export interface PessoaParaCusto {
  pessoaId: string;
  nome: string;
  cargo: string | null;
  centroId: string | null;
  centro: string | null;
  filialId: string | null;
  filial: string | null;
  tipoContrato: string | null;
  /** O total bruto da pessoa no «Cálculo do mês» (`null` = sem retribuição registada). */
  retribuicaoMes: number | null;
  horasSemanais: number;
}

export interface ContextoCusto {
  mes: MesIso;
  avulsos: readonly AvulsoCusto[];
  equipamentos: readonly EquipamentoPessoa[];
  definicoes: DefinicoesCusto;
  excecoes: Readonly<Record<string, number | null>>;
}

export type ChaveParte = "retribuicao" | "avulsos" | "encargos" | "seguro" | "equipamentos";

export interface ParteCusto {
  chave: ChaveParte;
  valor: number;
  /** Percentagem do custo total do mês, com uma casa decimal. */
  pct: number;
}

export interface LinhaCusto extends PessoaParaCusto {
  retribuicao: number | null;
  avulsosMes: number;
  encargos: number;
  seguro: number;
  equipamentosMes: number;
  nEquipamentos: number;
  total: number | null;
  porHora: number | null;
  composicao: ParteCusto[];
}

/** O custo de uma pessoa num mês: o que a aba Custo da ficha e o módulo mostram. */
export function custoDaPessoaNoMes(p: PessoaParaCusto, c: ContextoCusto): CustoDoMes {
  const previstas = horasPrevistasDoMes(p.horasSemanais, c.mes);
  return custoDoMes({
    mes: c.mes,
    salarioMes: p.retribuicaoMes,
    avulsos: c.avulsos.filter((a) => a.pessoaId === p.pessoaId),
    equipamentos: c.equipamentos.filter((e) => e.pessoaId === p.pessoaId),
    definicoes: c.definicoes,
    excecaoTaxa: c.excecoes[p.pessoaId] ?? null,
    horasSemanais: p.horasSemanais,
    saldoHoras: SALDO_BANCO_HORAS_EXEMPLO,
    horasFeitas: arredondar(previstas + HORAS_FEITAS_A_MAIS_EXEMPLO),
  });
}

/** As partes do custo total, por ordem, cada uma com a sua percentagem (vazio se o custo não tem valor). */
export function composicaoDoCusto(partes: Record<ChaveParte, number>, total: number | null): ParteCusto[] {
  if (total === null || total <= 0) return [];
  return (Object.keys(partes) as ChaveParte[]).map((chave) => ({ chave, valor: partes[chave], pct: Math.round((partes[chave] / total) * 1000) / 10 }));
}

export function montarLinhaCusto(p: PessoaParaCusto, c: ContextoCusto): LinhaCusto {
  const r = custoDaPessoaNoMes(p, c);
  const retribuicao = p.retribuicaoMes;
  return {
    ...p,
    retribuicao,
    avulsosMes: r.kmEAjudas,
    encargos: r.encargosTaxa,
    seguro: r.seguro,
    equipamentosMes: r.outrosCustos,
    nEquipamentos: r.nEquipamentos,
    total: r.total,
    porHora: custoPorHora(r.total, r.horasPrevistas),
    composicao: composicaoDoCusto(
      { retribuicao: retribuicao ?? 0, avulsos: r.kmEAjudas, encargos: r.encargosTaxa, seguro: r.seguro, equipamentos: r.outrosCustos },
      r.total,
    ),
  };
}

export interface TotaisCusto {
  pessoas: number;
  retribuicao: number;
  encargos: number;
  seguro: number;
  avulsos: number;
  equipamentos: number;
  nEquipamentos: number;
  total: number;
  /** Quantas pessoas ficam sem custo por não terem retribuição registada. */
  semValor: number;
}

export function totaisDaOrganizacao(linhas: readonly LinhaCusto[]): TotaisCusto {
  return {
    pessoas: linhas.length,
    retribuicao: somarMeses(linhas.map((l) => l.retribuicao)),
    encargos: somarMeses(linhas.map((l) => l.encargos)),
    seguro: somarMeses(linhas.map((l) => l.seguro)),
    avulsos: somarMeses(linhas.map((l) => l.avulsosMes)),
    equipamentos: somarMeses(linhas.map((l) => l.equipamentosMes)),
    nEquipamentos: linhas.reduce((s, l) => s + l.nEquipamentos, 0),
    total: somarMeses(linhas.map((l) => l.total)),
    semValor: linhas.filter((l) => l.total === null).length,
  };
}

export type ColunaCusto = "nome" | "centro" | "retribuicao" | "encargos" | "avulsosMes" | "equipamentosMes" | "seguro" | "total" | "porHora";
export type Sentido = "asc" | "desc";

const valorDaColuna = (l: LinhaCusto, coluna: ColunaCusto): string | number | null =>
  coluna === "nome" ? l.nome : coluna === "centro" ? (l.centro ?? null) : l[coluna];

/** Ordena por uma coluna; os vazios ficam sempre no fim, e o empate desfaz-se pelo nome. */
export function ordenarLinhas(linhas: readonly LinhaCusto[], coluna: ColunaCusto, sentido: Sentido): LinhaCusto[] {
  const fator = sentido === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const x = valorDaColuna(a, coluna);
    const y = valorDaColuna(b, coluna);
    if (x === null && y === null) return a.nome.localeCompare(b.nome, "pt");
    if (x === null) return 1;
    if (y === null) return -1;
    const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt");
    return cmp === 0 ? a.nome.localeCompare(b.nome, "pt") : cmp * fator;
  });
}

export interface FiltrosCusto {
  texto: string;
  /** «todos», «f:<filial>» ou «l:<centro>». */
  local: string;
  /** «todos» ou o tipo de contrato. */
  contrato: string;
}

export const SEM_FILTRO = "todos";

const semAcentos = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarLinhas(linhas: readonly LinhaCusto[], f: FiltrosCusto): LinhaCusto[] {
  const texto = semAcentos(f.texto.trim());
  return linhas.filter((l) => {
    if (texto !== "" && !semAcentos(l.nome).includes(texto)) return false;
    if (f.contrato !== SEM_FILTRO && l.tipoContrato !== f.contrato) return false;
    if (f.local.startsWith("f:")) return l.filialId === f.local.slice(2);
    if (f.local.startsWith("l:")) return l.centroId === f.local.slice(2);
    return true;
  });
}
