// A base de exemplo da Frota na app real: própria, separada da do protótipo (o protótipo usa `olyvia-prototipo-frota`).
// Uma chave por organização (`olyvia-frota-exemplo:<orgId>`; sem organização, `olyvia-frota-exemplo:sem-organizacao`),
// para os exemplos de duas organizações no mesmo navegador não se misturarem. Mesmo desenho da loja do protótipo: cada
// ação corre numa CÓPIA e só a substitui se correr até ao fim; uma regra que recusa (ErroFrota) não muda nada. Nada
// disto escreve na base de dados. Outro separador que grave a mesma chave recarrega a base (evento `storage`).
//
// As ações reutilizadas do protótipo verificam o "perfil simulado" do protótipo. Na app real não há perfis simulados —
// quem decide é a permissão real (ver FrotaShell) — por isso a ação corre com comPerfilFrota("gestor"), que fixa o
// perfil só para essa ação, sem mexer no perfil global do protótipo.
import { useSyncExternalStore } from "react";
import { comPerfilFrota } from "@/pages/prototipo-negocios/frota/acoes";
import { ErroFrota, VERSAO_FROTA, seedFrota, type Frota } from "./index";

export const CHAVE_FROTA_EXEMPLO = "olyvia-frota-exemplo";
const SEM_ORGANIZACAO = "sem-organizacao";

/** A chave do localStorage da organização (ou a chave por omissão, sem organização). */
export const chaveFrotaExemplo = (orgId?: string | null): string => `${CHAVE_FROTA_EXEMPLO}:${orgId || SEM_ORGANIZACAO}`;

export interface ResultadoFrota<T> { ok: boolean; valor: T; erro: string }

let org: string | null = null;
let base: Frota | null = null;
const ouvintes = new Set<() => void>();
const avisar = (): void => { for (const fn of ouvintes) fn(); };

function ler(): Frota | null {
  try {
    const j = JSON.parse(localStorage.getItem(chaveFrotaExemplo(org)) || "null") as Frota | null;
    return j && j.v === VERSAO_FROTA ? j : null;
  } catch { return null; }
}
function gravar(F: Frota): void {
  try { localStorage.setItem(chaveFrotaExemplo(org), JSON.stringify(F)); } catch { /* sem storage: fica em memória */ }
}

/**
 * A organização ativa. Muda a chave e, se mudou, esquece a base em memória (a próxima leitura vem da chave nova).
 * Não avisa os ouvintes: chama-se antes de ler a base, no mesmo render de quem a lê.
 */
export function definirOrganizacaoFrotaExemplo(orgId: string | null | undefined): void {
  const n = orgId || null;
  if (n === org) return;
  org = n;
  base = null;
}

/** A base atual (a guardada neste navegador para a organização, ou os dados de exemplo na primeira leitura). */
export function lerFrotaExemplo(): Frota {
  if (!base) base = ler() ?? seedFrota();
  return base;
}

/** Outro separador gravou a mesma chave (ou limpou o storage): recarrega. */
function aoMudarStorage(e: StorageEvent): void {
  if (e.key !== null && e.key !== chaveFrotaExemplo(org)) return;
  base = null;
  avisar();
}
export function subscreverFrotaExemplo(fn: () => void): () => void {
  if (!ouvintes.size && typeof window !== "undefined") window.addEventListener("storage", aoMudarStorage);
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
    if (!ouvintes.size && typeof window !== "undefined") window.removeEventListener("storage", aoMudarStorage);
  };
}

/** Corre uma ação (como "gestor") sobre uma cópia; se acabar bem, a cópia passa a ser a base (e grava-se). Uma regra recusada devolve o erro. */
export function executarFrotaExemplo<T>(fn: (F: Frota) => T): ResultadoFrota<T> {
  const copia = structuredClone(lerFrotaExemplo());
  try {
    const valor = comPerfilFrota("gestor", () => fn(copia));
    base = copia;
    gravar(copia);
    avisar();
    return { ok: true, valor, erro: "" };
  } catch (e) {
    if (e instanceof ErroFrota) return { ok: false, valor: undefined as T, erro: e.message };
    throw e;
  }
}

/** Volta aos dados de exemplo da organização ativa ("Repor dados de exemplo" e os testes). */
export function reporFrotaExemplo(): void {
  try { localStorage.removeItem(chaveFrotaExemplo(org)); } catch { /* ignora */ }
  base = null;
  avisar();
}

export function useFrotaExemplo(): Frota {
  return useSyncExternalStore(subscreverFrotaExemplo, lerFrotaExemplo, lerFrotaExemplo);
}
