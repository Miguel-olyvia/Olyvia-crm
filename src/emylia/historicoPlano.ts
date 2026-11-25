// 25/11 (Rúben: «qualquer alteração deve ir para um histórico, porque precisamos de aprender a longo prazo: o sistema tem de aprender»).
// O antes e depois da validação (planoAntesDepois.ts) só guardava o retrato no momento de aprovar. Agora cada ação que muda um plano de
// obra (do Estúdio da obra, do Estúdio do plano, da voz, do técnico) deixa uma entrada em Negocio.obra.mudancasPlano: quando, quem, a ação, o
// estado do plano nesse momento e as mudanças, tarefa a tarefa (técnico, dias, duração, horas, fase, ordem, microtarefas, ligações, notas,
// materiais juntados, tarefas juntadas ou tiradas) e as da obra (início, estado, restrições dos técnicos). Vai com o negócio para a base
// (a parte deal:<id>), sem SQL. É daqui que se aprende o que o motor erra e o que cada gestor costuma mudar.
import type { Estado, Plano, Tarefa } from "./motor";
import { listaMicro } from "./microtarefas";
import { diferencasPlano, retratoTarefas, type Diferenca, type TarefaRetrato, type TipoDiferenca } from "./planoAntesDepois";

export type TipoAlteracao = TipoDiferenca | "nota" | "ligacoes" | "materiais" | "obra";
export interface MudancaPlano { tipo: TipoAlteracao; tarefa: string; antes?: string; depois?: string; detalhe?: string }
export interface Alteracao {
  /** quando (ISO) e quem */
  q: string; quem: string;
  /** a ação que mudou o plano (o nome da ação do motor, ex.: «trocarTec», «microtarefas») */
  acao: string;
  /** o estado do plano antes da mudança e o dia da obra (0 = o primeiro) */
  estado: Plano["estado"]; dia: number;
  mudancas: MudancaPlano[];
}
/** O tecto por obra: um plano mexido todos os dias durante meses cabe com folga; acima disto, saem as mais antigas. */
export const MAX_ALTERACOES = 3000;

/** O que se compara de cada tarefa, além do retrato da validação. */
interface Extra { nome: string; micro?: string[]; nota?: string; deps?: string[]; mats?: string[] }
export interface FotoPlano { estado: Plano["estado"]; dia: number; inicio?: string; restricoes?: string; tarefas: TarefaRetrato[]; extra: Extra[]; json: string }

const nomeDe = (T: readonly Tarefa[], i: number) => T[i]?.nome ?? `#${i + 1}`;
const microTxt = (t: Tarefa) => t.micro?.map((m) => `${m.n}${m.h ? ` (${m.h} h)` : ""}${m.dias ? ` (${m.dias} ${m.dias === 1 ? "dia" : "dias"} de espera)` : ""}`);

/** A fotografia de um plano, para comparar antes e depois de uma ação. Barata: não lê o Catálogo. */
export function fotoPlano(p: Plano): FotoPlano {
  const T = p.tasks;
  const extra = T.flatMap((t): Extra[] => t.corrige !== undefined ? [] : [{
    nome: t.nome,
    ...(t.micro ? { micro: microTxt(t) } : {}),
    ...(t.nota ? { nota: t.nota } : {}),
    ...(t.deps?.length || t.semDeps?.length ? { deps: [...(t.deps ?? []).map((i) => nomeDe(T, i)), ...(t.semDeps ?? []).map((i) => `sem ${nomeDe(T, i)}`)] } : {}),
    ...(t.mats?.length ? { mats: t.mats.map((m) => `${m.n} ${m.q} ${m.un}`) } : {}),
  }]);
  const restricoes = p.restricoes?.length ? p.restricoes.map((r) => `${r.tec}:${r.dias.join(",")}`).join("; ") : undefined;
  const f = { estado: p.estado, dia: p.dia, ...(p.inicio ? { inicio: p.inicio } : {}), ...(restricoes ? { restricoes } : {}), tarefas: retratoTarefas(p), extra };
  return { ...f, json: JSON.stringify(f) };
}

/** Junta pelo nome (a 2.ª «Pintura» com a 2.ª «Pintura»), como no antes e depois. */
function porNome<T extends { nome: string }>(l: T[]): Map<string, T> {
  const m = new Map<string, T>(), vez = new Map<string, number>();
  for (const t of l) { const k = vez.get(t.nome) ?? 0; vez.set(t.nome, k + 1); m.set(`${t.nome}#${k}`, t); }
  return m;
}

const lista = (l?: string[]) => (l?.length ? l.join(" · ") : "nenhuma");

/** O que mudou na lista de microtarefas, numa linha («+ Proteger a base · − Limpeza · nova ordem»). */
export function detalheMicro(a: string[], b: string[]): string {
  const sem = (s: string) => s.replace(/ \(.*\)$/, "");
  const na = a.map(sem), nb = b.map(sem);
  const mais = nb.filter((x) => !na.includes(x)), menos = na.filter((x) => !nb.includes(x));
  const horas = b.filter((x, i) => na.includes(nb[i]) && !a.includes(x));
  const comuns = na.filter((x) => nb.includes(x)), comunsB = nb.filter((x) => na.includes(x));
  const ordem = comuns.some((x, i) => comunsB[i] !== x);
  return [...mais.map((x) => `+ ${x}`), ...menos.map((x) => `− ${x}`), ...horas.map((x) => `tempo: ${x}`), ...(ordem ? ["nova ordem"] : [])].join(" · ");
}

/** As mudanças entre duas fotografias do mesmo plano. `p` e `S` (o plano de agora) servem só para a lista de microtarefas que havia
 *  antes da primeira mudança à mão (a da ficha do serviço ou do Infraspeak). */
export function mudancasEntre(a: FotoPlano, b: FotoPlano, nomeTec: (id: string | null) => string, p?: Plano, S?: Estado | null): MudancaPlano[] {
  if (a.json === b.json) return [];
  const out: MudancaPlano[] = [];
  if (a.estado !== b.estado) out.push({ tipo: "obra", tarefa: "Plano", antes: a.estado, depois: b.estado });
  if (a.inicio !== b.inicio) out.push({ tipo: "obra", tarefa: "Início da obra", antes: a.inicio ?? "—", depois: b.inicio ?? "—" });
  if (a.restricoes !== b.restricoes) out.push({ tipo: "obra", tarefa: "Dias dos técnicos", antes: a.restricoes ?? "sem restrições", depois: b.restricoes ?? "sem restrições" });
  // o mesmo que se compara ao validar; a ordem vê-se aqui mesmo sem o pegador (a data também muda o lugar)
  out.push(...diferencasPlano(a.tarefas, b.tarefas, nomeTec).filter((x: Diferenca) => x.tipo !== "microtarefas"));
  const A = porNome(a.extra), B = porNome(b.extra);
  const tarefas = p ? porNome(p.tasks.filter((t) => t.corrige === undefined)) : null;
  for (const [k, y] of B) {
    const x = A.get(k);
    if (!x) continue; // juntada: já está acima
    if (JSON.stringify(x.micro) !== JSON.stringify(y.micro)) {
      let antes = x.micro;
      if (!antes && p) { const t = tarefas?.get(k); if (t) antes = listaMicro({ ...t, micro: undefined, microMao: undefined }, S, p).map((m) => m.n); }
      out.push({ tipo: "microtarefas", tarefa: y.nome, antes: x.micro ? lista(x.micro) : `as da ficha${antes ? `: ${lista(antes)}` : ""}`, depois: y.micro ? lista(y.micro) : "as da ficha",
        detalhe: detalheMicro(antes ?? [], y.micro ?? []) || undefined });
    }
    if ((x.nota ?? "") !== (y.nota ?? "")) out.push({ tipo: "nota", tarefa: y.nome, antes: x.nota || "—", depois: y.nota || "—" });
    if (JSON.stringify(x.deps) !== JSON.stringify(y.deps)) out.push({ tipo: "ligacoes", tarefa: y.nome, antes: x.deps ? `depois de ${lista(x.deps)}` : "pelas datas", depois: y.deps ? `depois de ${lista(y.deps)}` : "pelas datas" });
    if (JSON.stringify(x.mats) !== JSON.stringify(y.mats)) out.push({ tipo: "materiais", tarefa: y.nome, antes: lista(x.mats), depois: lista(y.mats) });
  }
  return out;
}

/** Guarda a alteração na obra (as mais recentes no fim), dentro do tecto. */
export function guardarAlteracao(obra: { mudancasPlano?: Alteracao[] }, a: Alteracao): void {
  const l = (obra.mudancasPlano ??= []);
  l.push(a);
  if (l.length > MAX_ALTERACOES) l.splice(0, l.length - MAX_ALTERACOES);
}

/** Os rótulos de cada tipo, para a lista. */
export const ROTULO_ALTERACAO: Record<TipoAlteracao, string> = {
  juntada: "Tarefa juntada", tirada: "Tarefa tirada", tecnico: "Técnico", inicio: "Início", duracao: "Duração", horas: "Horas",
  ordem: "Lugar na lista", fase: "Fase", microtarefas: "Microtarefas", nota: "Nota para a equipa", ligacoes: "Ligações",
  materiais: "Materiais", obra: "Obra",
};

/** Os nomes das ações, como se leem na lista. */
const ACOES: Record<string, string> = {
  trocar: "Trocou o técnico", trocarTec: "Trocou o técnico", microtarefas: "Mudou as microtarefas", fixarMicrotarefas: "Fixou as microtarefas",
  moverTarefaPlano: "Mudou a tarefa", ordemTarefaPlano: "Mudou a ordem", novaTarefaPlano: "Juntou uma tarefa", novaTarefaInterna: "Juntou uma tarefa interna",
  tirarTarefaPlano: "Tirou uma tarefa", ligarTarefas: "Mudou uma ligação", ajustarTarefa: "Ajustou a tarefa", ajustarAoVivo: "Ajustou o plano",
  aprovarPlano: "Aprovou o plano", recomecarPlano: "Recomeçou o plano", inicioPlano: "Mudou o início", restricaoTecnico: "Mudou os dias de um técnico",
  replanearObra: "Replaneou a obra", refazerPlanoComAgenda: "Refez o plano com a agenda", adiar: "Adiou", adiantarPlano: "Adiantou o plano",
  dividirTarefa: "Dividiu uma tarefa", corrigirHoras: "Corrigiu as horas", ajustarHorasPelasMicro: "Ajustou as horas pelas microtarefas",
  arrancar: "Arrancou a obra", reporPlano: "Repôs o plano", reporPlanoObra: "Repôs o plano", reporTarefasPlano: "Repôs as tarefas",
  mudarAdendaDaObra: "Mudou a adenda", resolverConflitos: "Resolveu conflitos",
  agentesObra: "Um agente da Olyvia mudou o plano", fecharBuraco: "Antecipou as tarefas depois de dias sem ninguém",
};
export const rotuloAcao = (acao: string) => ACOES[acao] ?? `Mudou o plano (${acao})`;
