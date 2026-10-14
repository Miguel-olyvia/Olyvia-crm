// O estado do Inventário nativo: uma base de exemplo em memória (um módulo, como diaADia.ts), lida com useSyncExternalStore.
// Cada ação trabalha numa CÓPIA da base e só a substitui se correr até ao fim: uma regra que recusa (ErroInv) não deixa nada a meio.
// Não toca no Estado nem no motor.ts do protótipo, não grava no localStorage e "Repor inventário" apaga-o (esquecerInventario).
import { useSyncExternalStore } from "react";
import { ErroInv, mudou } from "./base";
import { criarSeedComCarrinhas } from "./seed";
import type { AbaInv } from "./ctxInv";
import type { Inventario } from "./tipos";

/** O resultado de uma ação: `ok` com o `valor`, ou recusada com a mensagem da regra em `erro` (o protótipo não usa strictNullChecks: um tipo único evita o estreitamento). */
export interface Resultado<T> { ok: boolean; valor: T; erro: string }

let base: Inventario | null = null;
const ouvintes = new Set<() => void>();
const avisar = (): void => { for (const fn of ouvintes) fn(); };

/** A base atual (criada com os dados de exemplo na primeira leitura). */
export function lerInventario(): Inventario {
  if (!base) base = criarSeedComCarrinhas();
  return base;
}

export function subscrever(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Corre uma ação sobre uma cópia; se acabar bem, a cópia passa a ser a base e quem lê redesenha. Uma regra recusada devolve o erro e não muda nada. */
export function executar<T>(fn: (db: Inventario) => T): Resultado<T> {
  const copia = structuredClone(lerInventario());
  try {
    const valor = fn(copia);
    mudou(copia);
    base = copia;
    avisar();
    return { ok: true, valor, erro: "" };
  } catch (e) {
    if (e instanceof ErroInv) return { ok: false, valor: undefined as T, erro: e.message };
    throw e;
  }
}

/** O separador onde se estava ao sair: ao voltar ao Inventário abre aí (a página desmonta ao mudar de ecrã). */
let aba: AbaInv = "hoje";
export const lerAba = (): AbaInv => aba;
export function guardarAba(a: AbaInv): void { aba = a; }

/** Volta aos dados de exemplo (o botão "Repor inventário" e os testes). */
export function esquecerInventario(): void {
  base = null;
  aba = "hoje";
  avisar();
}

/** A base para os ecrãs: redesenha quando uma ação muda alguma coisa. */
export function useInventario(): Inventario {
  return useSyncExternalStore(subscrever, lerInventario, lerInventario);
}
