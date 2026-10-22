// A agenda da equipa (22/10/2026, RH › Agenda): uma linha por trabalhador (os técnicos de obra e quem tem visitas marcadas), uma coluna
// por dia, só de leitura. Regras puras (sem React), para o ecrã AgendaEquipa.tsx e os testes.
// · Tarefas de obra: as do plano de cada negócio, nos dias reais (planos do orçamento: dias úteis desde o início; planos de exemplo: as
//   datas de DIAS). As horas por dia são as da tarefa repartidas pelos dias dela e pelas pessoas do ofício (orçamento: equipa).
//   Ficam de fora os negócios perdidos ou anulados e as obras de exemplo já concluídas (não têm datas reais: o plano usa as de DIAS).
// · Visitas: as marcadas e as feitas (v{n}_data, v{n}_hora, v{n}_quem), na linha de quem as faz (um técnico, pelo primeiro nome, ou o comercial).
// · Férias: as da ficha do técnico (datas, e os dias de DIAS dos planos de exemplo) e as ausências aprovadas no RH da pessoa ligada.
// · Viatura: a atribuída nesse dia na Frota (a reserva pontual antes da permanente), nos dias com obra ou visita.
// · Os planos de exemplo usam as datas de DIAS em 2026 ("seg 13/10" → 2026-10-13), como a agenda da Frota; o dia da semana de DIAS não bate
//   com o calendário de 2026 (ex.: "sex 17/10" é um sábado): vem dos dados de exemplo.
// · Conflitos: a mesma pessoa em duas obras ou mais no mesmo dia com mais horas do que um dia de trabalho, ou em obra num dia de férias.
import { dataDeDia, type Negocio, type Plano } from "../motor";
import { inicioDoPlano } from "../preparacaoObra";
import { diasDaObra, isoDia } from "../planoObra";
import { cobre } from "../frota/regras";
import type { Atribuicao, Frota } from "../frota/tipos";
import type { FichaTecnico } from "./tecnicos";

/** As horas de um dia de trabalho. */
export const HORAS_DIA = 8;

export type TipoItem = "tarefa" | "visita" | "ferias" | "ausencia";
export interface ItemAgenda {
  tipo: TipoItem;
  titulo: string;
  sub: string;
  /** Horas desse dia (tarefas e visitas). */
  horas?: number;
  hora?: string;
  /** A obra (o id do negócio) de uma tarefa; o negócio de uma visita. */
  obra?: number; negocio?: number;
  /** O índice da tarefa no plano e a fase da obra. */
  ti?: number; fase?: number;
  /** Plano ainda por aprovar (previsto). */
  previsto?: boolean;
  /** Tarefa validada ou visita feita. */
  feito?: boolean;
}
export interface ConflitoAgenda { tipo: "obras" | "ferias"; texto: string }
export interface CelulaAgenda { data: string; itens: ItemAgenda[]; horas: number; viatura: string | null; conflitos: ConflitoAgenda[] }
export interface LinhaAgenda { id: string; nome: string; papel: string; tipo: "tecnico" | "comercial"; celulas: CelulaAgenda[] }

export interface EntradaAgenda {
  deals: readonly Negocio[];
  tecnicos: readonly FichaTecnico[];
  frota?: Frota | null;
  /** As ausências aprovadas no RH, por técnico (id): data → o nome do tipo ("Férias", "Baixa médica"). */
  ausencias?: Record<string, Record<string, string>>;
  /** O dia de hoje (o início dos planos do orçamento sem data escolhida depende dele). */
  hoje?: Date;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const doisD = (n: number) => String(n).padStart(2, "0");
const deIsoL = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
const somar = (iso: string, n: number) => { const d = deIsoL(iso); d.setDate(d.getDate() + n); return isoDia(d); };

/* ------------------------------------------------------------------ o período */
export type VistaAgenda = "semana" | "mes";
/** A segunda-feira da semana de `iso`. */
export const segundaDe = (iso: string): string => { const d = deIsoL(iso); return somar(iso, -((d.getDay() + 6) % 7)); };
/** Os dias da vista: a semana (segunda a domingo) ou o mês inteiro de `ref`. */
export function diasDoPeriodo(vista: VistaAgenda, ref: string): string[] {
  if (vista === "semana") { const s = segundaDe(ref); return Array.from({ length: 7 }, (_, i) => somar(s, i)); }
  const d = deIsoL(ref), n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${d.getFullYear()}-${doisD(d.getMonth() + 1)}-${doisD(i + 1)}`);
}
/** Anda uma semana ou um mês para a frente (+1) ou para trás (−1). */
export function moverPeriodo(vista: VistaAgenda, ref: string, passo: number): string {
  if (vista === "semana") return somar(segundaDe(ref), 7 * passo);
  const d = deIsoL(ref);
  return isoDia(new Date(d.getFullYear(), d.getMonth() + passo, 1));
}
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "seg 13/10". */
export const rotuloCurto = (iso: string): string => `${SEMANA[deIsoL(iso).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "13 a 19 de outubro de 2026" ou "outubro de 2026". */
export function tituloPeriodo(vista: VistaAgenda, dias: readonly string[]): string {
  const a = dias[0], b = dias[dias.length - 1], ma = MESES[Number(a.slice(5, 7)) - 1], mb = MESES[Number(b.slice(5, 7)) - 1];
  if (vista === "mes") return `${ma} de ${a.slice(0, 4)}`;
  return ma === mb ? `${Number(a.slice(8))} a ${Number(b.slice(8))} de ${mb} de ${b.slice(0, 4)}` : `${Number(a.slice(8))} de ${ma} a ${Number(b.slice(8))} de ${mb} de ${b.slice(0, 4)}`;
}
export const fimDeSemana = (iso: string): boolean => { const g = deIsoL(iso).getDay(); return g === 0 || g === 6; };

/* ------------------------------------------------------------------ as tarefas */
/** O plano entra na agenda? Não nos negócios perdidos ou anulados, nem nas obras de exemplo concluídas (sem datas reais). */
export function planoNaAgenda(d: Negocio): boolean {
  const p = d.obra.plano;
  if (!p || d.perdido || d.anulado) return false;
  return !(p.estado === "concluída" && p.origem !== "orcamento");
}
/** A data real ("aaaa-mm-dd") de cada dia do plano. */
export function datasDoPlano(p: Plano, hoje = new Date()): string[] {
  const n = Math.max(0, ...p.tasks.map((t) => t.dia + t.dur));
  const i = inicioDoPlano(p, hoje);
  return i ? diasDaObra(i, n).map(isoDia) : Array.from({ length: n }, (_, k) => dataDeDia(k));
}
interface TarefaDia { tec: string; data: string; item: ItemAgenda }
export function tarefasDaAgenda(deals: readonly Negocio[], hoje = new Date()): TarefaDia[] {
  const L: TarefaDia[] = [];
  for (const d of deals) {
    if (!planoNaAgenda(d)) continue;
    const p = d.obra.plano!, datas = datasDoPlano(p, hoje), equipa = p.origem === "orcamento" ? Math.max(1, d.orc?.equipa ?? 1) : 1;
    const local = d.f.localidade || d.local.split(",").pop()!.trim();
    p.tasks.forEach((t, ti) => {
      if (!t.tec) return;
      const h = r1(t.h / Math.max(1, t.dur) / equipa);
      for (let k = t.dia; k < t.dia + t.dur; k++) {
        const data = datas[k];
        if (!data) continue;
        L.push({ tec: t.tec, data, item: {
          tipo: "tarefa", titulo: `#${d.id} · ${t.nome}`, sub: `${d.nome}, ${local}${t.fase ? ` · fase ${t.fase}` : ""} · ${String(h).replace(".", ",")} h`,
          horas: h, obra: d.id, ti, fase: t.fase, previsto: p.estado === "por aprovar" || undefined, feito: t.exec?.estado === "validada" || undefined,
        } });
      }
    });
  }
  return L;
}

/* ------------------------------------------------------------------ as visitas */
/** "1 h 30" → 1,5; "45 min" → 0,75; sem duração, 1,5 h. */
export function horasDaDuracao(s: string | undefined): number {
  if (!s) return 1.5;
  const h = /(\d+)\s*h/.exec(s), m = /(\d+)\s*(?:min|m\b)|h\s*(\d+)/.exec(s);
  const total = (h ? Number(h[1]) : 0) + (m ? Number(m[1] ?? m[2]) / 60 : 0);
  return total > 0 ? r1(total) : 1.5;
}
interface VisitaDia { nome: string; papel: string; data: string; item: ItemAgenda }
export function visitasDaAgenda(deals: readonly Negocio[]): VisitaDia[] {
  const L: VisitaDia[] = [];
  for (const d of deals) {
    if (d.perdido || d.anulado) continue;
    for (const n of d.vis ?? []) {
      const f = (k: string) => d.f[`v${n}_${k}`] || "";
      const estado = f("estado") || "Marcada", data = f("data");
      if (!data || (estado !== "Marcada" && estado !== "Feita")) continue;
      const quem = f("quem") || "Rúben (comercial)", nome = quem.replace(/\s*\(.*\)\s*$/, "").trim(), papel = /\(([^)]*)\)/.exec(quem)?.[1] ?? "comercial";
      const h = horasDaDuracao(f("duracao")), local = d.f.localidade || d.local.split(",").pop()!.trim();
      L.push({ nome, papel, data, item: {
        tipo: "visita", titulo: `${f("tipo") || "Visita"} · ${d.servico}`, sub: `${d.nome}, ${local}`,
        hora: f("hora") || undefined, horas: h, negocio: d.id, feito: estado === "Feita" || undefined,
      } });
    }
  }
  return L;
}

/* ------------------------------------------------------------------ férias e viatura */
/** Os dias de férias da ficha: as datas e os dias de DIAS dos planos de exemplo. */
export const feriasDe = (t: FichaTecnico): Set<string> => new Set([...(t.feriasDatas ?? []), ...t.ferias.map(dataDeDia).filter(Boolean)]);

/** A viatura que a pessoa da Frota tem nesse dia (a reserva pontual antes da permanente): "AA-12-BC · Renault Master". */
export function viaturaNoDia(F: Frota | null | undefined, pid: string | undefined, data: string): string | null {
  if (!F || !pid) return null;
  const as = F.atrib.filter((a) => a.pid === pid && cobre(a, data));
  const a: Atribuicao | undefined = as.find((x) => x.tipo === "pontual") ?? as[0];
  const v = a && F.viaturas.find((x) => x.id === a.vid);
  return v ? `${v.mat} · ${v.marca} ${v.modelo.split(" ")[0]}` : null;
}

/* ------------------------------------------------------------------ a agenda */
/** As linhas da agenda nos `dias` pedidos: os técnicos (pela ordem da ficha) e, a seguir, quem mais tem visitas. */
export function agendaEquipa(E: EntradaAgenda, dias: readonly string[]): LinhaAgenda[] {
  const hoje = E.hoje ?? new Date(), F = E.frota ?? null, dentro = new Set(dias);
  const tarefas = tarefasDaAgenda(E.deals, hoje).filter((x) => dentro.has(x.data));
  const todas = visitasDaAgenda(E.deals), visitas = todas.filter((x) => dentro.has(x.data));
  const primeiro = (s: string) => s.split(" ")[0].toLowerCase();
  // uma visita de um técnico ("Hugo (técnico)") vai para a linha dele; as outras ficam na linha de quem as faz
  const tecDaVisita = (v: VisitaDia) => (/t[ée]cnic/i.test(v.papel) ? E.tecnicos.find((t) => primeiro(t.n) === primeiro(v.nome)) : undefined);

  const linha = (id: string, nome: string, papel: string, tipo: LinhaAgenda["tipo"], its: (data: string) => ItemAgenda[], ferias: (data: string) => ItemAgenda | null, pid?: string): LinhaAgenda => ({
    id, nome, papel, tipo,
    celulas: dias.map((data) => {
      const itens = its(data), fe = ferias(data);
      if (fe) itens.unshift(fe);
      const horas = r1(itens.reduce((a, x) => a + (x.horas ?? 0), 0));
      const obras = new Set(itens.filter((x) => x.tipo === "tarefa").map((x) => x.obra));
      const conflitos: ConflitoAgenda[] = [];
      if (obras.size >= 2 && horas > HORAS_DIA) conflitos.push({ tipo: "obras", texto: `Em ${obras.size} obras no mesmo dia: ${String(horas).replace(".", ",")} h, mais do que um dia de trabalho (${HORAS_DIA} h).` });
      if (fe && obras.size) conflitos.push({ tipo: "ferias", texto: `Tem obra marcada num dia de ${fe.tipo === "ferias" ? "férias" : fe.titulo.toLowerCase()}.` });
      // a viatura só nos dias com trabalho (obra ou visita): a atribuição permanente, todos os dias, só fazia ruído
      const trabalho = itens.some((x) => x.tipo === "tarefa" || x.tipo === "visita");
      return { data, itens, horas, viatura: trabalho ? viaturaNoDia(F, pid, data) : null, conflitos };
    }),
  });

  const L: LinhaAgenda[] = E.tecnicos.map((t) => {
    const fe = feriasDe(t), aus = E.ausencias?.[t.id] ?? {};
    const pid = F?.pessoas.find((p) => p.tec === t.id)?.id;
    return linha(t.id, t.n, `Técnico · ${t.sk}`, "tecnico",
      (data) => [
        ...tarefas.filter((x) => x.tec === t.id && x.data === data).map((x) => x.item),
        ...visitas.filter((v) => v.data === data && tecDaVisita(v)?.id === t.id).map((v) => v.item),
      ],
      (data) => (fe.has(data) ? { tipo: "ferias", titulo: "Férias", sub: "Na ficha do técnico" } : aus[data] ? { tipo: "ausencia", titulo: aus[data], sub: "Ausência aprovada no RH" } : null),
      pid);
  });
  // quem faz visitas tem sempre a sua linha (mesmo numa semana sem nenhuma), para a grelha não mudar de forma ao navegar
  const outros = [...new Set(todas.filter((v) => !tecDaVisita(v)).map((v) => v.nome))].sort((a, b) => a.localeCompare(b, "pt"));
  for (const nome of outros) {
    const papel = todas.find((v) => v.nome === nome)!.papel;
    const pid = F?.pessoas.find((p) => !p.tec && primeiro(p.nome) === primeiro(nome))?.id;
    L.push(linha("com:" + nome, nome, papel.charAt(0).toUpperCase() + papel.slice(1), "comercial",
      (data) => visitas.filter((v) => v.nome === nome && v.data === data && !tecDaVisita(v)).map((v) => v.item), () => null, pid));
  }
  return L;
}

/* ------------------------------------------------------------------ as obras de um técnico (a ficha do técnico) */
export interface ObraDoTecnico { id: number; nome: string; servico: string; estado: string; tarefas: number; horas: number; custo: number; inicio: string | null; fim: string | null }
/** As obras atuais de um técnico (os planos que entram na agenda, menos os concluídos): as tarefas dele, as horas e o custo pela ficha (`custoHora`). */
export function obrasDoTecnico(deals: readonly Negocio[], tec: string, custoHora: number, hoje = new Date()): ObraDoTecnico[] {
  const L: ObraDoTecnico[] = [];
  for (const d of deals) {
    if (!planoNaAgenda(d) || d.obra.plano!.estado === "concluída") continue;
    const p = d.obra.plano!, ts = p.tasks.filter((t) => t.tec === tec);
    if (!ts.length) continue;
    const datas = datasDoPlano(p, hoje), horas = r1(ts.reduce((a, t) => a + t.h, 0));
    const ini = Math.min(...ts.map((t) => t.dia)), fim = Math.max(...ts.map((t) => t.dia + t.dur - 1));
    L.push({ id: d.id, nome: d.nome, servico: d.servico, estado: p.estado, tarefas: ts.length, horas, custo: Math.round(horas * custoHora * 100) / 100, inicio: datas[ini] || null, fim: datas[fim] || null });
  }
  return L;
}

/** Quantos conflitos há na agenda (para o resumo em cima). */
export const contarConflitos = (L: readonly LinhaAgenda[]): number => L.reduce((a, l) => a + l.celulas.reduce((b, c) => b + c.conflitos.length, 0), 0);
