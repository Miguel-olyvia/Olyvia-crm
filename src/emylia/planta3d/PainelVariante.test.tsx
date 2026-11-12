// As opções do painel da variante: os GLB completos do fabricante não trazem dock nem direcção, por isso não há «bica extraída» (e a Cira não tem bica giratória).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PecaPlanta } from "../planta";
import { PainelVariante } from "./PainelVariante";

afterEach(cleanup);
const peca = (fam: string, med: string, acab: string): PecaPlanta => ({ id: "p1", tipo: "movel", x: 0, y: 0, w: 10, h: 10, fam, med, acab });
const montar = (p: PecaPlanta) => render(<PainelVariante peca={p} onMudar={vi.fn()} onMontagem={vi.fn()} onOpcao={vi.fn()} />);
const extraida = () => screen.queryByLabelText(/Bica extraída/);
const bica = () => screen.queryByLabelText("Rodar a bica, em graus");

describe("PainelVariante: opções dos modelos do fabricante", () => {
  it("Smooth com GLB do fabricante (cromo): roda a bica, mas não extrai", () => {
    montar(peca("smooth", "unica", "chrome"));
    expect(bica()).toBeInTheDocument(); expect(extraida()).not.toBeInTheDocument();
  });
  it("Round, sem GLB do fabricante: o modelo antigo mantém a rotação e a extracção da bica", () => {
    montar(peca("round", "unica", "chrome"));
    expect(bica()).toBeInTheDocument(); expect(extraida()).toBeInTheDocument();
  });
  it("Cira com GLB do fabricante: sem bica giratória e sem extracção", () => {
    montar(peca("cira", "unica", "chrome"));
    expect(bica()).not.toBeInTheDocument(); expect(extraida()).not.toBeInTheDocument();
  });
  it("Ambar e Keran com GLB: as tampas e o escorredor reverso continuam", () => {
    montar(peca("ambar", "ambar100", "negro"));
    expect(screen.getByLabelText(/Retirar as tampas dos ralos/)).toBeInTheDocument();
    cleanup();
    montar(peca("keran", "keran100", "inox"));
    expect(screen.getByLabelText(/Escorredor à esquerda/)).toBeInTheDocument();
  });
});
