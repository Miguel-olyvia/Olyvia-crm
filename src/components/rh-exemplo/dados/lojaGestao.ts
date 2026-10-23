/**
 * O store da gestão de RH de exemplo, à parte do das fichas (`loja.ts`): picagens, faltas, desvios, cláusulas,
 * processamento salarial, configuração da admissão e regras de fim de contrato. Em memória; recarregar repõe tudo.
 * `reporGestao()` volta ao inicial a partir do estado actual das fichas (usar depois de `repor()` nos testes).
 */
import { useSyncExternalStore } from "react";
import { criarGestaoInicial } from "@/components/rh-exemplo/dados/gestaoExemplo";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import type { EstadoGestao } from "@/components/rh-exemplo/dados/tiposGestao";

let estado: EstadoGestao = criarGestaoInicial(lerEstado());
let contador = 0;
const ouvintes = new Set<() => void>();

function avisar(): void {
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function lerGestao(): EstadoGestao {
  return estado;
}

export function subscreverGestao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Substitui o estado por uma cópia alterada (nunca se muta o estado actual). */
export function definirGestao(alterar: (actual: EstadoGestao) => EstadoGestao): void {
  estado = alterar(estado);
  avisar();
}

export function reporGestao(): void {
  estado = criarGestaoInicial(lerEstado());
  contador = 0;
  avisar();
}

/** Um identificador novo, estável dentro da sessão. */
export function novoIdGestao(prefixo: string): string {
  contador += 1;
  return `${prefixo}-g${contador}`;
}

/** Lê uma fatia do estado. O selector tem de devolver sempre a mesma referência se nada mudou. */
export function useGestao<T>(selector: (e: EstadoGestao) => T): T {
  return useSyncExternalStore(subscreverGestao, () => selector(estado), () => selector(estado));
}
