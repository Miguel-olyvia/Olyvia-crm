// Famílias (interface): o armazém das famílias da sessão, POR ORGANIZAÇÃO, em memória do módulo. Sobrevive a mudar de separador (a página desmonta e volta a montar) e perde-se
// só ao recarregar a página: nada se grava na base nem no navegador. Cada organização tem as suas; uma não vê as da outra.
import { useCallback, useSyncExternalStore } from "react";
import type { FamiliaGuardada } from "./derivarFamilia";

const SEM_FAMILIAS: readonly FamiliaGuardada[] = [];
const porOrg = new Map<string, readonly FamiliaGuardada[]>();
const ouvintes = new Set<() => void>();
const avisar = (): void => ouvintes.forEach((f) => f());
const subscrever = (f: () => void): (() => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** As famílias da organização (a mesma lista, enquanto não mudar: serve de «snapshot»). */
export const lerFamiliasDaSessao = (org: string): readonly FamiliaGuardada[] => porOrg.get(org) ?? SEM_FAMILIAS;
export function gravarFamiliasDaSessao(org: string, lista: readonly FamiliaGuardada[]): void { porOrg.set(org, lista); avisar(); }
/** Esvazia tudo (os testes; no uso normal só o recarregar da página o faz). */
export function esvaziarArmazemFamilias(): void { porOrg.clear(); avisar(); }

/** As famílias da sessão desta organização e o modo de as mudar (recebe a lista atual e devolve a nova). */
export function useFamiliasDaSessao(org: string): [readonly FamiliaGuardada[], (mudar: (l: readonly FamiliaGuardada[]) => FamiliaGuardada[]) => void] {
  const familias = useSyncExternalStore(subscrever, () => lerFamiliasDaSessao(org));
  const mudar = useCallback((f: (l: readonly FamiliaGuardada[]) => FamiliaGuardada[]) => gravarFamiliasDaSessao(org, f(lerFamiliasDaSessao(org))), [org]);
  return [familias, mudar];
}
