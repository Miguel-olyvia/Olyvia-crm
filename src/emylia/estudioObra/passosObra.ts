// 23/11 (Rúben: «adicionar também botões de undo e voltar para a frente para todas as alterações feitas»). Os passos do Estúdio da obra:
// cada mudança feita aqui guarda o retrato do plano de antes e de depois. Anular repõe o de antes, refazer o de depois (pelo motor:
// reporPlanoObra, que grava na base como as outras mudanças e fica no histórico como «Anulado» / «Refeito»).
// O que já saiu da obra (o pedido ao fornecedor, a mensagem ou o aviso ao cliente, a validação de uma tarefa, os imprevistos e as adendas,
// que têm o caminho deles) não se anula pelo botão: o passo fica na lista com o porquê e o que fazer.
import type { Negocio, Tarefa } from "../motor";
import { imprevistosDe } from "../imprevistos";
import { nomeCurtoTarefa } from "./planoVivo";

/** Os campos de planeamento de uma tarefa (o que se anula). A execução (os registos do técnico, a validação) nunca se toca. */
const CAMPOS = ["nome", "dia", "dur", "h", "tec", "deps", "semDeps", "nota", "mats", "fase", "sk", "perfilId", "svcs", "nova", "q", "micro", "microMao", "interna", "ordem"] as const;
export type TarefaPlano = Partial<Pick<Tarefa, (typeof CAMPOS)[number]>>;
export interface RetratoPlano { tasks: TarefaPlano[]; estado: string; /** 23/11: os dias em que cada técnico pode vir */ restricoes?: { tec: string; dias: number[] }[] }
export interface Retrato { plano: RetratoPlano; fora: Record<string, string>; hist: number }

const tirar = (t: Tarefa): TarefaPlano => {
  const o: Record<string, unknown> = {};
  for (const k of CAMPOS) if (t[k] !== undefined) o[k] = JSON.parse(JSON.stringify(t[k]));
  return o as TarefaPlano;
};
/** O que, a mudar, já saiu da obra (cada parte pelo seu nome). */
function foraDe(d: Negocio): Record<string, string> {
  const p = d.obra.plano;
  return {
    execucao: JSON.stringify(p?.tasks.map((t) => [t.exec?.estado ?? null, t.exec?.envios?.length ?? 0]) ?? []),
    fornecedor: JSON.stringify([p?.tasks.map((t) => t.encomendado ?? null) ?? [], d.obra.ec?.ajustes ?? null]),
    imprevistos: JSON.stringify(imprevistosDe(d).map((i) => [i.id, i.estado])),
    adendas: JSON.stringify((d.adendas ?? []).map((a) => [a.n, a.estado])),
    cliente: JSON.stringify([(d.obra.chat ?? []).length, (d.obra.alteracoes ?? []).filter((a) => a.avisoCliente).length]),
    removidas: String(p?.tasks.length ?? 0),
    fecho: String(p?.estado === "concluída"),
  };
}
export function retratoDe(d: Negocio): Retrato | null {
  const p = d.obra.plano;
  if (!p) return null;
  return { plano: { tasks: p.tasks.map(tirar), estado: p.estado, ...(p.restricoes?.length ? { restricoes: JSON.parse(JSON.stringify(p.restricoes)) } : {}) }, fora: foraDe(d), hist: d.hist.length };
}

const PORQUE: Record<string, string> = {
  execucao: "A execução de uma tarefa (o registo do técnico ou a validação) não se anula aqui: corrija-a na própria tarefa.",
  fornecedor: "Já foi pedido ao fornecedor: não se anula aqui. Se sobrar, devolva-o no fim da obra (Materiais › volta ao armazém).",
  imprevistos: "Os imprevistos seguem o caminho deles (a proposta ao cliente): trate-o no próprio imprevisto.",
  adendas: "A adenda segue o caminho dela no portal do cliente: trate-a na adenda.",
  cliente: "O cliente já recebeu a mensagem ou o aviso: não se anula. Escreva-lhe a corrigir, se for preciso.",
  removidas: "Uma tarefa tirada do plano não volta pelo botão: junte-a de novo («Nova tarefa»).",
  fecho: "A obra foi encerrada: o fecho não se anula aqui.",
};

export interface Passo { n: number; texto: string; antes: RetratoPlano; depois: RetratoPlano; pode: boolean; porque?: string }

/** O passo entre dois retratos (null se nada mudou). `quando` dá a data de um dia do plano. */
export function passoEntre(d: Negocio, a: Retrato, b: Retrato, quando: (k: number) => string): Passo | null {
  const mudouPlano = JSON.stringify(a.plano) !== JSON.stringify(b.plano);
  const fora = Object.keys(b.fora).filter((k) => a.fora[k] !== b.fora[k]);
  // uma tarefa tirada do plano: as outras mudam de lugar (o número diminui)
  const removida = b.plano.tasks.length < a.plano.tasks.length;
  if (!mudouPlano && !fora.length) return null;
  const novos = d.hist.slice(0, Math.max(0, b.hist - a.hist)).map((e) => e.t.replace(/^Plano( em obra)?: /, ""));
  // o texto do histórico, com o nome curto das tarefas («nota em Demolição e remoção», não «MO Modelo … · demolição e remoção»)
  const curto = (x: string) => [...new Set(b.plano.tasks.map((t) => t.nome ?? ""))].filter((n) => n.length > 3).sort((p, q) => q.length - p.length)
    .reduce((acc, n) => acc.split(n).join(nomeCurtoTarefa(n)), x);
  const texto = novos.length ? curto(novos[novos.length - 1]) : descrever(a.plano, b.plano, quando);
  const motivo = removida ? "removidas" : fora.find((k) => k !== "removidas");
  return { n: Date.now() + Math.random(), texto, antes: a.plano, depois: b.plano, pode: !motivo, ...(motivo ? { porque: PORQUE[motivo] } : {}) };
}

/** Uma frase do que mudou no plano (quando o motor não escreveu nenhuma no histórico). */
export function descrever(a: RetratoPlano, b: RetratoPlano, quando: (k: number) => string): string {
  const out: string[] = [];
  b.tasks.forEach((t, i) => {
    const x = a.tasks[i], nome = nomeCurtoTarefa(t.nome ?? "");
    if (!x) { out.push(`Tarefa nova: ${nome}`); return; }
    if (x.dia !== t.dia) out.push(`${nome} passou de ${quando(x.dia ?? 0)} para ${quando(t.dia ?? 0)}`);
    else if (x.dur !== t.dur) out.push(`${nome}: de ${x.dur} para ${t.dur} ${t.dur === 1 ? "dia" : "dias"}`);
    else if (x.tec !== t.tec) out.push(`${nome} mudou de técnico`);
    else if (JSON.stringify(x.deps ?? []) !== JSON.stringify(t.deps ?? []) || JSON.stringify(x.semDeps ?? []) !== JSON.stringify(t.semDeps ?? [])) out.push(`${nome}: ligações mudadas`);
    else if (JSON.stringify(x.mats ?? null) !== JSON.stringify(t.mats ?? null)) out.push(`${nome}: materiais mudados`);
    else if (x.h !== t.h) out.push(`${nome}: horas mudadas`);
    else if (x.nota !== t.nota) out.push(`${nome}: nota mudada`);
  });
  if (JSON.stringify(a.restricoes ?? []) !== JSON.stringify(b.restricoes ?? [])) out.unshift("Os dias de um técnico mudaram");
  if (a.estado !== b.estado && !out.length) out.push(`Plano: ${a.estado} → ${b.estado}`);
  return out.length ? out[0] + (out.length > 1 ? ` (e mais ${out.length - 1})` : "") : "Mudança no plano";
}

/** O que um retrato repõe numa tarefa: os campos de planeamento (os que faltam no retrato saem da tarefa). */
export function porNaTarefa(t: Tarefa, r: TarefaPlano): void {
  const o = t as unknown as Record<string, unknown>;
  for (const k of CAMPOS) {
    const v = (r as Record<string, unknown>)[k];
    if (v === undefined) delete o[k]; else o[k] = JSON.parse(JSON.stringify(v));
  }
}
