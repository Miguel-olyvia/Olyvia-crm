import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

/**
 * Arrastar e largar para reordenar listas agrupadas (passos dentro de fases,
 * fases dentro de um modelo), com o drag nativo do browser — sem
 * dependências.
 *
 * Só se arrasta pela pega: uma linha sempre `draggable` estragava a seleção
 * de texto nos campos lá dentro. A pega liga o `draggable` da linha no
 * pointerdown e o fim do arrasto desliga-o.
 *
 * O alvo é "inserir no grupo G na posição i" (i = antes do i-ésimo item do
 * grupo; i = tamanho do grupo = no fim). Cada lista usa o seu próprio hook,
 * e os eventos só são tratados por quem tem um arrasto em curso — assim um
 * passo arrastado por cima do cabeçalho de uma fase não mexe nas fases.
 */
export interface AlvoArrasto {
  grupo: string;
  indice: number;
}

export function useArrastar(aoLargar: (id: string, alvo: AlvoArrasto) => void) {
  const [pega, setPega] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<AlvoArrasto | null>(null);
  // O último a mexer, para o realce depois de largar.
  const [recente, setRecente] = useState<string | null>(null);
  const alvoRef = useRef<AlvoArrasto | null>(null);
  const idRef = useRef<string | null>(null);

  useEffect(() => {
    if (!recente) return;
    const t = setTimeout(() => setRecente(null), 900);
    return () => clearTimeout(t);
  }, [recente]);

  // Largar a pega sem arrastar (só um clique) também desliga o draggable.
  useEffect(() => {
    if (!pega || id) return;
    const soltar = () => setPega(null);
    window.addEventListener("pointerup", soltar);
    return () => window.removeEventListener("pointerup", soltar);
  }, [pega, id]);

  const mudarAlvo = (a: AlvoArrasto | null) => {
    alvoRef.current = a;
    setAlvo((x) => (x?.grupo === a?.grupo && x?.indice === a?.indice ? x : a));
  };

  const terminar = useCallback(() => {
    idRef.current = null;
    alvoRef.current = null;
    setId(null);
    setAlvo(null);
    setPega(null);
  }, []);

  const largar = (e: DragEvent) => {
    if (!idRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const quem = idRef.current;
    const onde = alvoRef.current;
    terminar();
    if (onde) {
      aoLargar(quem, onde);
      setRecente(quem);
    }
  };

  return {
    /** O id a ser arrastado (para o esbater). */
    aArrastar: id,
    alvo,
    recente,
    marcarRecente: setRecente,
    /** A pega: liga o arrasto da linha. */
    pega: (itemId: string) => ({
      onPointerDown: () => setPega(itemId),
      style: { cursor: id === itemId ? "grabbing" : "grab", touchAction: "none" as const },
    }),
    /** A linha (ou cartão) que se arrasta e que serve de alvo. */
    item: (itemId: string, grupo: string, indice: number) => ({
      draggable: pega === itemId,
      onDragStart: (e: DragEvent) => {
        if (pega !== itemId) return;
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", itemId);
        idRef.current = itemId;
        // Deixar o browser tirar a "fotografia" antes de esbater a linha.
        requestAnimationFrame(() => setId(itemId));
      },
      onDragEnd: (e: DragEvent) => {
        e.stopPropagation();
        terminar();
      },
      onDragOver: (e: DragEvent) => {
        if (!idRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        mudarAlvo({ grupo, indice: indice + (e.clientY > r.top + r.height / 2 ? 1 : 0) });
      },
      onDrop: largar,
    }),
    /** Um grupo inteiro (ex.: uma fase vazia, ou o cabeçalho): larga no início ou no fim. */
    grupo: (grupo: string, tamanho: number, onde: "inicio" | "fim" = "fim") => ({
      onDragOver: (e: DragEvent) => {
        if (!idRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        mudarAlvo({ grupo, indice: onde === "inicio" ? 0 : tamanho });
      },
      onDrop: largar,
    }),
    /** Mostrar a linha de inserção antes do item `indice` do grupo? */
    linhaAntes: (grupo: string, indice: number) => !!id && alvo?.grupo === grupo && alvo.indice === indice,
  };
}

/** Move o elemento de `de` para `para` (posição final). */
export function moverNaLista<T>(lista: readonly T[], de: number, para: number): T[] {
  const r = [...lista];
  const [x] = r.splice(de, 1);
  r.splice(Math.max(0, Math.min(para, r.length)), 0, x);
  return r;
}

/** Preferências por utilizador (que campos se veem) — falha em silêncio sem localStorage. */
export function lerPreferencia<T>(chave: string, porDefeito: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v ? ({ ...porDefeito, ...JSON.parse(v) } as T) : porDefeito;
  } catch {
    return porDefeito;
  }
}

export function gravarPreferencia(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: fica só nesta sessão */
  }
}
