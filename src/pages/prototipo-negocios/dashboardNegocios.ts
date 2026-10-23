// Os números do dashboard de Negócios V2: cartões e gráficos. Funções puras sobre as mesmas linhas e os mesmos filtros do Quadro,
// por isso "No Quadro" e o valor de cada fase batem com o cabeçalho e as colunas do Quadro. Nada aqui muda o Estado.
// Os ganhos e os perdidos não têm coluna no Quadro: contam-se à parte (só com os filtros que fazem sentido para eles) e em todo o período,
// porque os negócios perdidos não têm data: é a mesma janela para os ganhos, os perdidos e a conversão.
import { COLUNAS_V2 } from "./negociosDocs";
import { semPaginaPropria } from "./negociosApp";
import {
  NOME_FAIXA, NOME_PARADO, NOME_SERVICO, NOTA_RESULTADOS, faixaDe, faixaParado, ignoraResultados, selecionarQuadro, selecionarResultados, servicoDe,
  type AcaoN, type ContextoN, type FaixaValor, type FiltrosN, type LinhaN, type ParadoFaixa, type ServicoN,
} from "./filtrosNegocios";
import { eurosTexto, pct, porNumero, type BarraG, type CartaoG } from "./graficosTipos";

export type BarraN = BarraG<AcaoN>;
export type CartaoN = CartaoG<AcaoN>;

const soma = (ls: readonly LinhaN[]): number => ls.reduce((a, l) => a + (l.valor ?? 0), 0);
const negocios = (n: number): string => (n === 1 ? "1 negócio" : `${n} negócios`);

/** Os negócios por fechar: os do Quadro que ainda não são ganhos (Orçamento, Proposta e Contrato por assinar). Nunca são também "ganhos". */
export const porFechar = (F: readonly LinhaN[]): LinhaN[] => F.filter((l) => !l.ganho);

/** Os negócios ganhos e os perdidos, de sempre, com os filtros que valem para eles. */
export function resultadosN(linhas: readonly LinhaN[], c: ContextoN): { ganhos: LinhaN[]; perdidos: LinhaN[] } {
  const r = selecionarResultados(linhas, c);
  return { ganhos: r.filter((l) => l.ganho), perdidos: r.filter((l) => l.perdido !== null) };
}

/** Os cartões: no Quadro, por fechar, ponderado, ganhos, conversão e com 2 ou mais orçamentos (no máximo seis). */
export function cartoesNegocios(linhas: readonly LinhaN[], c: ContextoN): CartaoN[] {
  const F = selecionarQuadro(linhas, c), { ganhos, perdidos } = resultadosN(linhas, c);
  const abertos = porFechar(F), duas = F.filter((l) => l.nOrc >= 2).length;
  const ponderado = abertos.reduce((a, l) => a + ((l.valor ?? 0) * l.prob) / 100, 0);
  const aviso = ignoraResultados(c) ? ` ${NOTA_RESULTADOS}` : "";
  return [
    { id: "quadro", rotulo: "No Quadro", valor: F.length, nota: "em Orçamento, Proposta, Contrato e Financeiro", acao: { f: {} }, acaoRotulo: `Ver no Quadro: ${negocios(F.length)}` },
    { id: "porfechar", rotulo: "Por fechar", valor: abertos.length, nota: `no valor de ${eurosTexto(soma(abertos))}: Orçamento, Proposta e Contrato por assinar` },
    { id: "ponderado", rotulo: "Ponderado", valor: ponderado, euros: true, nota: "só dos por fechar, a multiplicar pela probabilidade de fechar (de exemplo)" },
    { id: "ganhos", rotulo: "Ganhos", valor: ganhos.length, nota: `em todo o período, no valor de ${eurosTexto(soma(ganhos))}.${aviso}` },
    { id: "conversao", rotulo: "Conversão", valor: pct(ganhos.length, ganhos.length + perdidos.length), pct: true, nota: `${ganhos.length} ganhos e ${perdidos.length} perdidos, em todo o período.${aviso}` },
    { id: "duas", rotulo: "Com 2 ou mais orçamentos", valor: duas, acao: { f: { orcamentos: "2+" } }, acaoRotulo: `Filtrar por 2 ou mais orçamentos: ${negocios(duas)}` },
  ];
}

/** Uma barra por grupo, com o número e o valor; a ação junta o filtro `campo` ao que já há. */
function agrupar(F: readonly LinhaN[], grupos: { id: string; rotulo: string; campo: keyof FiltrosN; valor: string; ls: readonly LinhaN[] }[]): BarraN[] {
  return grupos.map((g) => ({ id: g.id, rotulo: g.rotulo, n: g.ls.length, euros: soma(g.ls), acao: g.ls.length > 0 ? { f: { [g.campo]: g.valor } } : undefined }));
}

/** O funil por fase: Orçamento, Proposta, Contrato e Financeiro, com o número de negócios e o valor de cada. */
export function funilFases(F: readonly LinhaN[]): BarraN[] {
  return agrupar(F, COLUNAS_V2.map((c) => ({ id: c.id, rotulo: c.nome, campo: "fase", valor: c.id, ls: F.filter((l) => l.doc === c.id) })));
}

/** O valor por comercial (os que têm negócios), do maior para o menor. */
export function valorPorComercial(F: readonly LinhaN[]): BarraN[] {
  const nomes = [...new Set(F.map((l) => l.comercial))];
  const barras = agrupar(F, nomes.map((n) => ({ id: n, rotulo: n, campo: "comercial", valor: n, ls: F.filter((l) => l.comercial === n) })));
  return [...barras].sort((a, b) => (b.euros ?? 0) - (a.euros ?? 0) || a.rotulo.localeCompare(b.rotulo, "pt"));
}

/** Casa de banho contra cozinha (e os outros serviços). */
export function porServicoN(F: readonly LinhaN[]): BarraN[] {
  const ordem: ServicoN[] = ["wc", "coz", "outros"];
  return agrupar(F, ordem.map((s) => ({ id: s, rotulo: NOME_SERVICO[s], campo: "servico", valor: s, ls: F.filter((l) => servicoDe(l) === s) })));
}

/** Com contrato contra venda direta. */
export function porTipoN(F: readonly LinhaN[]): BarraN[] {
  return agrupar(F, [
    { id: "contrato", rotulo: "Com contrato", campo: "tipo", valor: "contrato", ls: F.filter((l) => !l.vendaDireta) },
    { id: "direta", rotulo: "Venda direta", campo: "tipo", valor: "direta", ls: F.filter((l) => l.vendaDireta) },
  ]);
}

/** Os negócios por faixa de valor; os que ainda não têm orçamento ficam em "Sem valor" (só texto, não há filtro para eles). */
export function porFaixa(F: readonly LinhaN[]): BarraN[] {
  const faixas: FaixaValor[] = ["ate3", "3a6", "mais6"];
  const barras = agrupar(F, faixas.map((f) => ({ id: f, rotulo: NOME_FAIXA[f], campo: "faixa", valor: f, ls: F.filter((l) => faixaDe(l.valor) === f) })));
  const sem = F.filter((l) => l.valor === null);
  return sem.length ? [...barras, { id: "sem", rotulo: "Sem valor", n: sem.length }] : barras;
}

/** Há quanto tempo estão parados os negócios em Orçamento e em Proposta: 0 a 7, 8 a 14 e mais de 14 dias. */
export function tempoParado(F: readonly LinhaN[]): BarraN[] {
  const paradas = F.filter((l) => l.parado !== null);
  const faixas: Exclude<ParadoFaixa, "mais7">[] = ["ate7", "8a14", "mais14"];
  const nomes: Record<string, string> = { ate7: "0 a 7 dias", "8a14": NOME_PARADO["8a14"], mais14: NOME_PARADO.mais14 };
  return agrupar(F, faixas.map((f) => ({ id: f, rotulo: nomes[f], campo: "parado", valor: f, ls: paradas.filter((l) => faixaParado(l.parado!) === f) })));
}

/** Os perdidos por motivo (os perdidos que passam nos filtros que lhes dizem respeito). Não há filtro do Quadro para eles: ficam só como texto. */
export function perdidosPorMotivo(perdidos: readonly LinhaN[]): BarraN[] {
  const motivos = [...new Set(perdidos.map((l) => l.perdido!))];
  return porNumero(motivos.map((m) => ({ id: m, rotulo: m, n: perdidos.filter((l) => l.perdido === m).length })));
}

export interface PassoAtraso { id: string; nome: string; titulo: string; proximo: string; negocioId: number }

/** Os próximos passos em atraso: os negócios a decorrer que o motor marca com atraso. Os de exemplo ficam de fora: não têm página para abrir. */
export function passosEmAtraso(F: readonly LinhaN[]): PassoAtraso[] {
  return F.filter((l) => l.atraso && l.cartao && !semPaginaPropria(l.negocio)).map((l) => ({
    id: l.id, nome: l.negocio.nome, titulo: l.negocio.titulo, proximo: l.cartao!.proximo, negocioId: l.negocio.negocioId,
  }));
}
