// O Catálogo da V2, parte 2 (pacotes, materiais e a árvore de classificação), numa store de módulo lida com useSyncExternalStore,
// como custosStore.ts. 26/10: já não dura só até recarregar: vai para a base na parte "catalogo" da sincronização (só a diferença para
// o Catálogo de base, catalogoParte.ts). "Repor a demonstração" e a troca de organização limpam-na: reporCustos() chama reporCatalogo().
import { useSyncExternalStore } from "react";
import { catalogo0, type Catalogo } from "./catalogoModelo";
import { aplicarDiferenca, diferencaCatalogo, type ParteCatalogo } from "./catalogoParte";
import { ligarCatalogo } from "../produtosVisita";
import { porServicosCriados } from "../catalogo";

let estado: Catalogo = catalogo0();
const ouvintes = new Set<() => void>();
/** Sobe a cada mudança: a diferença para a base só se recalcula quando o Catálogo mudou. */
let versao = 0;
let base: Catalogo | null = null;
let cache: { v: number; parte: ParteCatalogo } | null = null;
const baseK = (): Catalogo => (base ??= catalogo0());
// 27/10: os serviços criados no Catálogo entram no CATALOGO_TODO (catalogo.ts) antes de a página os ler
const avisar = () => { porServicosCriados(estado.servicosCriados); versao++; ouvintes.forEach((o) => o()); };

export const lerCatalogo = (): Catalogo => estado;
/** Muda o catálogo: a função recebe uma cópia e devolve-a mexida (ou muda-a no sítio). */
export function mudarCatalogo(fn: (k: Catalogo) => Catalogo | void): Catalogo {
  const copia = structuredClone(estado);
  estado = fn(copia) || copia;
  avisar();
  return estado;
}
/** Volta a uma versão anterior (o "Anular"). */
export function porCatalogo(k: Catalogo): void {
  estado = k;
  avisar();
}
export function reporCatalogo(): void {
  estado = catalogo0();
  avisar();
}

/** 26/10: a parte "catalogo" da sincronização: o que mudou em relação ao Catálogo de base. */
export function lerParteCatalogo(): ParteCatalogo {
  if (cache?.v !== versao) cache = { v: versao, parte: diferencaCatalogo(baseK(), estado) };
  return cache.parte;
}
/** 26/10: o Catálogo que chegou de outro aparelho (ou da base, ao entrar). */
export function aplicarParteCatalogo(x: unknown): void {
  const parte = (x && typeof x === "object" ? x : {}) as ParteCatalogo;
  estado = aplicarDiferenca(baseK(), parte);
  avisar();
  cache = { v: versao, parte };
}
/** A fonte da sincronização (PrototipoNegocios.tsx), como a do Inventário. */
export const fonteCatalogo = () => ({ chave: "catalogo", ler: (): unknown => lerParteCatalogo(), aplicar: (x: unknown): void => aplicarParteCatalogo(x) });

// o motor lê o Catálogo por aqui (obrigações de produto no portão da visita), sem importar esta store
ligarCatalogo(lerCatalogo);
const subscrever = (o: () => void) => { ouvintes.add(o); return () => { ouvintes.delete(o); }; };
export const useCatalogo = (): Catalogo => useSyncExternalStore(subscrever, lerCatalogo, lerCatalogo);
