/**
 * A "base" da apresentação: um store de módulo, em memória, partilhado por todos os ecrãs de
 * Recursos Humanos de exemplo. Nada aqui fala com lado nenhum; recarregar a página repõe tudo.
 * Os hooks de dados lêem-no com `useSyncExternalStore` e as acções escrevem-no com `definirEstado`.
 * `repor()` volta ao estado inicial (usado nos testes).
 */
import { useSyncExternalStore } from "react";
import { criarEstadoInicial } from "@/components/rh-exemplo/dados/exemplo";
import type { EstadoRh, FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";

let estado: EstadoRh = criarEstadoInicial();
let contador = 0;
const ouvintes = new Set<() => void>();

function avisar(): void {
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function lerEstado(): EstadoRh {
  return estado;
}

export function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Substitui o estado por uma cópia alterada (nunca se muta o estado actual). */
export function definirEstado(alterar: (actual: EstadoRh) => EstadoRh): void {
  estado = alterar(estado);
  avisar();
}

/** Altera a ficha de uma pessoa; ignora um id que não exista. */
export function atualizarFicha(pessoaId: string, alterar: (ficha: FichaRh) => FichaRh): void {
  definirEstado((actual) => {
    const ficha = actual.fichas[pessoaId];
    if (!ficha) return actual;
    return { ...actual, fichas: { ...actual.fichas, [pessoaId]: alterar(ficha) } };
  });
}

const aoReporOuvintes = new Set<() => void>();

/** Para um store à parte (como o das admissões) voltar ao início sempre que `repor()` repõe as fichas. */
export function registarAoRepor(ouvinte: () => void): void {
  aoReporOuvintes.add(ouvinte);
}

/** Volta aos dados de exemplo originais. */
export function repor(): void {
  estado = criarEstadoInicial();
  contador = 0;
  aoReporOuvintes.forEach((ouvinte) => ouvinte());
  avisar();
}

/** Um identificador novo, estável dentro da sessão. */
export function novoId(prefixo: string): string {
  contador += 1;
  return `${prefixo}-novo-${contador}`;
}

/** Lê uma fatia do estado. O selector tem de devolver sempre a mesma referência se nada mudou. */
export function useEstadoRh<T>(selector: (e: EstadoRh) => T): T {
  return useSyncExternalStore(subscrever, () => selector(estado), () => selector(estado));
}

/** A ficha de uma pessoa (ou `null`). */
export function useFichaRh(pessoaId: string | null | undefined): FichaRh | null {
  return useEstadoRh((e) => (pessoaId ? (e.fichas[pessoaId] ?? null) : null));
}
