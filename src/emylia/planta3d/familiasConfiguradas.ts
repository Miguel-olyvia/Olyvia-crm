// Protótipo (visualizador 3D): o armazém, em memória do módulo, das famílias criadas no Configurador (página /prototipo/configurador-familias).
// A página do configurador edita-o; a planta só o lê. Não é limpo ao desmontar nenhuma página: navegando sem recarregar, as famílias guardadas
// na sessão continuam na barra de produtos. Recarregar a página perde tudo. Nada vai para a base, para o localStorage nem para o catalogoStore.
import { useSyncExternalStore } from "react";
import { paraFamilia, type FamiliaCfg } from "./configurador";
import { registarFamilias } from "./familias";

/** As rotas dos dois protótipos (a ligação entre eles vive nas duas páginas). */
export const ROTA_CONFIGURADOR = "/prototipo/configurador-familias";
export const ROTA_PLANTA_3D = "/prototipo/planta-3d";

let lista: readonly FamiliaCfg[] = [];
const ouvintes = new Set<() => void>();

export const familiasConfiguradas = (): readonly FamiliaCfg[] => lista;

/** Substitui a lista da sessão, regista-a em familias.ts (a barra de produtos lê de lá) e avisa quem está a ouvir. */
export function definirFamiliasConfiguradas(nova: readonly FamiliaCfg[]): void {
  lista = [...nova];
  registarFamilias(lista.map(paraFamilia));
  ouvintes.forEach((o) => o());
}

/** Esvazia a sessão (para testes; nenhuma página o chama ao desmontar). */
export const limparFamiliasConfiguradas = (): void => definirFamiliasConfiguradas([]);

export function subscreverFamiliasConfiguradas(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

export const useFamiliasConfiguradas = (): readonly FamiliaCfg[] => useSyncExternalStore(subscreverFamiliasConfiguradas, familiasConfiguradas, familiasConfiguradas);
