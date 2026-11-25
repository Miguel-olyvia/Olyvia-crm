// 23/11 (revisão: «ligar dependências com o dedo: pressão longa na barra e arrastar»).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(() => { cleanup(); vi.useRealTimers(); });

function abrir() {
  const x = obraDeExemplo(), p = x.d.obra.plano!;
  const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis"), rev = p.tasks.findIndex((t) => t.nome === "Revestimento de parede");
  p.tasks[mont].dia = p.tasks[rev].dia + 1;
  const ctx = { S: x.S, A: acoes(x.S, () => {}, (fn) => fn()), run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  render(<EstudioObra ctx={ctx} d={x.d} fechar={() => {}} />);
  return { ...x, p, mont, rev };
}
const pt = (x: number, y: number) => ({ pointerId: 7, pointerType: "touch", clientX: x, clientY: y, isPrimary: true });

describe("ligar com o dedo", () => {
  it("pressão longa na barra da que vem antes, arrastar até à que só começa depois: abre o «E se…?» da ligação", () => {
    vi.useFakeTimers();
    const { p, mont, rev } = abrir();
    const barra = screen.getAllByRole("button", { name: /^Revestimento de parede:/ })[0];
    const linhaAlvo = document.querySelector(`[data-linha="${mont}"]`) as HTMLElement;
    expect(linhaAlvo).toBeTruthy();
    const dfp = document.elementFromPoint;
    document.elementFromPoint = () => linhaAlvo;
    try {
      fireEvent.pointerDown(barra, pt(100, 100));
      act(() => { vi.advanceTimersByTime(500); });
      fireEvent.pointerMove(barra, pt(160, 180));
      fireEvent.pointerUp(barra, pt(160, 180));
    } finally { document.elementFromPoint = dfp; }
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    expect(within(previa).getByText(/Ligar: Montagem de móveis só começa quando Revestimento de parede acabar/)).toBeTruthy();
    expect(p.tasks[mont].deps).toBeUndefined(); // ainda nada aplicado
    void rev;
  });
  it("mexer o dedo antes do meio segundo é o arrastar de sempre (não liga)", () => {
    vi.useFakeTimers();
    abrir();
    const barra = screen.getAllByRole("button", { name: /^Revestimento de parede:/ })[0];
    fireEvent.pointerDown(barra, pt(100, 100));
    fireEvent.pointerMove(barra, pt(140, 100));
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerUp(barra, pt(140, 100));
    expect(screen.queryByRole("region", { name: "Antes de aplicar" })).toBeNull();
  });
  it("com o rato, carregar e esperar não liga (o rato usa o círculo da ponta)", () => {
    vi.useFakeTimers();
    abrir();
    const barra = screen.getAllByRole("button", { name: /^Revestimento de parede:/ })[0];
    fireEvent.pointerDown(barra, { ...pt(100, 100), pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerUp(barra, { ...pt(100, 100), pointerType: "mouse" });
    expect(screen.queryByRole("region", { name: "Antes de aplicar" })).toBeNull();
  });
});
