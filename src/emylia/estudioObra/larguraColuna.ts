// 25/11: a 1.ª coluna do plano vivo (o nome da tarefa, ou o técnico) alarga-se e estreita-se com um pegador. Cada pessoa guarda a
// sua largura neste browser, por vista. null = a largura de origem (w-32 em telemóvel, w-56 a partir de sm).
import { useCallback, useState } from "react";

export const COLUNA_MIN = 128;
export const COLUNA_MAX = 640;
const CHAVE = "olyvia.planoVivo.coluna.";

export const limitarColuna = (px: number) => Math.round(Math.min(COLUNA_MAX, Math.max(COLUNA_MIN, px)));

function ler(vista: string): number | null {
  try {
    const v = Number(window.localStorage.getItem(CHAVE + vista));
    return Number.isFinite(v) && v > 0 ? limitarColuna(v) : null;
  } catch { return null; }
}

function guardar(vista: string, px: number | null) {
  try {
    if (px == null) window.localStorage.removeItem(CHAVE + vista);
    else window.localStorage.setItem(CHAVE + vista, String(px));
  } catch { /* sem armazenamento: fica só nesta visita */ }
}

export function useLarguraColuna(vista: string): [number | null, (px: number | null) => void] {
  const [mapa, setMapa] = useState<Record<string, number | null>>({});
  const larg = vista in mapa ? mapa[vista] : ler(vista);
  const mudar = useCallback((px: number | null) => {
    const v = px == null ? null : limitarColuna(px);
    setMapa((m) => ({ ...m, [vista]: v }));
    guardar(vista, v);
  }, [vista]);
  return [larg, mudar];
}
