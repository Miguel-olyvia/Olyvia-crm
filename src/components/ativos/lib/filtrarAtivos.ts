/**
 * A pesquisa e o filtro por estado da lista de ativos, no ecrã (a base devolve até 2000). A pesquisa ignora maiúsculas e acentos e
 * procura no nome, código, número de série, localização, modelo do catálogo e, só quando o RH não está oculto, na pessoa.
 */
import type { Ativo } from "./tipos";

export type FiltroEstado = "ativos" | "todos" | "desativados";
export const FILTROS_ESTADO: readonly FiltroEstado[] = ["ativos", "todos", "desativados"];

export const normalizarTexto = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function passaEstado(a: Ativo, estado: FiltroEstado): boolean {
  return estado === "todos" || (estado === "ativos" ? a.estado === "ativo" : a.estado === "desativado");
}

function palheiro(a: Ativo, rhOculto: boolean): string {
  return normalizarTexto([a.nome, a.codigo, a.numSerie, a.localizacao, a.catEquipamento?.nome, rhOculto ? null : a.atribuicao?.pessoaNome].filter(Boolean).join(" "));
}

/** Os ativos do estado pedido (sem pesquisa): serve os contadores e o «N de M». */
export const doEstado = (lista: readonly Ativo[], estado: FiltroEstado): Ativo[] => lista.filter((a) => passaEstado(a, estado));

/** Os ativos do estado pedido que contêm o texto (vazio = todos). */
export function filtrarAtivos(lista: readonly Ativo[], estado: FiltroEstado, texto: string, rhOculto: boolean): Ativo[] {
  const procura = normalizarTexto(texto);
  return doEstado(lista, estado).filter((a) => procura === "" || palheiro(a, rhOculto).includes(procura));
}
