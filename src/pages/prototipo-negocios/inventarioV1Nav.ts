// Onde se está no Inventário do V1 (19/10/2026): a secção e a ficha aberta. Um módulo, para o menu lateral (fora da página) destacar a secção
// e para a página voltar ao mesmo sítio depois de se ir a outro ecrã. Sem React além do hook.
import { useSyncExternalStore } from "react";

export type SecInv = "inicio" | "stock" | "obras" | "encomendas" | "fornecedores" | "movimentos" | "carrinhas";
export type Ficha =
  | { k: "obra"; id: number } | { k: "po"; id: string } | { k: "material"; sku: string } | { k: "forn"; id: string }
  | { k: "contagem" } | { k: "novaPo"; sup?: string } | { k: "novoMat" } | { k: "novoForn" };
export interface NavInv { sec: SecInv; ficha: Ficha | null }

let nav: NavInv = { sec: "inicio", ficha: null };
const ouvintes = new Set<() => void>();
export const lerNav = (): NavInv => nav;
export function mudarNav(n: NavInv, avisar = true): void { nav = n; if (avisar) for (const f of ouvintes) f(); }
const subscrever = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export const useNavInv = (): NavInv => useSyncExternalStore(subscrever, lerNav, lerNav);
/** Abre uma secção (o menu lateral e a fila do telemóvel). */
export function abrirSecaoInv(sec: SecInv): void { mudarNav({ sec, ficha: null }); }
/** Abre uma ficha na secção em que se está. */
export function abrirFichaInv(f: Ficha): void { mudarNav({ sec: nav.sec, ficha: f }); }
/** Volta ao Início (o menu "Inventário" e repor a demonstração). */
export function esquecerInventarioV1(): void { mudarNav({ sec: "inicio", ficha: null }); }
