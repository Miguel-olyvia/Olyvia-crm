// O tema claro/escuro do mockup (toggleTheme), confinado ao módulo Inventário: o atributo data-theme só se põe nas raízes .inv-root. Começa pelo tema do sistema.
import { useSyncExternalStore } from "react";

export type Tema = "light" | "dark";

function inicial(): Tema {
  try { return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "light"; }
}
let atual: Tema | null = null;
const ouvintes = new Set<() => void>();
export const lerTema = (): Tema => (atual ??= inicial());
export function mudarTema(t: Tema): void { atual = t; for (const fn of ouvintes) fn(); }
export const esquecerTema = (): void => { atual = null; for (const fn of ouvintes) fn(); };
export const useTema = (): Tema => useSyncExternalStore((fn) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; }, lerTema, lerTema);
