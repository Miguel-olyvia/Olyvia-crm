// 5/11 (Rúben, a visita real): a planta no ecrã. Mudar uma parede grava a planta no negócio; «Usar nas medidas» põe os m² nas medidas.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlantaDivisao } from "./PlantaDivisao";
import { lerPlanta, retangulo } from "./planta";
import type { Ctx } from "./pecas";
import type { Negocio } from "./motor";

afterEach(cleanup);

function montar(f: Record<string, string> = {}) {
  const campo = vi.fn((_id: number, k: string, v: string) => { d.f[k] = v; });
  const d = { id: 3, f: { ...f }, visita: { med: {} } } as unknown as Negocio;
  const ctx = { A: { campo }, run: (fn: () => void) => fn() } as unknown as Ctx;
  render(<PlantaDivisao ctx={ctx} d={d} divisao="Casa de banho" />);
  return { d, campo };
}

describe("PlantaDivisao", () => {
  it("começa num retângulo que fecha e mostra os m² do chão", () => {
    montar();
    expect(screen.getByText("A planta fecha.")).toBeInTheDocument();
    expect(screen.getByText("3 m²")).toBeInTheDocument();
  });

  it("mudar uma parede grava a planta no negócio; se não fecha, diz quanto falta e não deixa usar", () => {
    const { d } = montar();
    const p1 = screen.getByLabelText("Parede 1");
    fireEvent.change(p1, { target: { value: "250" } });
    fireEvent.blur(p1);
    expect(lerPlanta(d.f.planta)?.paredes[0].c).toBe(250);
    expect(screen.getByText("A planta ainda não fecha: faltam 50 cm até ao canto de partida.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usar nas medidas" })).toBeDisabled();
  });

  it("«Usar nas medidas» põe o chão e as paredes (pé-direito da visita, sem a porta) nas medidas", () => {
    const { d } = montar({ diag_pe_direito_m: "2,5 m", planta: JSON.stringify({ paredes: retangulo(234, 177), pecas: [] }) });
    fireEvent.click(screen.getByRole("button", { name: /Porta/ }));
    fireEvent.click(screen.getByRole("button", { name: "Usar nas medidas" }));
    const med = (d as unknown as { visita: { med: Record<string, number> } }).visita.med;
    expect(med.pav).toBe(4.14);
    expect(med.par).toBe(Math.round((8.22 * 2.5 - 0.8 * 2) * 100) / 100);
    expect(screen.getByText(/Nas medidas: chão 4,14 m² e paredes/)).toBeInTheDocument();
  });

  it("uma peça junta-se, mexe-se com as setas e tira-se", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Sanita$/ }));
    const peca = screen.getByRole("button", { name: /^Sanita, 36 por 55 cm/ });
    const x0 = lerPlanta(d.f.planta)!.pecas[0].x;
    fireEvent.keyDown(peca, { key: "ArrowRight" });
    expect(lerPlanta(d.f.planta)!.pecas[0].x).toBe(x0 + 5);
    fireEvent.click(screen.getByRole("button", { name: "Tirar" }));
    expect(lerPlanta(d.f.planta)!.pecas).toEqual([]);
  });
});
