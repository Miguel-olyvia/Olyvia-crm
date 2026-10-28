// CRM: a obra de um negócio (o motor: d.obra) ↔ as funções da base obra_guardar_negocio e obra_ler_negocios (migration 20261231999000).
// · A obra do motor vai inteira (emylia) e volta inteira: nada se perde na ida e volta.
// · Ao lado vai a projeção que os outros módulos leem: o estado, o início, as fases e as tarefas com as datas reais, o ofício (a chave do
//   perfil do Catálogo) e o técnico. O técnico é a pessoa do RH (t.tec é o id dela: os técnicos vêm de cat_ler_catalogo). É daqui que sai
//   a agenda de cada técnico (rh_agenda_tecnicos).
// · As datas são as da agenda da equipa (equipa/regrasAgenda.ts: datasDoPlano), para o RH e a Emylia mostrarem os mesmos dias.
import type { Negocio } from "../motor";
import { datasDoPlano } from "../equipa/regrasAgenda";
import { FASES_OBRA } from "../fasesObra";

export type EstadoObraBase = "planeada" | "em_curso" | "suspensa" | "concluida" | "cancelada";
export type EstadoTarefaBase = "por_fazer" | "em_curso" | "feita" | "validada" | "rejeitada";

export interface TarefaObraBase {
  chave: string; ordem: number; nome: string; fase: number; perfil: string | null; minutos: number;
  /** As pessoas do ofício na tarefa (a equipa do orçamento): as horas de cada uma são minutos ÷ pessoas. */
  pessoas: number;
  inicio: string | null; fim: string | null; estado: EstadoTarefaBase; pessoa: string | null;
}
export interface ObraBase {
  estado: EstadoObraBase; titulo: string; morada: string; inicio: string | null;
  fases?: { ordem: number; nome: string }[];
  /** Sem tarefas: o motor não tem plano (a base cancela a obra que houver, ou não faz nada). */
  tarefas?: TarefaObraBase[];
  emylia: Negocio["obra"];
}

/** A obra de um negócio novo (o que o motor tem antes de haver plano). */
export const obraVazia = (): Negocio["obra"] => ({ plano: null, mats: null, real: null, aprendido: false });

const ESTADO_TAREFA: Record<string, EstadoTarefaBase> = { "em curso": "em_curso", feita: "feita", validada: "validada", corrigir: "rejeitada" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function estadoDaObra(d: Negocio): EstadoObraBase {
  const p = d.obra.plano;
  if (d.perdido || d.anulado) return "cancelada";
  if (p?.estado === "em curso") return "em_curso";
  if (p?.estado === "concluída") return "concluida";
  return "planeada";
}

/** O que obra_guardar_negocio recebe. `hoje` só conta num plano do orçamento sem início marcado (começa no próximo início rápido). */
export function paraObra(d: Negocio, hoje: Date = new Date()): ObraBase {
  const p = d.obra.plano;
  const base: ObraBase = { estado: estadoDaObra(d), titulo: d.servico || d.nome, morada: d.local, inicio: null, emylia: d.obra };
  if (!p) return base;
  const datas = datasDoPlano(p, hoje);
  const equipa = p.origem === "orcamento" ? Math.max(1, d.orc?.equipa ?? 1) : 1;
  return {
    ...base,
    inicio: p.origem === "orcamento" ? datas[0] ?? p.inicio ?? null : null,
    fases: FASES_OBRA.map((f) => ({ ordem: f.n, nome: f.nome })),
    tarefas: p.tasks.map((t, i) => {
      const dur = Math.max(1, Math.ceil(t.dur));
      return {
        chave: `t${i}`, ordem: i, nome: t.nome, fase: t.fase ?? 0, perfil: t.perfilId ?? null,
        minutos: Math.max(1, Math.round(t.h * 60)), pessoas: Math.min(20, equipa),
        inicio: datas[t.dia] ?? null, fim: datas[t.dia + dur - 1] ?? datas[t.dia] ?? null,
        estado: (t.exec && ESTADO_TAREFA[t.exec.estado]) || "por_fazer",
        pessoa: t.tec && UUID.test(t.tec) ? t.tec : null,
      };
    }),
  };
}

/** A obra que a base devolve (o `emylia` de obra_ler_negocios), por cima da obra vazia: um estado antigo sem um campo fica com o vazio. */
export function obraDaBase(emylia: unknown): Negocio["obra"] {
  const o = emylia && typeof emylia === "object" ? (emylia as Partial<Negocio["obra"]>) : {};
  return { ...obraVazia(), ...o };
}
