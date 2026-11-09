// 9/11 (Rúben: «ligar ao Estúdio o catálogo de serviços, com os materiais, os consumíveis e os técnicos»). O Estúdio abre no mesmo
// separador que os Negócios (sem recarregar a app): os Negócios deixam aqui o Estado que leram da base (o Catálogo da organização, os
// técnicos do RH com as férias, os negócios com as obras marcadas) e o Estúdio lê-o. Aberto sozinho (recarregado), o Estúdio lê o Catálogo
// ele próprio (useCatalogoDoEstudio, no Estúdio). Só leitura: o Estúdio nunca grava no Estado.
import { useSyncExternalStore } from "react";
import type { Estado } from "./motor";

let vivo: { S: Estado; org: string } | null = null;
const ouvintes = new Set<() => void>();

/** Os Negócios, depois de lerem o Catálogo, a agenda e os negócios; null ao sair da organização. */
export function definirEstadoVivo(S: Estado | null, org?: string | null): void {
  vivo = S && org ? { S, org } : null;
  ouvintes.forEach((o) => o());
}
export const lerEstadoVivo = () => vivo;
export const useEstadoVivo = () =>
  useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, lerEstadoVivo, lerEstadoVivo);
