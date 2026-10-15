/**
 * O store da troca de documentos do Portal do colaborador (de exemplo), à parte do das admissões: uma entrada por pessoa em
 * admissão, em memória. Recarregar a página repõe tudo; `repor()` do RH repõe também este (registado em `registarAoRepor`).
 * Nada aqui fala com lado nenhum. As regras vivem em `lib/portalDocumentos.ts` (puras); aqui só se guarda o resultado.
 */
import { useSyncExternalStore } from "react";
import { criarPortalInicial, type EstadoPortal } from "@/components/rh-exemplo/dados/portalDocumentosExemplo";
import { registarAoRepor } from "@/components/rh-exemplo/dados/loja";
import { PORTAL_VAZIO, type PortalPessoa, type ResultadoPortal } from "@/components/rh-exemplo/lib/portalDocumentos";

let estado: EstadoPortal = criarPortalInicial();
const ouvintes = new Set<() => void>();

function avisar(): void {
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function lerPortal(pessoaId: string): PortalPessoa {
  return estado.porPessoa[pessoaId] ?? PORTAL_VAZIO;
}

export function subscreverPortal(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Volta aos documentos de exemplo originais. */
export function reporPortalDocumentos(): void {
  estado = criarPortalInicial();
  avisar();
}

export { reporPortalDocumentos as repor };

registarAoRepor(reporPortalDocumentos);

/** O portal de uma pessoa (vazio se nunca teve trocas). */
export function usePortalDocumentos(pessoaId: string | null | undefined): PortalPessoa {
  return useSyncExternalStore(
    subscreverPortal,
    () => (pessoaId ? lerPortal(pessoaId) : PORTAL_VAZIO),
    () => (pessoaId ? lerPortal(pessoaId) : PORTAL_VAZIO),
  );
}

/** Corre uma transição pura sobre o portal de uma pessoa e guarda o resultado se for válido. */
export function aplicarPortal(pessoaId: string, fn: (p: PortalPessoa) => ResultadoPortal): ResultadoPortal {
  const resultado = fn(lerPortal(pessoaId));
  if (resultado.ok) {
    estado = { ...estado, porPessoa: { ...estado.porPessoa, [pessoaId]: resultado.portal } };
    avisar();
  }
  return resultado;
}

/** Guarda um portal já alterado (para ações que não devolvem `ResultadoPortal`, como marcar visto). */
export function gravarPortal(pessoaId: string, portal: PortalPessoa): void {
  if (lerPortal(pessoaId) === portal) return;
  estado = { ...estado, porPessoa: { ...estado.porPessoa, [pessoaId]: portal } };
  avisar();
}
