/**
 * O store da página «Organização», à parte do das fichas: ligações das pessoas (vínculo legal e centro) e o seu histórico.
 * Em memória; recarregar repõe tudo, e `repor()` das fichas repõe também este (`registarAoRepor`).
 * `reporOrganizacao()` volta ao inicial a partir do estado actual das fichas.
 */
import { useSyncExternalStore } from "react";
import { lerEstado, registarAoRepor } from "@/components/rh-exemplo/dados/loja";
import { criarEstadoOrganizacaoInicial, criarEstruturaExemplo } from "@/components/rh-exemplo/organizacao/dadosOrganizacao";
import type { EstadoOrganizacao, EstruturaOrg } from "@/components/rh-exemplo/organizacao/tipos";

/** A estrutura legal e física não se altera nesta página: é a mesma durante a sessão. */
export const ESTRUTURA_ORGANIZACAO: EstruturaOrg = criarEstruturaExemplo();

let estado: EstadoOrganizacao = criarEstadoOrganizacaoInicial(lerEstado());
const ouvintes = new Set<() => void>();

function avisar(): void {
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function lerOrganizacao(): EstadoOrganizacao {
  return estado;
}

export function subscreverOrganizacao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Substitui o estado por um novo (nunca se muta o actual). */
export function definirOrganizacao(novo: EstadoOrganizacao): void {
  estado = novo;
  avisar();
}

export function reporOrganizacao(): void {
  estado = criarEstadoOrganizacaoInicial(lerEstado());
  avisar();
}

registarAoRepor(reporOrganizacao);

export function useOrganizacao(): EstadoOrganizacao {
  return useSyncExternalStore(subscreverOrganizacao, lerOrganizacao, lerOrganizacao);
}
