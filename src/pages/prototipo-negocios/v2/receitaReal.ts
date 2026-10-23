// Atualizar a receita com dados reais (V2, 13/10/2026; docs/melhorias-v2-2026-10-13, 4.5, "Baixa"). Funções puras, sem React.
// Para cada serviço da obra: a mediana das horas reais por medida nas obras concluídas contra as horas da receita. A mediana (e não a
// média) é a mesma escolha da app de obra (operacao-app, ObraMetricas): uma obra fora do normal não puxa o número.
// As obras concluídas são DADOS DE EXEMPLO (na app real virão dos registos de horas das obras fechadas).
import { r2, type Estado, type Negocio, type SvcId } from "../motor";
import { receitaDe, type Custos, type ReceitaV2 } from "./custosModelo";

export interface ObraConcluida {
  id: string;
  cliente: string;
  linha: "Casa de banho" | "Cozinha";
  /** "25/09": o dia em que acabou. */
  fim: string;
  /** Por serviço: a medida feita e as horas reais registadas. */
  servicos: { sid: SvcId; q: number; horas: number }[];
}

export const OBRAS_CONCLUIDAS_EXEMPLO: readonly ObraConcluida[] = [
  { id: "oc1", cliente: "Rui Teixeira", linha: "Casa de banho", fim: "25/09", servicos: [
    { sid: "demol", q: 20, horas: 9.4 }, { sid: "canal", q: 3, horas: 6 }, { sid: "revest", q: 16, horas: 15.2 }, { sid: "pav", q: 4, horas: 3.7 },
    { sid: "loucas", q: 3, horas: 4 }, { sid: "teto", q: 4, horas: 3.8 }, { sid: "pint", q: 20, horas: 6 },
  ] },
  { id: "oc2", cliente: "Sofia Mendes", linha: "Casa de banho", fim: "18/09", servicos: [
    { sid: "demol", q: 19, horas: 9 }, { sid: "canal", q: 3, horas: 5.8 }, { sid: "revest", q: 14, horas: 12.6 }, { sid: "pav", q: 5, horas: 4.4 },
    { sid: "loucas", q: 4, horas: 5.2 }, { sid: "pint", q: 18, horas: 5.6 },
  ] },
  { id: "oc3", cliente: "Nuno Ferreira", linha: "Cozinha", fim: "11/09", servicos: [
    { sid: "demol", q: 27, horas: 12.4 }, { sid: "canal", q: 2, horas: 4.1 }, { sid: "revest", q: 18, horas: 16.6 }, { sid: "pav", q: 9, horas: 8.1 },
    { sid: "moveis", q: 9, horas: 23.4 }, { sid: "eletr", q: 4, horas: 6 }, { sid: "pint", q: 25, horas: 7.3 },
  ] },
  { id: "oc4", cliente: "Patrícia Gomes", linha: "Casa de banho", fim: "02/09", servicos: [
    { sid: "demol", q: 19.5, horas: 9.6 }, { sid: "canal", q: 3, horas: 6.1 }, { sid: "revest", q: 15, horas: 13.2 }, { sid: "pav", q: 4.5, horas: 4 },
    { sid: "loucas", q: 3, horas: 4.1 }, { sid: "teto", q: 4.5, horas: 4.2 }, { sid: "pint", q: 19, horas: 5.8 },
  ] },
  { id: "oc5", cliente: "Daniel Rocha", linha: "Cozinha", fim: "26/08", servicos: [
    { sid: "demol", q: 32, horas: 15.4 }, { sid: "canal", q: 2, horas: 3.9 }, { sid: "revest", q: 20, horas: 19.4 }, { sid: "pav", q: 12, horas: 10.8 },
    { sid: "moveis", q: 12, horas: 31 }, { sid: "pint", q: 30, horas: 8.8 },
  ] },
];

/** Com menos obras do que isto, a mediana não chega para mudar a receita. */
export const MIN_OBRAS = 3;
/** Até esta diferença (%), a receita "bate com o real". */
export const TOLERANCIA = 5;

export function mediana(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b), m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** As horas reais por medida do serviço, uma por obra concluída (as que o fizeram). */
export function horasPorMedida(sid: SvcId, obras: readonly ObraConcluida[] = OBRAS_CONCLUIDAS_EXEMPLO): number[] {
  return obras.flatMap((o) => o.servicos.filter((s) => s.sid === sid && s.q > 0).map((s) => s.horas / s.q));
}

/** As horas por medida da receita: a soma dos passos da mão de obra. */
export const horasReceita = (rec: ReceitaV2): number => r2(rec.mo.reduce((a, p) => a + p.h, 0));

export type EstadoReceita = "poucas" | "bate" | "acima" | "abaixo";

export interface ComparacaoReceita {
  sid: SvcId;
  nome: string;
  un: string;
  receita: number;
  mediana: number | null;
  n: number;
  /** A diferença da mediana à receita, em %. */
  pct: number;
  estado: EstadoReceita;
}

/** Compara as horas da receita com a mediana real, para um serviço. */
export function compararServico(sid: SvcId, nome: string, un: string, receita: number, obras: readonly ObraConcluida[] = OBRAS_CONCLUIDAS_EXEMPLO): ComparacaoReceita {
  const xs = horasPorMedida(sid, obras), m = mediana(xs), med = m === null ? null : r2(m);
  const pct = med !== null && receita > 0 ? Math.round(((med - receita) / receita) * 100) : 0;
  const estado: EstadoReceita = med === null || xs.length < MIN_OBRAS ? "poucas" : Math.abs(pct) <= TOLERANCIA ? "bate" : pct > 0 ? "acima" : "abaixo";
  return { sid, nome, un, receita, mediana: med, n: xs.length, pct, estado };
}

/** Os serviços da obra (um por serviço, pela ordem do orçamento), com a receita atual e a mediana real. */
export function comparacaoObra(d: Negocio, S: Estado, C: Custos, obras: readonly ObraConcluida[] = OBRAS_CONCLUIDAS_EXEMPLO): ComparacaoReceita[] {
  if (!d.orc) return [];
  const vistos = new Set<SvcId>(), out: ComparacaoReceita[] = [];
  for (const l of d.orc.linhas) {
    if (l.t !== "svc" || vistos.has(l.sid)) continue;
    vistos.add(l.sid);
    const s = S.svc[l.sid], rec = receitaDe(C, l.sid, s ?? null, S.cfg.alvo);
    if (!rec) continue;
    out.push(compararServico(l.sid, s?.n ?? l.sid, s?.un ?? "un", horasReceita(rec), obras));
  }
  return out;
}

/** Pode usar-se a mediana: há obras que cheguem e a diferença passa a tolerância. */
export const podeUsarMediana = (c: ComparacaoReceita): boolean => c.estado === "acima" || c.estado === "abaixo";

/**
 * A receita com as horas da mediana: os passos da mão de obra mudam na mesma proporção (a soma passa a `horas`), e a receita fica
 * "editada". Sem passos, cria um passo "Execução" com o perfil dado. Não mexe no original.
 */
export function receitaComHoras(rec: ReceitaV2, horas: number, perfil = ""): ReceitaV2 {
  const r: ReceitaV2 = structuredClone(rec);
  const soma = r.mo.reduce((a, p) => a + p.h, 0);
  if (soma > 0) {
    r.mo = r.mo.map((p) => ({ ...p, h: r2((p.h * horas) / soma) }));
    // o arredondamento não pode tirar a soma da mediana: o acerto vai para o primeiro passo
    const dif = r2(horas - r.mo.reduce((a, p) => a + p.h, 0));
    if (dif && r.mo.length) r.mo[0] = { ...r.mo[0], h: r2(r.mo[0].h + dif) };
  } else r.mo = [{ id: "p1", n: "Execução", perfil, h: r2(horas) }];
  r.origem = "editada";
  return r;
}
