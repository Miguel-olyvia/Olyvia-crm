// 19/11/2026 (Rúben): as parcelas do contrato e o momento em que cada uma cai no Financeiro.
// · 100%: uma vez, no início, antes de tudo.
// · 50-50: 50% no início; os outros 50% no fim, antes da entrega da obra.
// · 50-25-25: 50% no início; 25% no arranque (carregar em «Arrancar a obra» manda-a ao Financeiro; a obra só arranca com ela paga);
//   25% no fim, antes da entrega.
// Em todos: «no fim, antes de entregar a obra, fatura para pagar; sem isso não há auto de receção da obra».
// A 1.ª parcela é a fatura do negócio (d.fin.fatura, o passo Fatura do Financeiro). As seguintes são faturas de prestação (d.fin.tranches,
// chave t2, t3…), registadas e pagas pelas funções do servidor como as outras (real/financeiroReal.ts).
// Sem React nem o estadoV2 (que puxa os documentos): o motor e a preparação da obra importam isto.
import { totaisIva, type Estado, type Negocio } from "./motor";
import { prestacoes, type Prestacao } from "./planoObra";
import { daFaturaUnica, tranchesDoPlano, valorTranche, type FaturaReg } from "./v2/financeiro";

const hojeISO = (): string => new Date().toISOString().slice(0, 10);
const tranchesDe = (d: Negocio) => tranchesDoPlano(d.f.pagamento, d.orc?.pagFases);
const totalComIva = (S: Estado, d: Negocio): number => totaisIva(d, S).total;
/** As faturas registadas (como v2/estadoV2.ts: faturasDe): as do negócio; sem elas, a fatura do passo Fatura como a 1.ª tranche. */
function faturasDe(S: Estado, d: Negocio): FaturaReg[] {
  const fs = d.fin.tranches;
  if (fs && (fs.length || !d.fin.fatura)) return fs;
  return daFaturaUnica(d.fin, tranchesDe(d), totalComIva(S, d), hojeISO(), d.f.data_pag, d.f.conta, d.f.comprovativo);
}

/** Quando a parcela se paga: no início (antes de tudo), no arranque da obra, durante a obra (o fim de uma fase) ou no fim, antes da entrega. */
export type MomentoParcela = "inicio" | "arranque" | "obra" | "fim";

export interface Parcela {
  /** A posição (0 = a do início). */
  i: number;
  /** A chave da tranche ("unica", "t1", "t2"…), a mesma da base (quote_prestacoes.ordem). */
  id: string;
  l: string;
  p: number;
  /** O valor com IVA (a última leva o resto). */
  v: number;
  momento: MomentoParcela;
  /** Já caiu no Financeiro (é a vez de faturar e receber)? */
  devida: boolean;
  fatura?: FaturaReg;
  paga: boolean;
}

/** O momento de cada prestação: a 1.ª no início; a última (havendo mais do que uma) no fim; a do arranque (ou outra «antes do início») no
 *  arranque; as do fim de uma fase durante a obra. */
export function momentoDe(L: Prestacao[], i: number): MomentoParcela {
  if (i === 0) return "inicio";
  if (i === L.length - 1) return "fim";
  const x = L[i];
  return x.fase === "arranque" || x.fase === 0 ? "arranque" : "obra";
}

/** As prestações do negócio (as mesmas da proposta, do contrato e do portal). */
const prestacoesDe = (d: Negocio) => prestacoes(d.f.pagamento?.trim() || undefined, d.orc?.pagFases);

/** As tarefas da obra estão todas feitas (a obra está a acabar)? */
const tarefasFeitas = (d: Negocio): boolean => {
  const p = d.obra.plano;
  return !!p && p.tasks.length > 0 && p.tasks.every((t) => t.exec?.estado === "feita" || t.exec?.estado === "validada");
};

/** Já é a vez desta parcela? O início: com a proposta aceite. O arranque: quando as Operações carregam em «Arrancar a obra» (d.f.arranque_pedido)
 *  ou com a obra a andar. Durante a obra: com a obra a andar. O fim: com as tarefas todas feitas ou a obra concluída. */
export function devidaNoMomento(d: Negocio, m: MomentoParcela): boolean {
  const e = d.obra.plano?.estado;
  if (m === "inicio") return !!d.orc?.aceite;
  if (m === "arranque") return !!d.f.arranque_pedido || e === "em curso" || e === "concluída";
  if (m === "obra") return e === "em curso" || e === "concluída";
  return e === "concluída" || (e === "em curso" && tarefasFeitas(d));
}

/** As parcelas do contrato, com a fatura e o pagamento de cada uma. */
export function parcelasDoContrato(S: Estado, d: Negocio): Parcela[] {
  if (!d.orc) return [];
  const L = prestacoesDe(d), T = tranchesDe(d), total = totalComIva(S, d), fs = faturasDe(S, d);
  return T.map((t, i) => {
    const fatura = fs.find((f) => f.tranche === t.id) ?? (i === 0 && d.fin.fatura ? fs.find((f) => f.numero === d.fin.fatura!.n) : undefined);
    const momento = momentoDe(L, i);
    const paga = i === 0 ? d.fin.pago || !!fatura?.pagamento : !!fatura?.pagamento;
    return { i, id: t.id, l: L[i]?.l ?? t.nome, p: L[i]?.p ?? t.pct / 100, v: valorTranche(total, T, t.id), momento, devida: devidaNoMomento(d, momento), fatura, paga };
  });
}

/** A parcela do arranque por pagar (null: não há, ou já está paga). */
export const parcelaDoArranquePorPagar = (S: Estado, d: Negocio): Parcela | null =>
  parcelasDoContrato(S, d).find((x) => x.momento === "arranque" && !x.paga) ?? null;

/** As parcelas por pagar que seguram o auto de receção (todas: a última é sempre antes da entrega). */
export const porPagarAntesDoAuto = (S: Estado, d: Negocio): Parcela[] => parcelasDoContrato(S, d).filter((x) => !x.paga);

/** O que falta para enviar o auto de receção (vazio: pode enviar-se). */
export function faltaParaAuto(S: Estado, d: Negocio): string[] {
  return porPagarAntesDoAuto(S, d).map((x) => (x.fatura ? `receber o pagamento da ${x.fatura.numero} (${nomeDaParcela(x)})` : `faturar e receber ${nomeDaParcela(x)}`));
}

/** «a parcela do arranque (25%)», «a parcela final (50%)». */
export function nomeDaParcela(x: Pick<Parcela, "momento" | "p" | "l">): string {
  const pct = `${String(Math.round(x.p * 10000) / 100).replace(".", ",")}%`;
  return x.momento === "inicio" ? `a 1.ª parcela (${pct})` : x.momento === "arranque" ? `a parcela do arranque (${pct})` : x.momento === "fim" ? `a parcela final (${pct})` : `a parcela «${x.l.toLowerCase()}» (${pct})`;
}

/** As parcelas a seguir à 1.ª que já caíram no Financeiro e não estão pagas (os passos do Financeiro na Obra). */
export const parcelasNoFinanceiro = (S: Estado, d: Negocio): Parcela[] =>
  // a obra já entregue (com o auto de receção, de antes desta regra): não volta a pedir nada ao Financeiro
  d.obra.auto || d.anulado ? [] : parcelasDoContrato(S, d).filter((x) => x.i > 0 && x.devida && !x.paga);

/** Junta a fatura da parcela às do negócio (a 1.ª, a do passo Fatura, entra como fatura registada: já está na base). */
export function comFaturaDaParcela(S: Estado, d: Negocio, x: Parcela, numero: string, hoje = hojeISO()): FaturaReg[] {
  const fs = faturasDe(S, d).map((f) => { if (!f.daDemo) return f; const { daDemo: _, ...r } = f; return { ...r, id: f.id.replace(/^demo-/, "f-") }; });
  return [...fs, { id: `f${fs.length + 1}-${x.id}`, numero: numero.trim(), data: hoje, valor: x.v, tranche: x.id }];
}
