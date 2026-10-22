// O prazo previsto no orçamento (13/10/2026): um Gantt sem técnicos, com uma tarefa por serviço do orçamento
// (e uma para a demolição e entulho), por etapas na ordem dos ofícios. Cada etapa começa quando a anterior acaba;
// dentro da etapa, ofícios diferentes trabalham em simultâneo e o mesmo ofício faz uma tarefa de cada vez (sem
// técnicos, conta-se uma equipa por ofício). A duração vem das horas do orçamento
// (8 h por dia, ao meio dia); mudá-la à mão passa as horas da tarefa a dias × 8 e o custo do orçamento muda
// com elas (só a mão de obra; o equipamento e os consumíveis não). O preço ao cliente não muda.
// 14/10: as etapas seguem as fases da obra (fasesObra.ts: 1 preparação, 2 infraestruturas, 3 revestimentos, 4 montagem);
// dentro da fase, a ordem dos ofícios (o pintor depois do ladrilhador). Um serviço com várias fases entra na primeira.
import { estruturaHora, parDemolicao, r2, type Estado, type Negocio, type SvcId } from "./motor";
import { catalogoLigado } from "./produtosVisita";
import { PAR_DEM0 } from "./entulho";
import { fasesDoServico, type ComFases, type FaseObra } from "./fasesObra";

export const HORAS_DIA = 8;
/** A chave da tarefa da demolição e entulho (as outras usam o id do serviço). */
export const TAREFA_DEMOLICAO = "demolicao";

/** A ordem dos ofícios em obra: demolir, instalações, revestir, montar, pintar; o resto no fim.
 *  Recebe o nome do serviço e o perfil: a montagem (louças, móveis) vem depois do revestimento, mesmo feita pelo canalizador. */
export function ordemOficio(txt: string): number {
  const t = txt.toLowerCase();
  if (/demol/.test(t)) return 0;
  if (/montag/.test(t)) return 3;
  if (/pint/.test(t)) return 4; // antes do teto: "Pintura de tetos" é pintura, não teto falso
  if (/canaliz|eletric|gás|gas/.test(t)) return 1;
  if (/revest|ladrilh|pavim/.test(t)) return 2;
  if (/carpint|montador|móve|move|teto|pladur/.test(t)) return 3;
  if (/pint/.test(t)) return 4;
  return 5;
}

/** Os dias por defeito para umas horas: ao meio dia, pelo menos meio dia. */
export const diasDeHoras = (h: number) => Math.max(0.5, Math.ceil((h / HORAS_DIA) * 2 - 1e-9) / 2);

export interface TarefaPrevista {
  chave: string;
  nome: string;
  perfil: string;
  /** 22/10: o perfil do Catálogo pelo id (o do serviço; "servente" na demolição): o plano escolhe o técnico por ele. */
  perfilId?: string;
  /** A fase da obra em que a tarefa entra (a primeira do serviço) e todas as do serviço. */
  fase: FaseObra;
  fases: FaseObra[];
  /** As horas que o orçamento conta. */
  hOrc: number;
  /** Os dias (os mudados à mão ou os das horas). */
  dias: number;
  manual: boolean;
  /** As horas que contam no custo: as do orçamento, ou dias × 8 se os dias foram mudados à mão. */
  h: number;
  /** Em que dia começa (0 = o primeiro). */
  inicio: number;
  /** €/h da mão de obra desta tarefa. */
  custoHora: number;
  custo: { mo: number; eq: number; cons: number; outros: number; total: number };
  /** O custo que o orçamento tinha (sem o prazo mudado) e a diferença. */
  custoOrc: number;
  delta: number;
}

/** `equipa`: pessoas por ofício (por omissão, as do orçamento, `Orcamento.equipa`, ou 1); serve para pré-ver o reforço. */
export function tarefasPrevistas(d: Negocio, S: Estado, equipa?: number): TarefaPrevista[] {
  const o = d.orc;
  if (!o) return [];
  const man = o.prazo ?? {};
  const pessoas = Math.max(1, equipa ?? o.equipa ?? 1);
  const base: Omit<TarefaPrevista, "dias" | "manual" | "h" | "inicio" | "custo" | "custoOrc" | "delta">[] = [];
  const K = catalogoLigado() as ComFases | null;
  const extra: Record<string, { eq: number; cons: number; outros: number; custoOrc: number }> = {};
  for (const l of o.linhas) {
    if (l.t !== "svc") continue;
    const s = S.svc[l.sid as SvcId];
    if (!s || !(l.q > 0)) continue;
    const custoHora = s.eh + (S.cfg.estrutura ? estruturaHora(S) : 0);
    const custoOrc = l.cu * l.q, hOrc = s.h * l.q;
    const fases = fasesDoServico(K, l.sid, s.n, s.perfil);
    base.push({ chave: l.sid, nome: s.n, perfil: s.perfil, ...(s.perfilId ? { perfilId: s.perfilId } : {}), fase: fases[0], fases, hOrc, custoHora });
    // o que o custo da linha tem além da mão de obra (equipamento, consumíveis; e o que o Catálogo mudou desde então)
    extra[l.sid] = { eq: s.eq * l.q, cons: s.cons * l.q, outros: custoOrc - hOrc * custoHora - s.eq * l.q - s.cons * l.q, custoOrc };
  }
  const r = o.demolicao?.r;
  if (r && r.horas + r.horasCarga > 0) {
    // 22/10: o €/h da equipa da demolição vem do RH (parDemolicao: 2 × o €/h do Servente, ou do Ajudante)
    const P = parDemolicao(S, catalogoLigado()?.parDem ?? PAR_DEM0);
    const hOrc = r.horas + r.horasCarga, mo = hOrc * P.custoHora;
    base.push({ chave: TAREFA_DEMOLICAO, nome: "Demolição e entulho", perfil: "Demolição", ...(P.perfilId ? { perfilId: P.perfilId } : {}), fase: 1, fases: [1], hOrc, custoHora: P.custoHora });
    extra[TAREFA_DEMOLICAO] = { eq: 0, cons: r.consumiveis, outros: r.custo - mo - r.consumiveis, custoOrc: r.custo };
  }
  // a etapa: a fase da obra e, dentro dela, a ordem dos ofícios; dentro da mesma etapa, a ordem das linhas
  const etapaDe = (t: { nome: string; perfil: string; fase: FaseObra }) => t.fase * 10 + ordemOficio(`${t.nome} ${t.perfil}`);
  const ord = base.map((t, i) => ({ t, i })).sort((a, b) => etapaDe(a.t) - etapaDe(b.t) || a.i - b.i).map((x) => x.t);
  // cada etapa começa quando a anterior acaba; dentro dela, cada ofício (perfil) vai na sua fila
  let etapa = -1, inicioEtapa = 0, fimEtapa = 0;
  const fila: Record<string, number> = {};
  return ord.map((t) => {
    const e = etapaDe(t);
    if (e !== etapa) { etapa = e; inicioEtapa = fimEtapa; for (const k in fila) delete fila[k]; }
    const oficio = t.perfil.toLowerCase(), dia = fila[oficio] ?? inicioEtapa;
    const manual = man[t.chave] != null;
    // o reforço: n pessoas por ofício fazem as mesmas horas em menos dias (a demolição tem a sua equipa própria)
    const n = t.chave === TAREFA_DEMOLICAO ? 1 : pessoas;
    const dias = manual ? man[t.chave] : diasDeHoras(t.hOrc / n);
    const h = manual ? dias * HORAS_DIA * n : t.hOrc;
    const x = extra[t.chave];
    const mo = h * t.custoHora;
    const total = mo + x.eq + x.cons + x.outros;
    const tarefa: TarefaPrevista = {
      ...t, dias, manual, h, inicio: dia,
      custo: { mo: r2(mo), eq: r2(x.eq), cons: r2(x.cons), outros: r2(x.outros), total: r2(total) },
      custoOrc: r2(x.custoOrc), delta: r2((h - t.hOrc) * t.custoHora),
    };
    fila[oficio] = dia + dias;
    fimEtapa = Math.max(fimEtapa, dia + dias);
    return tarefa;
  });
}

/** O que o prazo mudado à mão acrescenta (ou tira) ao custo do orçamento: só a mão de obra. */
export function ajustePrazo(d: Negocio, S: Estado): number {
  if (!d.orc?.prazo || !Object.keys(d.orc.prazo).length) return 0;
  return r2(tarefasPrevistas(d, S).reduce((a, t) => a + t.delta, 0));
}

/** Os dias de obra previstos: até ao fim da última tarefa. */
export const diasPrevistos = (T: TarefaPrevista[]) => T.reduce((a, t) => Math.max(a, t.inicio + t.dias), 0);

/** O prazo de execução para a proposta (dias úteis inteiros): os dias previstos arredondados para cima. */
export const prazoProposta = (T: TarefaPrevista[]) => Math.max(1, Math.ceil(diasPrevistos(T) - 1e-9));
