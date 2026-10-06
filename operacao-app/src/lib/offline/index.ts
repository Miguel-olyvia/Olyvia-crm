/**
 * Sem rede — a peça única da app: a fila, a cache e o envio automático.
 *
 * O envio corre sozinho: ao arrancar, quando a rede volta, e de 30 em 30 s
 * enquanto houver coisas por enviar.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { armazemPadrao, type Armazem } from "./armazem";
import { executarAcao } from "./executar";
import { Fila, ehErroDeRede, type AcaoOffline, type ResultadoEnvio } from "./fila";

export { ehErroDeRede } from "./fila";
export type { AcaoOffline, NovaAcao, TipoAcao } from "./fila";

let armazem: Armazem | null = null;
let fila: Fila | null = null;

export function armazemOffline(): Armazem {
  armazem ??= armazemPadrao();
  return armazem;
}

export function filaOffline(): Fila {
  fila ??= new Fila(armazemOffline(), executarAcao);
  return fila;
}

/* ─────────────────────────────── Cache ─────────────────────────────── */

interface EntradaCache<T> {
  valor: T;
  guardadoEm: string;
}

export async function guardarNaCache<T>(chave: string, valor: T): Promise<void> {
  try {
    await armazemOffline().gravar<EntradaCache<T>>("cache", chave, { valor, guardadoEm: new Date().toISOString() });
  } catch {
    // Sem espaço / sem IndexedDB: a app segue, só não terá a cópia sem rede.
  }
}

export async function lerDaCache<T>(chave: string): Promise<EntradaCache<T> | null> {
  try {
    return (await armazemOffline().ler<EntradaCache<T>>("cache", chave)) ?? null;
  } catch {
    return null;
  }
}

/* ────────────────────────────── Estado ─────────────────────────────── */

export interface EstadoOffline {
  online: boolean;
  acoes: AcaoOffline[];
  aEnviar: boolean;
  ultimo: (ResultadoEnvio & { em: number }) | null;
}

let estado: EstadoOffline = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  acoes: [],
  aEnviar: false,
  ultimo: null,
};
const ouvintes = new Set<() => void>();
const mudar = (p: Partial<EstadoOffline>) => {
  estado = { ...estado, ...p };
  for (const fn of ouvintes) fn();
};

async function relerFila() {
  try {
    mudar({ acoes: await filaOffline().listar() });
  } catch {
    /* ignora */
  }
}

/** Envia agora o que houver na fila (se houver rede). */
export async function enviarPendentes(): Promise<ResultadoEnvio | null> {
  if (!estado.online) return null;
  if ((await filaOffline().listar()).length === 0) return null;
  mudar({ aEnviar: true });
  try {
    const r = await filaOffline().processar();
    mudar({ ultimo: { ...r, em: Date.now() } });
    return r;
  } finally {
    mudar({ aEnviar: false });
    await relerFila();
  }
}

let ligado = false;
/** Liga os eventos de rede e o envio automático. Chama-se uma vez, no arranque. */
export function ligarOffline(): void {
  if (ligado || typeof window === "undefined") return;
  ligado = true;
  filaOffline().subscrever(() => void relerFila());
  window.addEventListener("online", () => {
    mudar({ online: true });
    void enviarPendentes();
  });
  window.addEventListener("offline", () => mudar({ online: false }));
  void relerFila().then(() => enviarPendentes());
  window.setInterval(() => {
    if (estado.online && estado.acoes.some((a) => a.estado === "pendente")) void enviarPendentes();
  }, 30_000);
}

export function useOffline(): EstadoOffline {
  return useSyncExternalStore(
    (fn) => {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
    () => estado,
    () => estado
  );
}

/** Para os ecrãs: a ação falhou por falta de rede (então guarda-se). */
export function semRede(e: unknown): boolean {
  return ehErroDeRede(e, estado.online && (typeof navigator === "undefined" ? true : navigator.onLine));
}

/** Uma imagem guardada (Blob) como data: URL — o CSP da app não deixa blob:. */
export function useImagemLocal(b: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!b) return;
    let vivo = true;
    const r = new FileReader();
    r.onload = () => vivo && setUrl(typeof r.result === "string" ? r.result : null);
    r.readAsDataURL(b);
    return () => {
      vivo = false;
    };
  }, [b]);
  return url;
}
