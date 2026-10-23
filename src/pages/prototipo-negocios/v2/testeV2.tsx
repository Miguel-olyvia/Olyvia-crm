// Para os testes da V2: monta um ecrã com um Ctx a sério (o motor e as ações), que se redesenha a cada ação, como o protótipo.
import { useReducer, useRef, type ReactNode } from "react";
import { vi } from "vitest";
import { acoes, type Estado } from "../motor";
import type { Ctx } from "../pecas";

export function Montar({ S, children }: { S: Estado; children: (ctx: Ctx) => ReactNode }) {
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const ref = useRef<Ctx | null>(null);
  if (!ref.current) {
    const run = (fn: () => void) => { fn(); redesenhar(); };
    ref.current = { S, A: acoes(S, vi.fn(), run), run, go: (fn) => () => run(fn), q: "", setQ: vi.fn(), repor: vi.fn() };
  }
  return <>{children(ref.current)}</>;
}

/** Os botões primários (variante por defeito do Button) dentro de um elemento. */
export const primarios = (c: HTMLElement): HTMLButtonElement[] =>
  [...c.querySelectorAll<HTMLButtonElement>("button")].filter((b) => /(^|\s)bg-primary(\s|$)/.test(b.className));
