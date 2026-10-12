// Os registos do dia a dia da V2 funcional: chamadas registadas, notas rápidas e contactos adiados. Vivem SÓ em memória (uma store de módulo),
// nunca no Estado nem no localStorage: duram até recarregar a página, só existem na V2 funcional e "Repor a demonstração" apaga-os (esquecerDiaADia).
// A lista de registos é imutável: cada registo novo cria uma lista nova, e quem a lê (useSyncExternalStore) redesenha.
import { useSyncExternalStore } from "react";

/** O próximo passo escolhido ao registar uma chamada. */
export type PassoSeguinte = "ligar_hoje" | "ligar_amanha" | "visita" | "orcamento" | "nenhum";

export const PASSOS: readonly { id: PassoSeguinte; nome: string }[] = [
  { id: "ligar_amanha", nome: "Ligar amanhã" },
  { id: "visita", nome: "Marcar visita" },
  { id: "orcamento", nome: "Enviar orçamento" },
  { id: "nenhum", nome: "Sem próximo passo" },
  { id: "ligar_hoje", nome: "Voltar a ligar hoje" },
];

export type Registo =
  | { id: number; nome: string; tipo: "chamada"; resultado: string; nota: string; passo: PassoSeguinte }
  | { id: number; nome: string; tipo: "nota"; texto: string }
  | { id: number; nome: string; tipo: "adiar"; dias: number };

/** Um registo novo, sem o número (a store dá-o). */
export type RegistoNovo =
  | Omit<Extract<Registo, { tipo: "chamada" }>, "id">
  | Omit<Extract<Registo, { tipo: "nota" }>, "id">
  | Omit<Extract<Registo, { tipo: "adiar" }>, "id">;

const VAZIO: readonly Registo[] = [];
let registos: readonly Registo[] = VAZIO;
let seq = 0;
const ouvintes = new Set<() => void>();

const avisar = (): void => { for (const fn of ouvintes) fn(); };

/** Junta um registo (cria uma lista nova) e avisa quem está a ouvir. Devolve o registo com o número. */
export function registar(novo: RegistoNovo): Registo {
  seq += 1;
  const r = { ...novo, id: seq } as Registo;
  registos = [...registos, r];
  avisar();
  return r;
}

/** Os registos, do mais antigo para o mais recente. */
export const lerRegistos = (): readonly Registo[] => registos;

export function subscrever(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Apaga os registos (Repor a demonstração e os testes). */
export function esquecerDiaADia(): void {
  registos = VAZIO;
  avisar();
}

/** Os registos para os ecrãs da V2 funcional: redesenha quando um registo novo entra. */
export function useRegistos(): readonly Registo[] {
  return useSyncExternalStore(subscrever, lerRegistos, lerRegistos);
}
