/** A fotografia de exemplo: um retrato desenhado em SVG (iniciais sobre fundo de cor), sem pedir nada a ninguém. */
import { useMemo } from "react";

const CORES = ["#0f766e", "#1d4ed8", "#9333ea", "#b45309", "#be123c"];

export function usePessoaFotografia(fotografiaAnexoId: string | null | undefined): string | null {
  return useMemo(() => {
    if (!fotografiaAnexoId) return null;
    const soma = [...fotografiaAnexoId].reduce((s, c) => s + c.charCodeAt(0), 0);
    const cor = CORES[soma % CORES.length];
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${cor}"/>` +
      `<circle cx="48" cy="38" r="18" fill="#ffffff" fill-opacity="0.85"/>` +
      `<ellipse cx="48" cy="86" rx="30" ry="22" fill="#ffffff" fill-opacity="0.85"/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [fotografiaAnexoId]);
}
