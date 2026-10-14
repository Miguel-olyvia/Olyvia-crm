// O plano da obra no orçamento (14/10/2026, pedido do Ruben: "dinâmico, interativo, com Gantt com as fases e custos e a
// previsão de duração"). Por cima do prazo previsto (ganttOrcamento.ts):
// · o calendário: os dias da obra em datas, só dias úteis (sem fins de semana nem feriados nacionais);
// · as fases da obra (fasesObra.ts) com os dias, o custo, o preço e a margem de cada uma;
// · a curva do custo acumulado: a mão de obra corre ao longo da tarefa, os materiais entram no início da sua fase.
// Funções puras, sem React.
import { linhaCalc, r2, type Estado, type Negocio } from "./motor";
import { FASES_OBRA, fasesPadrao, type FaseObra } from "./fasesObra";
import { diasPrevistos, tarefasPrevistas, type TarefaPrevista } from "./ganttOrcamento";
import { LINHA_DEMOLICAO } from "./entulho";

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

export function planoObra(d: Negocio, S: Estado): Plano {
  const o = d.orc;
  if (!o) return { tarefas: [], fases: [], dias: 0, custo: 0, preco: 0 };
  const T = tarefasPrevistas(d, S);
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
