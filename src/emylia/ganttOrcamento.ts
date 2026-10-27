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
import { fasesDoServico, fasesPadrao, type ComFases, type FaseObra } from "./fasesObra";
import { itemCatalogo } from "./catalogo";
import { custosDe, perfilIdDe, receitaDe } from "./v2/custosModelo";

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
  /** O id do serviço; numa parte de um «MO Modelo», "<serviço>#<n>" (a n-ésima parte, pela ordem da receita). */
  chave: string;
  /** 26/10: o serviço de que a tarefa é parte (só nas partes de um «MO Modelo»; nas outras, é a chave). */
  svc?: string;
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

/** 26/10: as horas de um serviço dos «Modelos de obra» do Catálogo partidas pelos ofícios da receita (pela ordem dos passos), em
 *  proporção das horas de cada um; os outros serviços ficam inteiros ([]). `h` é o total da tarefa (com a quantidade). */
export function partesPorOficio(S: Estado, sid: string, h: number): { perfilId: string; passos: string; h: number }[] {
  if (itemCatalogo(sid)?.cat !== "Modelos de obra") return [];
  const rec = receitaDe(custosDe(S), sid, S.svc[sid as SvcId], S.cfg.alvo);
  const mo = (rec?.mo ?? []).filter((m) => m.h > 0 && m.perfil);
  const total = mo.reduce((a, m) => a + m.h, 0);
  if (!(total > 0)) return [];
  const por = new Map<string, { perfilId: string; passos: string[]; h: number }>();
  for (const m of mo) {
    const x = por.get(m.perfil) ?? { perfilId: m.perfil, passos: [], h: 0 };
    x.passos.push(m.n); x.h += m.h; por.set(m.perfil, x);
  }
  return [...por.values()].map((x) => ({ perfilId: x.perfilId, passos: x.passos.join(", ").toLowerCase(), h: (x.h / total) * h }));
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
    // 22/10 (fase 2): a proposta enviada usa o custo congelado na linha (horas, €/h dos ofícios, estrutura, equipamento e consumíveis)
    const det = l.det, hUn = det?.h ?? s.h;
    const custoHora = det ? (det.h > 0 ? det.mo / det.h : 0) + det.taxaEstr : s.eh + (S.cfg.estrutura ? estruturaHora(S) : 0);
    const eqUn = det?.eq ?? s.eq, consUn = det?.cons ?? s.cons;
    const custoOrc = l.cu * l.q, hOrc = hUn * l.q;
    const fases = fasesDoServico(K, l.sid, s.n, s.perfil);
    // 26/10 (caso real P-2026-0109): um «MO Modelo» junta vários ofícios; cada um é uma tarefa, na fase do seu trabalho, a correr ao
    // lado dos outros serviços dessa fase. Antes era uma tarefa só, na fase 1: a fase 1 tinha 39,5 dias e o plano da obra, que já o
    // partia, empurrava tudo para a frente (99 dias úteis). As horas e os custos repartem-se pelas horas de cada ofício.
    const partes = partesPorOficio(S, l.sid, hOrc);
    if (partes.length > 1) {
      const C = custosDe(S);
      let faseAnt: FaseObra = 1;
      partes.forEach((pt, i) => {
        const perfil = C.perfis.find((y) => y.id === pt.perfilId)?.n ?? pt.perfilId;
        // os passos da receita vêm por ordem: a fase nunca recua ("apoio e limpeza", no fim, fica na última)
        const fase = Math.max(faseAnt, fasesPadrao(pt.passos, perfil)[0]) as FaseObra;
        faseAnt = fase;
        const k = `${l.sid}#${i + 1}`, quota = hOrc > 0 ? pt.h / hOrc : 1 / partes.length;
        base.push({ chave: k, svc: l.sid, nome: `${s.n} · ${pt.passos}`, perfil, perfilId: pt.perfilId, fase, fases: [fase], hOrc: pt.h, custoHora });
        extra[k] = { eq: eqUn * l.q * quota, cons: consUn * l.q * quota, outros: (custoOrc - hOrc * custoHora - eqUn * l.q - consUn * l.q) * quota, custoOrc: custoOrc * quota };
      });
      continue;
    }
    base.push({ chave: l.sid, nome: s.n, perfil: s.perfil, ...(s.perfilId ? { perfilId: s.perfilId } : {}), fase: fases[0], fases, hOrc, custoHora });
    // o que o custo da linha tem além da mão de obra (equipamento, consumíveis; e o que o Catálogo mudou desde então)
    extra[l.sid] = { eq: eqUn * l.q, cons: consUn * l.q, outros: custoOrc - hOrc * custoHora - eqUn * l.q - consUn * l.q, custoOrc };
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
  // 26/10: a fila é a do perfil do Catálogo (pelo id): "Canalização" (o ofício do serviço) e "Canalizador" (o da receita de um «MO
  // Modelo») são a mesma pessoa e não podem trabalhar em duas tarefas ao mesmo tempo; sem perfil conhecido, o nome do ofício
  const CF = custosDe(S);
  const filaDe = (t: { perfil: string; perfilId?: string }) => perfilIdDe(CF, t) || t.perfil.toLowerCase();
  return ord.map((t) => {
    const e = etapaDe(t);
    if (e !== etapa) { etapa = e; inicioEtapa = fimEtapa; for (const k in fila) delete fila[k]; }
    const oficio = filaDe(t), dia = fila[oficio] ?? inicioEtapa;
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
