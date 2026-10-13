// O que o Hoje da V2 guarda: as tarefas (sempre ligadas a uma pessoa e, quando há, ao negócio) e as visitas marcadas na linha
// quando o motor não as pode registar (pessoas de exemplo, ou um negócio que ainda não passou o portão do Contacto).
// Vive SÓ em memória (uma store de módulo, como diaADia.ts): dura até recarregar, nunca entra no Estado nem no localStorage.
// "Repor a demonstração" não a apaga, porque esse botão vive em PrototipoNegocios.tsx (que não é deste trabalho): ver esquecerHojeV2.
import { useSyncExternalStore } from "react";

/** As tarefas escolhem-se, não se escrevem: "Outro…" é a única que pede um texto curto. */
export const TITULOS_TAREFA = ["Ligar", "Enviar orçamento", "Confirmar visita", "Outro…"] as const;
export type TituloTarefa = (typeof TITULOS_TAREFA)[number];
export const OUTRO: TituloTarefa = "Outro…";

/** Para quando: hoje, amanhã ou daqui a 3 dias (contados a partir do "hoje" fixo do protótipo). */
export const QUANDO_TAREFA: readonly { dias: number; nome: string }[] = [
  { dias: 0, nome: "Hoje" }, { dias: 1, nome: "Amanhã" }, { dias: 3, nome: "Em 3 dias" },
];

export interface TarefaV2 {
  id: number;
  /** A pessoa a quem a tarefa diz respeito (obrigatório: não há tarefas soltas). */
  nome: string;
  /** O negócio da seed (abre a página dele); `null` numa pessoa de exemplo, sem página própria. */
  dealId: number | null;
  servico: string;
  titulo: string;
  /** Daqui a quantos dias, a contar do "hoje" do protótipo. */
  dias: number;
  feita: boolean;
}

export interface VisitaV2 {
  id: number;
  nome: string;
  dealId: number | null;
  servico: string;
  /** "15/10" */
  dia: string;
  /** "qui 15/10" */
  rotulo: string;
  hora: string;
}

export interface DadosHojeV2 { tarefas: readonly TarefaV2[]; visitas: readonly VisitaV2[] }

const VAZIO: DadosHojeV2 = { tarefas: [], visitas: [] };
let dados: DadosHojeV2 = VAZIO;
let seq = 0;
const ouvintes = new Set<() => void>();
const avisar = (): void => { for (const fn of ouvintes) fn(); };

/** Junta uma tarefa (cria uma lista nova) e devolve-a com o número. */
export function juntarTarefa(t: Omit<TarefaV2, "id" | "feita">): TarefaV2 {
  seq += 1;
  const nova: TarefaV2 = { ...t, id: seq, feita: false };
  dados = { ...dados, tarefas: [...dados.tarefas, nova] };
  avisar();
  return nova;
}

/** Marca a tarefa como feita (ou volta a abri-la). */
export function concluirTarefa(id: number, feita = true): void {
  dados = { ...dados, tarefas: dados.tarefas.map((t) => (t.id === id ? { ...t, feita } : t)) };
  avisar();
}

/** Guarda a visita marcada na linha. Uma pessoa tem no máximo uma visita guardada aqui: a nova substitui a anterior. */
export function guardarVisita(v: Omit<VisitaV2, "id">): VisitaV2 {
  seq += 1;
  const nova: VisitaV2 = { ...v, id: seq };
  dados = { ...dados, visitas: [...dados.visitas.filter((x) => x.nome !== v.nome), nova] };
  avisar();
  return nova;
}

export const lerHojeV2 = (): DadosHojeV2 => dados;

export function subscreverHojeV2(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Apaga as tarefas e as visitas guardadas (os testes; e quem um dia ligar "Repor a demonstração" a isto). */
export function esquecerHojeV2(): void {
  dados = VAZIO;
  avisar();
}

export function useHojeV2(): DadosHojeV2 {
  return useSyncExternalStore(subscreverHojeV2, lerHojeV2, lerHojeV2);
}
