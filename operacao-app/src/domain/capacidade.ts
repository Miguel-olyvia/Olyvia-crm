/**
 * Capacidade — a procura (obras + comercial) contra a equipa, por
 * especialidade e semana. As contas pesadas são da base
 * (db/capacidade.sql, rpc_ops_capacidade); aqui só se lê o resultado:
 * o semáforo de cada célula, as frases "faltam N pessoas", e de onde vem a
 * procura de uma célula.
 */

/** Minutos de uma pessoa num dia de trabalho (o mesmo que a base usa). */
export const MINUTOS_DIA = 480;
/** Até aqui há folga; acima de 100 % falta gente. */
export const LIMIAR_APERTADO = 0.85;

export type TipoFonte = "obra" | "contrato" | "aceite" | "proposta";

export interface SemanaCapacidade {
  w: number;
  inicio: string; // AAAA-MM-DD (segunda-feira)
  dias: number; // dias úteis que contam (a semana atual só a partir de hoje)
}

export interface CelulaCapacidade {
  w: number;
  oferta: number; // minutos
  procura: number; // minutos, com o comercial pesado pela probabilidade
  certa: number; // minutos só de obras e contratos assinados
  atrasado: number; // minutos de tarefas que já deviam ter acabado
  faltam: number; // pessoas, pela procura total
}

export interface EspecialidadeCapacidade {
  id: string | null; // null = tarefas sem especialidade
  nome: string;
  pessoas: number;
  celulas: CelulaCapacidade[];
}

export interface FonteCapacidade {
  tipo: TipoFonte;
  id: string;
  codigo: string | null;
  titulo: string | null;
  prob: number; // 0–1
  minutos: number;
  celulas: { s: string | null; w: number; m: number }[];
}

export interface ResumoCapacidade {
  obras: number;
  contratos: number;
  aceites: number;
  propostas: number;
  propostas_total: number;
  erros: number;
  por_expandir?: number;
  pessoas_sem_especialidade: number;
}

export interface Capacidade {
  inicio: string;
  hoje: string;
  semanas: SemanaCapacidade[];
  especialidades: EspecialidadeCapacidade[];
  fontes: FonteCapacidade[];
  resumo: ResumoCapacidade;
  calculado_em?: string;
  em_cache?: boolean;
}

/** "Tudo" = com o comercial ponderado; "certo" = só obras e contratos. */
export type ModoProcura = "tudo" | "certo";

export type Nivel = "vazio" | "folga" | "apertado" | "falta" | "sem_gente";

export interface Avaliacao {
  nivel: Nivel;
  procura: number;
  oferta: number;
  /** procura ÷ oferta (null sem oferta). */
  ocupacao: number | null;
  /** Pessoas a mais que seriam precisas nessa semana (0 se chega). */
  faltam: number;
}

export function procuraDe(c: CelulaCapacidade, modo: ModoProcura): number {
  return modo === "certo" ? c.certa : c.procura;
}

export function avaliarCelula(c: CelulaCapacidade, dias: number, modo: ModoProcura): Avaliacao {
  const procura = procuraDe(c, modo);
  const oferta = c.oferta;
  // Arredondar ao minuto evita "faltam 1" por migalhas da distribuição.
  const excesso = Math.round(procura - oferta);
  const faltam = excesso > 0 && dias > 0 ? Math.ceil(excesso / (dias * MINUTOS_DIA)) : 0;
  if (procura < 1 && oferta < 1) return { nivel: "vazio", procura, oferta, ocupacao: null, faltam: 0 };
  if (oferta < 1) return { nivel: "sem_gente", procura, oferta, ocupacao: null, faltam };
  const ocupacao = procura / oferta;
  const nivel: Nivel = excesso > 0 ? "falta" : ocupacao > LIMIAR_APERTADO ? "apertado" : "folga";
  return { nivel, procura, oferta, ocupacao, faltam };
}

export const ROTULO_NIVEL: Record<Nivel, string> = {
  vazio: "Sem trabalho nem equipa",
  folga: "Folga",
  apertado: "Apertado",
  falta: "Falta gente",
  sem_gente: "Ninguém com a especialidade",
};

export const ROTULO_TIPO: Record<TipoFonte, string> = {
  obra: "Obra",
  contrato: "Contrato assinado",
  aceite: "Orçamento aceite",
  proposta: "Proposta enviada",
};

/** "10/11" a partir de "2026-11-10". */
export function diaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Horas arredondadas: 2 h, 1,5 h, 12 h. */
export function horas(min: number): string {
  const h = min / 60;
  if (h >= 10) return `${Math.round(h)} h`;
  const r = Math.round(h * 2) / 2;
  return `${r.toLocaleString("pt-PT")} h`;
}

export function percentagem(ocupacao: number | null): string {
  if (ocupacao == null) return "—";
  return `${Math.round(ocupacao * 100)} %`;
}

export interface Aperto {
  especialidade: string;
  especialidadeId: string | null;
  semana: SemanaCapacidade;
  avaliacao: Avaliacao;
}

/**
 * As semanas em que falta gente, pior primeiro (mais pessoas em falta, depois
 * mais cedo). Para as frases do topo: "Faltam ~2 pessoas de Canalização na
 * semana de 10/11".
 */
export function apertos(cap: Capacidade, modo: ModoProcura): Aperto[] {
  const dias = new Map(cap.semanas.map((s) => [s.w, s]));
  const out: Aperto[] = [];
  for (const e of cap.especialidades) {
    for (const c of e.celulas) {
      const s = dias.get(c.w);
      if (!s) continue;
      const a = avaliarCelula(c, s.dias, modo);
      if (a.nivel === "falta" || a.nivel === "sem_gente") {
        out.push({ especialidade: e.nome, especialidadeId: e.id, semana: s, avaliacao: a });
      }
    }
  }
  return out.sort((x, y) => y.avaliacao.faltam - x.avaliacao.faltam || x.semana.w - y.semana.w);
}

export function fraseAperto(a: Aperto): string {
  const semana = `na semana de ${diaMes(a.semana.inicio)}`;
  if (a.avaliacao.nivel === "sem_gente") {
    return `Ninguém com ${a.especialidade} e há ${horas(a.avaliacao.procura)} de trabalho ${semana}`;
  }
  const n = a.avaliacao.faltam;
  return `Faltam ~${n} ${n === 1 ? "pessoa" : "pessoas"} de ${a.especialidade} ${semana}`;
}

export interface ParteDaCelula {
  fonte: FonteCapacidade;
  minutos: number;
}

/** De onde vem a procura de uma célula (especialidade × semana), maior primeiro. */
export function composicao(
  cap: Capacidade,
  especialidadeId: string | null,
  w: number,
  modo: ModoProcura
): ParteDaCelula[] {
  const out: ParteDaCelula[] = [];
  for (const f of cap.fontes) {
    if (modo === "certo" && f.tipo !== "obra" && f.tipo !== "contrato") continue;
    const m = f.celulas
      .filter((c) => c.s === especialidadeId && c.w === w)
      .reduce((a, c) => a + c.m, 0);
    if (m > 0) out.push({ fonte: f, minutos: m });
  }
  return out.sort((a, b) => b.minutos - a.minutos);
}
