/**
 * As tarefas de obra na Agenda (30/10/2026). O plano da obra (no negócio, /negocios) atribui tarefas aos técnicos do RH e o técnico regista-as
 * no Hoje; até aqui só se viam na agenda da Emylia. A Agenda (schedule_items) passa a mostrá-las também, só de leitura.
 *
 * Fonte: `rh_agenda_tecnicos(p_org, p_de, p_ate)` (migrations 20261231999000 e 20270101370000): as pessoas, cada uma com as tarefas que se
 * cruzam com o intervalo (inicio..fim, datas). Aqui é tudo puro: o JSON da RPC passa a um evento por dia útil (sem sábados nem domingos),
 * dentro do intervalo visível, e o filtro "Ver" / recursos escolhe as pessoas.
 *
 * As pessoas do RH e os utilizadores/recursos da Agenda são identidades diferentes. A correspondência faz-se:
 *  1. pelo id: `pessoas_contas` liga a pessoa ao `anew_users.id` (o mesmo `user_id` dos recursos e do "Só a minha");
 *  2. senão pelo nome, como a agenda da Emylia (`mesmoNome` em src/emylia/equipa/pontes.ts): sem acentos nem maiúsculas, o nome inteiro, ou
 *     só o primeiro quando o nome do filtro tem uma palavra ("Rúben" = "Rúben Lopes").
 */

export type EstadoTarefaObra = "por_fazer" | "em_curso" | "feita" | "validada" | "rejeitada";

/** Uma tarefa de obra como vem da rh_agenda_tecnicos. */
export interface TarefaObraRpc {
  tarefa_id: string;
  nome: string;
  oficio: string | null;
  inicio: string;
  fim: string | null;
  estado: string;
  minutos?: number | null;
  pessoas?: number | null;
  horas_dia: number | null;
  obra_id: string | null;
  obra_codigo: string | null;
  obra_titulo: string | null;
  morada: string | null;
  obra_estado?: string | null;
  negocio_numero: number | null;
}

/** Uma pessoa da rh_agenda_tecnicos (só o que a Agenda usa). */
export interface PessoaObraRpc {
  pessoa_id: string;
  nome: string | null;
  oficios?: string[] | null;
  tarefas?: TarefaObraRpc[] | null;
}

/** Uma tarefa de obra num dia do calendário. */
export interface EventoObra {
  /** Única por tarefa, pessoa e dia (chave do React). */
  key: string;
  /** "aaaa-mm-dd", o dia do calendário. */
  dia: string;
  tarefaId: string;
  pessoaId: string;
  pessoaNome: string;
  /** "#1010 · Montagem de louças" (sem número do negócio, o código da obra). */
  titulo: string;
  nomeTarefa: string;
  oficio: string | null;
  estado: EstadoTarefaObra;
  inicio: string;
  fim: string;
  horasDia: number | null;
  obraId: string | null;
  obraCodigo: string | null;
  obraTitulo: string | null;
  morada: string | null;
  negocioNumero: number | null;
}

/** Quem se quer ver: as pessoas com um destes ids OU um destes nomes. Vários filtros juntam-se com E (o "Ver" e os recursos). */
export interface FiltroPessoasObra {
  pessoaIds: readonly string[];
  nomes: readonly string[];
}

const ESTADOS: readonly EstadoTarefaObra[] = ["por_fazer", "em_curso", "feita", "validada", "rejeitada"];
export const estadoTarefaObra = (e: string | null | undefined): EstadoTarefaObra =>
  (ESTADOS as readonly string[]).includes(e ?? "") ? (e as EstadoTarefaObra) : "por_fazer";

export const NOME_ESTADO_OBRA: Record<EstadoTarefaObra, string> = {
  por_fazer: "Por fazer", em_curso: "Em curso", feita: "Feita", validada: "Validada", rejeitada: "Rejeitada",
};

/** Feita ou validada: aparece com ✓ e esbatida. */
export const tarefaObraConcluida = (e: EstadoTarefaObra): boolean => e === "feita" || e === "validada";

/** As classes do cartão (tokens do design system: a obra é `primary`, a visita é `info`). */
export function classesEstadoObra(e: EstadoTarefaObra): string {
  if (e === "rejeitada") return "bg-warning/15 text-warning border-warning/40";
  if (tarefaObraConcluida(e)) return "bg-muted text-muted-foreground border-border opacity-80";
  return "bg-primary/10 text-primary border-primary/30";
}

/** A cor da barra da esquerda (como a cor do quadro nos schedule_items). */
export const corBarraObra = (e: EstadoTarefaObra): string =>
  e === "rejeitada" ? "hsl(var(--warning))" : tarefaObraConcluida(e) ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))";

/* ------------------------------------------------------------------ datas (locais, sem fuso: "aaaa-mm-dd") */
const pad = (n: number) => String(n).padStart(2, "0");
export const diaIso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Os dias úteis (segunda a sexta) de inicio..fim que caem em de..ate, em "aaaa-mm-dd". */
export function diasUteis(inicio: string, fim: string | null, de: string, ate: string): string[] {
  const a = deIso(inicio), b = deIso(fim || inicio), lo = deIso(de), hi = deIso(ate);
  if (!a || !b || !lo || !hi) return [];
  // fim antes do início (dados maus): só o dia do início, como o calendário faz aos schedule_items
  const fimEf = b < a ? a : b;
  const ini = a < lo ? lo : a;
  const fimV = fimEf > hi ? hi : fimEf;
  const out: string[] = [];
  for (const d = new Date(ini); d <= fimV; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(diaIso(d));
  }
  return out;
}

/* ------------------------------------------------------------------ pessoas */
const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

/** O nome do filtro (recurso, utilizador) é o desta pessoa? O nome inteiro, ou só o primeiro quando o do filtro só tem um (como a Emylia). */
export function mesmoNome(doFiltro: string, daPessoa: string): boolean {
  const a = semAcentos(doFiltro ?? ""), b = semAcentos(daPessoa ?? "");
  if (!a || !b) return false;
  return a === b || (!a.includes(" ") && a === b.split(" ")[0]);
}

export const pessoaNoFiltro = (p: Pick<PessoaObraRpc, "pessoa_id" | "nome">, f: FiltroPessoasObra): boolean =>
  f.pessoaIds.includes(p.pessoa_id) || f.nomes.some((n) => mesmoNome(n, p.nome ?? ""));

/** As pessoas que passam em todos os filtros (sem filtros: todas). */
export const filtrarPessoasObra = <P extends Pick<PessoaObraRpc, "pessoa_id" | "nome">>(pessoas: readonly P[], filtros: readonly FiltroPessoasObra[]): P[] =>
  pessoas.filter((p) => filtros.every((f) => pessoaNoFiltro(p, f)));

/* ------------------------------------------------------------------ o mapeamento */
export function tituloTarefaObra(t: Pick<TarefaObraRpc, "nome" | "negocio_numero" | "obra_codigo">): string {
  const ref = t.negocio_numero != null ? `#${t.negocio_numero}` : t.obra_codigo || "Obra";
  return `${ref} · ${t.nome || "Tarefa"}`;
}

/** As tarefas da RPC em eventos por dia útil, dentro de de..ate ("aaaa-mm-dd"), ordenados por dia, pessoa e título. */
export function eventosObra(pessoas: readonly PessoaObraRpc[] | null | undefined, de: string, ate: string): EventoObra[] {
  const out: EventoObra[] = [];
  for (const p of pessoas ?? []) {
    for (const t of p.tarefas ?? []) {
      if (!t?.tarefa_id || !t.inicio) continue;
      const estado = estadoTarefaObra(t.estado);
      const inicio = String(t.inicio).slice(0, 10);
      const fim = String(t.fim || t.inicio).slice(0, 10);
      for (const dia of diasUteis(inicio, fim, de, ate)) {
        out.push({
          key: `obra-${t.tarefa_id}-${p.pessoa_id}-${dia}`, dia, tarefaId: t.tarefa_id, pessoaId: p.pessoa_id, pessoaNome: p.nome ?? "",
          titulo: tituloTarefaObra(t), nomeTarefa: t.nome, oficio: t.oficio ?? null, estado, inicio, fim,
          horasDia: t.horas_dia == null ? null : Number(t.horas_dia), obraId: t.obra_id ?? null, obraCodigo: t.obra_codigo ?? null,
          obraTitulo: t.obra_titulo ?? null, morada: t.morada ?? null, negocioNumero: t.negocio_numero ?? null,
        });
      }
    }
  }
  return out.sort((a, b) => a.dia.localeCompare(b.dia) || a.pessoaNome.localeCompare(b.pessoaNome, "pt") || a.titulo.localeCompare(b.titulo, "pt"));
}

/** Os eventos agrupados por dia ("aaaa-mm-dd"). */
export function eventosObraPorDia(eventos: readonly EventoObra[]): Map<string, EventoObra[]> {
  const m = new Map<string, EventoObra[]>();
  for (const e of eventos) {
    const l = m.get(e.dia);
    if (l) l.push(e);
    else m.set(e.dia, [e]);
  }
  return m;
}

/** Alguém da Agenda: um utilizador (anew_users.id) e/ou um nome (o do recurso, o do utilizador). */
export interface AlvoFiltroObra {
  userId?: string | null;
  nomes?: readonly (string | null | undefined)[];
}

/**
 * O filtro de quem se escolheu na Agenda: quem tem a conta ligada a uma pessoa do RH (pessoas_contas) conta só por essa pessoa; quem não tem
 * (ou quando não se pode ler pessoas_contas) conta pelo nome.
 */
export function filtroDeAlvos(alvos: readonly AlvoFiltroObra[], pessoaDoUtilizador: ReadonlyMap<string, string>): FiltroPessoasObra {
  const pessoaIds: string[] = [], nomes: string[] = [];
  for (const a of alvos) {
    const pid = a.userId ? pessoaDoUtilizador.get(a.userId) : undefined;
    if (pid) pessoaIds.push(pid);
    else for (const n of a.nomes ?? []) if (n && n.trim()) nomes.push(n);
  }
  return { pessoaIds, nomes };
}
