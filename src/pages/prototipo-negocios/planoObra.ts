// O plano da obra no orçamento (14/10/2026, pedido do Ruben: "dinâmico, interativo, com Gantt com as fases e custos e a
// previsão de duração"). Por cima do prazo previsto (ganttOrcamento.ts):
// · o calendário: os dias da obra em datas, só dias úteis (sem fins de semana nem feriados nacionais);
// · as fases da obra (fasesObra.ts) com os dias, o custo, o preço e a margem de cada uma;
// · a curva do custo acumulado: a mão de obra corre ao longo da tarefa, os materiais entram no início da sua fase.
// Funções puras, sem React.
import { fatorReal, linhaCalc, r2, type Estado, type Negocio } from "./motor";
import { FASES_OBRA, fasesPadrao, type FaseObra } from "./fasesObra";
import { TAREFA_DEMOLICAO, diasPrevistos, tarefasPrevistas, type TarefaPrevista } from "./ganttOrcamento";
import { LINHA_DEMOLICAO } from "./entulho";

/** A rampa das fases (um só tom, do claro ao escuro; todos ≥ 3:1 sobre o branco e sobre o fundo). */
export const COR_FASE: Record<number, string> = { 1: "#9074dc", 2: "#7452d1", 3: "#5a36bf", 4: "#432791" };

/* ------------------------------------------------------------------ o calendário */
const doisD = (n: number) => String(n).padStart(2, "0");
/** A data local em "aaaa-mm-dd" (sem fuso: é um dia de obra, não um instante). */
export const isoDia = (d: Date) => `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(d.getDate())}`;
export const deIso = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
const maisDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** O domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

const cacheFeriados = new Map<number, Map<string, string>>();
/** Os feriados nacionais de um ano (os fixos, a Sexta-feira Santa e o Corpo de Deus), por data "aaaa-mm-dd". */
export function feriadosPT(ano: number): Map<string, string> {
  const ja = cacheFeriados.get(ano);
  if (ja) return ja;
  const m = new Map<string, string>();
  const fixos: [number, number, string][] = [
    [1, 1, "Ano Novo"], [4, 25, "Dia da Liberdade"], [5, 1, "Dia do Trabalhador"], [6, 10, "Dia de Portugal"],
    [8, 15, "Assunção de Nossa Senhora"], [10, 5, "Implantação da República"], [11, 1, "Dia de Todos os Santos"],
    [12, 1, "Restauração da Independência"], [12, 8, "Imaculada Conceição"], [12, 25, "Natal"],
  ];
  for (const [mes, dia, n] of fixos) m.set(isoDia(new Date(ano, mes - 1, dia)), n);
  const p = pascoa(ano);
  m.set(isoDia(maisDias(p, -2)), "Sexta-feira Santa");
  m.set(isoDia(maisDias(p, 60)), "Corpo de Deus");
  cacheFeriados.set(ano, m);
  return m;
}
export const feriado = (d: Date) => feriadosPT(d.getFullYear()).get(isoDia(d)) ?? null;
export const diaUtil = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !feriado(d);

/** O primeiro dia útil a partir de `d` (o próprio, se for útil). */
export function proximoUtil(d: Date): Date {
  let x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (!diaUtil(x)) x = maisDias(x, 1);
  return x;
}

/** Os `n` dias úteis da obra a partir do início (o dia 0 é o início, já ajustado a dia útil). */
export function diasDaObra(inicio: Date, n: number): Date[] {
  const out: Date[] = [];
  let x = proximoUtil(inicio);
  for (let k = 0; k < n; k++) { out.push(x); x = proximoUtil(maisDias(x, 1)); }
  return out;
}

/** Os feriados que caem entre o primeiro e o último dia da obra (a obra salta-os). */
export function feriadosSaltados(dias: Date[]): { data: Date; nome: string }[] {
  if (dias.length < 2) return [];
  const out: { data: Date; nome: string }[] = [];
  for (let x = maisDias(dias[0], 1); x < dias[dias.length - 1]; x = maisDias(x, 1)) {
    const n = x.getDay() !== 0 && x.getDay() !== 6 ? feriado(x) : null;
    if (n) out.push({ data: x, nome: n });
  }
  return out;
}

/** Os inícios rápidos: a próxima segunda-feira, daqui a 2 semanas e daqui a um mês (a segunda-feira seguinte). */
export function iniciosRapidos(hoje: Date): { k: string; nome: string; data: Date }[] {
  const seg = (d: Date) => proximoUtil(maisDias(d, ((8 - d.getDay()) % 7) || 7));
  return [
    { k: "seg", nome: "Próxima segunda", data: seg(hoje) },
    { k: "2sem", nome: "Daqui a 2 semanas", data: seg(maisDias(hoje, 7)) },
    { k: "mes", nome: "Daqui a um mês", data: seg(maisDias(hoje, 28)) },
  ];
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "seg, 19 out" */
export const dataCurta = (d: Date) => `${SEMANA[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
export const diaSemana = (d: Date) => SEMANA[d.getDay()];
export const nomeMes = (d: Date) => MESES[d.getMonth()];

/* ------------------------------------------------------------------ as fases e os custos */
export interface FasePlano {
  n: FaseObra; nome: string; curto: string;
  /** Do dia `inicio` ao dia `fim` da obra (em dias úteis desde o início; meio dia = 0,5). */
  inicio: number; fim: number;
  tarefas: TarefaPrevista[];
  /** A mão de obra, o equipamento e os consumíveis das tarefas desta fase. */
  custoTarefas: number;
  /** Os materiais (linhas de materiais e produtos) que entram nesta fase. */
  custoMat: number;
  custo: number; preco: number; margem: number;
}

export interface Plano {
  tarefas: TarefaPrevista[];
  fases: FasePlano[];
  dias: number;
  custo: number; preco: number;
}

/** A fase de uma linha de materiais, pela descrição ("móveis, bancada, torneira" → 4; "cerâmica e cola" → 3). */
export const faseDosMateriais = (descricao: string): FaseObra => fasesPadrao(descricao)[0];

/** `equipa`: pessoas por ofício, para pré-ver o reforço (por omissão, as do orçamento). */
export function planoObra(d: Negocio, S: Estado, equipa?: number): Plano {
  const o = d.orc;
  if (!o) return { tarefas: [], fases: [], dias: 0, custo: 0, preco: 0 };
  const T = tarefasPrevistas(d, S, equipa);
  const desc = 1 - (o.desconto || 0) / 100;
  const fases: FasePlano[] = FASES_OBRA.map((f) => ({ n: f.n, nome: f.nome, curto: f.curto, inicio: 0, fim: 0, tarefas: [], custoTarefas: 0, custoMat: 0, custo: 0, preco: 0, margem: 0 }));
  const F = (n: FaseObra) => fases[n - 1];
  for (const t of T) { F(t.fase).tarefas.push(t); F(t.fase).custoTarefas += t.custo.total; }
  for (const l of o.linhas) {
    const x = linhaCalc(l, S);
    // a linha da demolição: o custo já está na tarefa "Demolição e entulho" (fase 1); aqui só o preço
    if (l.t === "mat" && l.d === LINHA_DEMOLICAO) { F(1).preco += x.preco * desc; continue; }
    if (l.t === "mat") { const f = F(faseDosMateriais(l.d)); f.custoMat += x.custo; f.preco += x.preco * desc; continue; }
    if (!(l.q > 0)) continue;
    const t = T.find((y) => y.chave === l.sid);
    if (t) F(t.fase).preco += x.preco * desc;
    else { F(4).preco += x.preco * desc; F(4).custoMat += x.custo; } // um serviço sem tarefa (sem horas): no fim
  }
  // os inícios e os fins: os das tarefas; uma fase sem tarefas fica, sem duração, onde a anterior acaba
  let fimAnterior = 0;
  for (const f of fases) {
    if (f.tarefas.length) { f.inicio = Math.min(...f.tarefas.map((t) => t.inicio)); f.fim = Math.max(...f.tarefas.map((t) => t.inicio + t.dias)); }
    else { f.inicio = fimAnterior; f.fim = fimAnterior; }
    fimAnterior = Math.max(fimAnterior, f.fim);
    f.custo = r2(f.custoTarefas + f.custoMat); f.custoTarefas = r2(f.custoTarefas); f.custoMat = r2(f.custoMat); f.preco = r2(f.preco);
    f.margem = f.preco > 0 ? (f.preco - f.custo) / f.preco : 0;
  }
  const usadas = fases.filter((f) => f.tarefas.length || f.custo || f.preco);
  return { tarefas: T, fases: usadas, dias: diasPrevistos(T), custo: r2(usadas.reduce((a, f) => a + f.custo, 0)), preco: r2(usadas.reduce((a, f) => a + f.preco, 0)) };
}

/** O custo acumulado até ao dia `x` (em dias úteis desde o início): a mão de obra ao ritmo de cada tarefa; os materiais
 *  de uma fase entram todos no dia em que ela começa (têm de estar em obra). */
export function custoAte(P: Plano, x: number): number {
  let c = 0;
  for (const t of P.tarefas) c += t.custo.total * Math.max(0, Math.min(1, (x - t.inicio) / t.dias));
  for (const f of P.fases) if (x >= f.inicio) c += f.custoMat;
  return r2(c);
}

/** A curva do custo acumulado, de meio em meio dia, do dia 0 ao fim (para o gráfico). */
export function curvaCusto(P: Plano): { x: number; c: number }[] {
  const fim = Math.max(0.5, Math.ceil(P.dias * 2) / 2);
  const out: { x: number; c: number }[] = [];
  for (let x = 0; x <= fim + 1e-9; x += 0.5) out.push({ x, c: custoAte(P, x) });
  return out;
}

/* ------------------------------------------------------------------ os pagamentos e a tesouraria */
// O cliente paga em prestações (as condições de pagamento da proposta); a obra gasta ao ritmo da curva. A tesouraria
// é o que já se recebeu menos o que já se gastou, sem IVA (o IVA não é da empresa). "Por fases" (14/10) é o plano
// sugerido para a obra nunca ficar a descoberto: cada prestação paga o que se gasta até à seguinte.

/** Uma prestação: a percentagem do total e quando se recebe. `fase`: 0 = na adjudicação; 1–3 = no fim dessa fase; "fim". */
export interface Prestacao { l: string; p: number; fase: 0 | FaseObra | "fim" }

export const PAGAMENTO_FASES = "Por fases";

/** O dia (em dias úteis desde o início) em que a prestação se recebe. */
export function diaDaPrestacao(P: Plano, x: Prestacao): number {
  if (x.fase === 0) return 0;
  if (x.fase === "fim") return P.dias;
  return P.fases.find((f) => f.n === x.fase)?.fim ?? P.dias;
}

/** As prestações das condições de pagamento escolhidas (por omissão, 50% + 50% no fim). */
export function prestacoes(pagamento: string | undefined, guardadas?: Prestacao[] | null): Prestacao[] {
  const pg = pagamento || "50% + 50% no fim";
  if (pg === PAGAMENTO_FASES && guardadas?.length) return guardadas;
  if (pg.startsWith("100")) return [{ l: "Na adjudicação", p: 1, fase: 0 }];
  if (pg.startsWith("30")) return [{ l: "Na adjudicação", p: 0.3, fase: 0 }, { l: "A meio da obra", p: 0.4, fase: 2 }, { l: "No fim da obra", p: 0.3, fase: "fim" }];
  return [{ l: "Na adjudicação", p: 0.5, fase: 0 }, { l: "No fim da obra", p: 0.5, fase: "fim" }];
}

/** O que já se recebeu até ao dia `x` (sem IVA). */
export function recebidoAte(P: Plano, prest: Prestacao[], x: number): number {
  return r2(prest.reduce((a, t) => a + (diaDaPrestacao(P, t) <= x + 1e-9 ? t.p * P.preco : 0), 0));
}

export interface Tesouraria {
  pontos: { x: number; gasto: number; recebido: number; saldo: number }[];
  /** O pior momento: o saldo mais baixo e quando. */
  pior: { x: number; saldo: number };
  descoberto: boolean;
}
export function tesouraria(P: Plano, prest: Prestacao[]): Tesouraria {
  const pontos = curvaCusto(P).map(({ x, c }) => { const rec = recebidoAte(P, prest, x); return { x, gasto: c, recebido: rec, saldo: r2(rec - c) }; });
  // os pagamentos chegam no fim do dia da fase; o gasto desse dia já lá está: olha-se também mesmo antes de cada prestação
  for (const t of prest) {
    const x = diaDaPrestacao(P, t) - 0.01;
    if (x > 0) { const c = custoAte(P, x), rec = recebidoAte(P, prest, x); pontos.push({ x, gasto: c, recebido: rec, saldo: r2(rec - c) }); }
  }
  pontos.sort((a, b) => a.x - b.x);
  const pior = pontos.reduce((m, p) => (p.saldo < m.saldo ? { x: p.x, saldo: p.saldo } : m), { x: 0, saldo: Infinity });
  return { pontos, pior, descoberto: pior.saldo < -0.5 };
}

/**
 * O plano "Por fases": uma prestação na adjudicação, uma no fim de cada fase (menos a última) e a do fim da obra.
 * Cada uma cobre o que se gasta até à seguinte (com 5% de folga), arredondada aos 5%; a do fim fica com o resto,
 * e nunca menos de 10% (o cliente guarda uma parte para o fim). Como se faz no comércio: a adjudicação é pelo menos
 * 25% (o sinal) e uma prestação a meio é pelo menos 10%; uma que não faz falta (o já recebido chega) sai.
 */
const SINAL = 0.25, MIN_PRESTACAO = 0.1;
export function sugerirPorFases(P: Plano): Prestacao[] {
  if (!(P.preco > 0)) return prestacoes(undefined);
  const marcos: Prestacao[] = [{ l: "Na adjudicação", p: 0, fase: 0 }];
  const comDias = P.fases.filter((f) => f.fim > f.inicio);
  for (const f of comDias.slice(0, -1)) marcos.push({ l: `No fim da fase ${f.n} (${f.curto.toLowerCase()})`, p: 0, fase: f.n });
  marcos.push({ l: "No fim da obra", p: 0, fase: "fim" });
  let acum = 0;
  for (let k = 0; k < marcos.length - 1; k++) {
    const ate = diaDaPrestacao(P, marcos[k + 1]) - 0.01;
    const precisa = (custoAte(P, ate) * 1.05) / P.preco;
    let alvo = Math.ceil((precisa - 1e-9) * 20) / 20; // aos 5%
    if (k === 0) alvo = Math.max(alvo, SINAL);
    else if (alvo > acum + 1e-9) alvo = Math.max(alvo, acum + MIN_PRESTACAO);
    alvo = Math.min(0.9, alvo); // deixa pelo menos 10% para o fim
    const p = Math.max(0, r2(alvo - acum));
    marcos[k].p = p; acum = r2(acum + p);
  }
  marcos[marcos.length - 1].p = r2(1 - acum);
  return marcos.filter((m, i) => m.p > 0 || i === marcos.length - 1);
}

/* ------------------------------------------------------------------ o previsto contra o real, por fase (14/10) */
// Na obra concluída: as horas reais de cada tarefa (o fator real do serviço, motor.ts: fatorReal) dão o custo real da
// fase (o previsto + a diferença de horas × €/h) e os dias reais (os dias previstos na proporção das horas; as fases
// continuam umas a seguir às outras). Serve para ver onde a obra se afastou do orçamento e o que corrigir no Catálogo.
export interface TarefaReal { chave: string; nome: string; hPrev: number; hReal: number; fator: number }
export interface FaseReal {
  n: FaseObra; nome: string; curto: string;
  prev: { inicio: number; dias: number; custo: number };
  real: { inicio: number; dias: number; custo: number };
  preco: number; margemPrev: number; margemReal: number;
  tarefas: TarefaReal[];
}
export interface ObraReal { fases: FaseReal[]; diasPrev: number; diasReal: number; custoPrev: number; custoReal: number; preco: number }

export function realPorFase(d: Negocio, S: Estado): ObraReal | null {
  const P = planoObra(d, S);
  if (!P.tarefas.length) return null;
  let fimReal = 0;
  const fases: FaseReal[] = P.fases.map((f) => {
    const tarefas: TarefaReal[] = f.tarefas.map((t) => {
      const fator = t.chave === TAREFA_DEMOLICAO ? 1 : fatorReal(t.chave);
      return { chave: t.chave, nome: t.nome, hPrev: r2(t.h), hReal: r2(t.h * fator), fator };
    });
    const hPrev = tarefas.reduce((a, t) => a + t.hPrev, 0), hReal = tarefas.reduce((a, t) => a + t.hReal, 0);
    const extra = f.tarefas.reduce((a, t, i) => a + (tarefas[i].hReal - t.h) * t.custoHora, 0);
    const diasPrev = f.fim - f.inicio;
    const diasReal = diasPrev > 0 ? Math.max(0.5, Math.round(diasPrev * (hPrev > 0 ? hReal / hPrev : 1) * 2) / 2) : 0;
    const custoReal = r2(f.custo + extra);
    const fr: FaseReal = {
      n: f.n, nome: f.nome, curto: f.curto,
      prev: { inicio: f.inicio, dias: diasPrev, custo: f.custo },
      real: { inicio: fimReal, dias: diasReal, custo: custoReal },
      preco: f.preco, margemPrev: f.margem, margemReal: f.preco > 0 ? (f.preco - custoReal) / f.preco : 0, tarefas,
    };
    fimReal += diasReal;
    return fr;
  });
  return {
    fases, diasPrev: P.dias, diasReal: fimReal, custoPrev: P.custo, custoReal: r2(fases.reduce((a, f) => a + f.real.custo, 0)), preco: P.preco,
  };
}

/** A fase e a tarefa que mais se afastaram do previsto (em €), para dizer o que corrigir. */
export function maiorDesvio(R: ObraReal): { fase: FaseReal; tarefa: TarefaReal; euros: number } | null {
  let melhor: { fase: FaseReal; tarefa: TarefaReal; euros: number } | null = null;
  for (const f of R.fases) {
    const euros = f.real.custo - f.prev.custo;
    if (Math.abs(euros) < 1) continue;
    const tarefa = [...f.tarefas].sort((a, b) => Math.abs(b.hReal - b.hPrev) - Math.abs(a.hReal - a.hPrev))[0];
    if (!melhor || Math.abs(euros) > Math.abs(melhor.euros)) melhor = { fase: f, tarefa, euros: r2(euros) };
  }
  return melhor;
}
