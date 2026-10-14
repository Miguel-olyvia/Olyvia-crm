// O estado da Frota: uma base de exemplo própria (como a loja do Inventário), lida com useSyncExternalStore e guardada no localStorage com a
// sua chave (como o protótipo HTML). Cada ação trabalha numa CÓPIA (structuredClone) e só a substitui se correr até ao fim: uma regra que
// recusa (ErroFrota) não muda nada. Não toca no Estado do protótipo; "Repor a demonstração" chama esquecerFrota().
import { useSyncExternalStore } from "react";
import { ErroFrota } from "./base";
import { esquecerPerfilFrota } from "./perfil";
import { VERSAO_FROTA, seedFrota } from "./seed";
import type { Frota } from "./tipos";

export const CHAVE_FROTA = "olyvia-prototipo-frota";

export interface Resultado<T> { ok: boolean; valor: T; erro: string }

let base: Frota | null = null;
const ouvintes = new Set<() => void>();
const avisar = (): void => { for (const fn of ouvintes) fn(); };

function ler(): Frota | null {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE_FROTA) || "null") as Frota | null;
    return j && j.v === VERSAO_FROTA ? j : null;
  } catch { return null; }
}
function gravar(F: Frota): void {
  try { localStorage.setItem(CHAVE_FROTA, JSON.stringify(F)); } catch { /* sem storage: fica em memória */ }
}

/** A base atual (a guardada, ou os dados de exemplo na primeira leitura). */
export function lerFrota(): Frota {
  if (!base) base = ler() ?? seedFrota();
  return base;
}
export function subscreverFrota(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Corre uma ação sobre uma cópia; se acabar bem, a cópia passa a ser a base (e grava-se). Uma regra recusada devolve o erro e não muda nada. */
export function executar<T>(fn: (F: Frota) => T): Resultado<T> {
  const copia = structuredClone(lerFrota());
  try {
    const valor = fn(copia);
    base = copia;
    gravar(copia);
    avisar();
    return { ok: true, valor, erro: "" };
  } catch (e) {
    if (e instanceof ErroFrota) return { ok: false, valor: undefined as T, erro: e.message };
    throw e;
  }
}

/** O ecrã onde se estava ao sair (a página desmonta ao mudar de módulo). */
export type AbaFrota = "hoje" | "viaturas" | "atribuicoes" | "condutores" | "manutencao" | "custos" | "ocorrencias" | "documentos" | "relatorios" | "ligacoes";
let aba: AbaFrota = "hoje";
export const lerAbaFrota = (): AbaFrota => aba;
export function guardarAbaFrota(a: AbaFrota): void { aba = a; }

/** Volta aos dados de exemplo: apaga o guardado, o ecrã e o perfil simulado ("Repor a demonstração" e os testes). */
export function esquecerFrota(): void {
  try { localStorage.removeItem(CHAVE_FROTA); } catch { /* ignora */ }
  base = null;
  aba = "hoje";
  esquecerPerfilFrota();
  avisar();
}

export function useFrota(): Frota {
  return useSyncExternalStore(subscreverFrota, lerFrota, lerFrota);
}
