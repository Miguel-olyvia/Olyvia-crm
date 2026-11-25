// 25/11 (Rúben: «queremos ter um gestor de obra a validar realmente este plano, e depois registar o histórico do antes e depois para
// aprendermos»). O plano que o motor gera do orçamento fica guardado tal como nasceu (Plano.gerado). Quando o gestor de obra o aprova, o
// negócio guarda um registo com o plano gerado, o plano validado e as diferenças, tarefa a tarefa (Negocio.obra.aprendizagem). É daqui que
// se aprende o que o motor erra: técnicos trocados, durações, horas, ordem, tarefas juntadas ou tiradas.
import type { Plano, Tarefa } from "./motor";
import { ordemDasTarefas } from "./ordemPlano";

/** Uma tarefa como estava num momento: o que o gestor pode mudar ao validar. */
export interface TarefaRetrato {
  nome: string; fase?: number; tec: string | null; dia: number; dur: number; h: number;
  /** o lugar na lista (0 = primeira), pela ordem que o Gantt mostra */
  pos: number;
  /** as microtarefas próprias desta obra (quando o gestor as mudou) */
  micro?: number; interna?: true;
  /** o gestor arrastou-a na lista (Tarefa.ordem); sem isto, o lugar vem da data */
  manual?: true;
}
export type TipoDiferenca = "juntada" | "tirada" | "tecnico" | "inicio" | "duracao" | "horas" | "ordem" | "fase" | "microtarefas";
export interface Diferenca { tipo: TipoDiferenca; tarefa: string; antes?: string; depois?: string }
export interface RegistoPlano {
  /** quando e quem */
  q: string; quem: string;
  /** «aprovado»: o gestor validou o plano; «recomeçado»: o plano mexido foi deitado fora e voltou ao do orçamento (modo de teste) */
  motivo: "aprovado" | "recomeçado";
  inicio?: string;
  gerado: TarefaRetrato[]; final: TarefaRetrato[]; diferencas: Diferenca[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** O retrato das tarefas de um plano (as tarefas de correção, que nascem da execução, ficam de fora). */
export function retratoTarefas(p: Pick<Plano, "tasks">): TarefaRetrato[] {
  const ordem = ordemDasTarefas(p), pos = new Map(ordem.map((ti, k) => [ti, k]));
  return p.tasks.flatMap((t: Tarefa, i): TarefaRetrato[] => t.corrige !== undefined ? [] : [{
    nome: t.nome, ...(t.fase !== undefined ? { fase: t.fase } : {}), tec: t.tec ?? null, dia: t.dia, dur: t.dur, h: r2(t.h ?? 0), pos: pos.get(i) ?? i,
    ...(t.micro ? { micro: t.micro.length } : {}), ...(t.interna ? { interna: true as const } : {}),
    ...(t.ordem != null ? { manual: true as const } : {}),
  }]);
}

/** O plano como nasceu, para planos gerados antes de 25/11: as tarefas do orçamento com a cópia `base` (dias, duração, horas, técnico). */
export function geradoDe(p: Plano): TarefaRetrato[] | null {
  if (p.gerado?.length) return p.gerado;
  if (!p.base?.length || p.base.length > p.tasks.length) return null;
  return p.base.map((b, i) => {
    const t = p.tasks[i];
    return { nome: t.nome, ...(t.fase !== undefined ? { fase: t.fase } : {}), tec: b.tec ?? null, dia: b.dia, dur: b.dur, h: r2(b.h ?? 0), pos: i };
  });
}

/** Junta as tarefas dos dois planos pelo nome (a 2.ª «Pintura» com a 2.ª «Pintura»): os índices mudam quando se tiram tarefas. */
function porNome(l: TarefaRetrato[]): Map<string, TarefaRetrato> {
  const m = new Map<string, TarefaRetrato>(), vez = new Map<string, number>();
  for (const t of l) { const k = vez.get(t.nome) ?? 0; vez.set(t.nome, k + 1); m.set(`${t.nome}#${k}`, t); }
  return m;
}

const dias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** As diferenças entre o plano gerado e o validado, tarefa a tarefa, pela ordem do plano validado (as tiradas no fim). */
export function diferencasPlano(gerado: TarefaRetrato[], final: TarefaRetrato[], nomeTec: (id: string | null) => string = (x) => x ?? "por atribuir"): Diferenca[] {
  const A = porNome(gerado), B = porNome(final), out: Diferenca[] = [];
  const ordemA = [...A.entries()].sort((x, y) => x[1].pos - y[1].pos).map(([k]) => k).filter((k) => B.has(k));
  const ordemB = [...B.entries()].sort((x, y) => x[1].pos - y[1].pos).map(([k]) => k).filter((k) => A.has(k));
  const lugarA = new Map(ordemA.map((k, i) => [k, i])), lugarB = new Map(ordemB.map((k, i) => [k, i]));
  for (const [k, b] of [...B.entries()].sort((x, y) => x[1].pos - y[1].pos)) {
    const a = A.get(k), n = b.nome;
    if (!a) { out.push({ tipo: "juntada", tarefa: n, depois: `${nomeTec(b.tec)} · ${dias(b.dur)} · ${b.h} h${b.interna ? " · interna" : ""}` }); continue; }
    if (a.tec !== b.tec) out.push({ tipo: "tecnico", tarefa: n, antes: nomeTec(a.tec), depois: nomeTec(b.tec) });
    if (a.dia !== b.dia) out.push({ tipo: "inicio", tarefa: n, antes: `dia ${a.dia + 1}`, depois: `dia ${b.dia + 1}` });
    if (a.dur !== b.dur) out.push({ tipo: "duracao", tarefa: n, antes: dias(a.dur), depois: dias(b.dur) });
    if (Math.abs(a.h - b.h) >= 0.01) out.push({ tipo: "horas", tarefa: n, antes: `${a.h} h`, depois: `${b.h} h` });
    if ((a.fase ?? 0) !== (b.fase ?? 0)) out.push({ tipo: "fase", tarefa: n, antes: `fase ${a.fase ?? "?"}`, depois: `fase ${b.fase ?? "?"}` });
    if ((a.micro ?? -1) !== (b.micro ?? -1) && b.micro !== undefined) out.push({ tipo: "microtarefas", tarefa: n, antes: a.micro === undefined ? "as do Catálogo" : `${a.micro}`, depois: `${b.micro}` });
    const la = lugarA.get(k), lb = lugarB.get(k);
    if (b.manual && la !== undefined && lb !== undefined && la !== lb) out.push({ tipo: "ordem", tarefa: n, antes: `${la + 1}.ª`, depois: `${lb + 1}.ª` });
  }
  for (const [k, a] of A) if (!B.has(k)) out.push({ tipo: "tirada", tarefa: a.nome, antes: `${nomeTec(a.tec)} · ${dias(a.dur)} · ${a.h} h` });
  return out;
}

/** O resumo de uma linha («5 mudanças: 2 técnicos, 1 duração, 2 horas»). */
export function resumoDiferencas(l: Diferenca[]): string {
  if (!l.length) return "Validado sem mudanças ao plano gerado";
  const NOMES: Record<TipoDiferenca, [string, string]> = {
    juntada: ["tarefa juntada", "tarefas juntadas"], tirada: ["tarefa tirada", "tarefas tiradas"], tecnico: ["técnico trocado", "técnicos trocados"],
    inicio: ["início mudado", "inícios mudados"], duracao: ["duração", "durações"], horas: ["horas mudadas", "horas mudadas"],
    ordem: ["mudança de ordem", "mudanças de ordem"], fase: ["fase mudada", "fases mudadas"], microtarefas: ["microtarefas mudadas", "microtarefas mudadas"],
  };
  const c = new Map<TipoDiferenca, number>();
  for (const x of l) c.set(x.tipo, (c.get(x.tipo) ?? 0) + 1);
  return `${l.length} ${l.length === 1 ? "mudança" : "mudanças"}: ` + [...c].map(([t, n]) => `${n} ${NOMES[t][n === 1 ? 0 : 1]}`).join(", ");
}

/** O rótulo de cada tipo, para a tabela do antes e depois. */
export const ROTULO_DIFERENCA: Record<TipoDiferenca, string> = {
  juntada: "Tarefa juntada", tirada: "Tarefa tirada", tecnico: "Técnico", inicio: "Início", duracao: "Duração", horas: "Horas",
  ordem: "Lugar na lista", fase: "Fase", microtarefas: "Microtarefas",
};

/** O registo do antes e depois de um plano (o gerado e o que está agora). Null quando não se sabe como nasceu. */
export function registoDoPlano(p: Plano, motivo: RegistoPlano["motivo"], q: string, quem: string, nomeTec?: (id: string | null) => string): RegistoPlano | null {
  const gerado = geradoDe(p);
  if (!gerado) return null;
  const final = retratoTarefas(p);
  return { q, quem, motivo, ...(p.inicio ? { inicio: p.inicio } : {}), gerado, final, diferencas: diferencasPlano(gerado, final, nomeTec) };
}
