// As campanhas do Marketing da V2 vivem SÓ em memória (uma store de módulo, como diaADia.ts): nunca no Estado nem no localStorage.
// Duram até recarregar a página. Cada mudança cria uma lista nova, e quem a lê (useSyncExternalStore) redesenha.
import { useSyncExternalStore } from "react";
import type { Canal } from "../toquesDocs";
import { campanhasExemplo, camposDoModelo, type Campanha, type ModeloForm } from "./campanhas";

let campanhas: readonly Campanha[] = campanhasExemplo();
let seq = 0;
const ouvintes = new Set<() => void>();
const avisar = (): void => { for (const fn of ouvintes) fn(); };

export const lerCampanhas = (): readonly Campanha[] => campanhas;

export function subscreverCampanhas(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}

/** Cria uma campanha nova (sem leads nem anúncios), com o formulário do modelo escolhido. Devolve-a. */
export function criarCampanha(nome: string, canal: Canal, modelo: ModeloForm): Campanha {
  seq += 1;
  const id = `cmp-nova-${seq}`;
  const c: Campanha = { id, nome: nome.trim(), canal, regra: { campanha: nome.trim() }, modelo, campos: camposDoModelo(modelo, id), anuncios: [], pendentes: [], aceites: [], nova: true };
  campanhas = [...campanhas, c];
  avisar();
  return c;
}

/** Muda uma campanha: `fn` recebe a campanha e devolve a nova versão (sem mexer na antiga). */
export function mudarCampanha(id: string, fn: (c: Campanha) => Campanha): void {
  campanhas = campanhas.map((c) => (c.id === id ? fn(c) : c));
  avisar();
}

/** Aceita uma submissão por rever: passa a lead da campanha. */
export function aceitarSubmissao(id: string, subId: string): void {
  mudarCampanha(id, (c) => {
    const s = c.pendentes.find((x) => x.id === subId);
    return s ? { ...c, pendentes: c.pendentes.filter((x) => x !== s), aceites: [s, ...c.aceites] } : c;
  });
}

/** Rejeita uma submissão por rever: sai da lista e não conta. */
export function rejeitarSubmissao(id: string, subId: string): void {
  mudarCampanha(id, (c) => ({ ...c, pendentes: c.pendentes.filter((x) => x.id !== subId) }));
}

/** Volta às campanhas de exemplo (os testes). */
export function esquecerCampanhas(): void {
  campanhas = campanhasExemplo();
  seq = 0;
  avisar();
}

export function useCampanhas(): readonly Campanha[] {
  return useSyncExternalStore(subscreverCampanhas, lerCampanhas, lerCampanhas);
}
