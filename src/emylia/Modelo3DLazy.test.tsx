// 23/11: o three (o Visualizador3D) só se carrega quando se pede «Ver em 3D». Um ficheiro com um só teste, de propósito: o import do módulo simulado só acontece
// uma vez por ficheiro, e noutro ficheiro qualquer teste anterior que abrisse o 3D tornava esta prova dependente da ordem.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const ctl = vi.hoisted(() => ({ importado: false }));
vi.mock("./planta3d/Visualizador3D", () => {
  ctl.importado = true;
  return { default: () => <div data-testid="canvas3d" /> };
});

import { Modelo3DProduto } from "./Modelo3DProduto";

it("fechado não carrega o visualizador nem monta o canvas; ao abrir carrega e monta", async () => {
  render(<Modelo3DProduto nome="Sanita suspensa Rimless" sub={null} no={null} arvore={[]} />);
  expect(ctl.importado).toBe(false);
  expect(screen.queryByTestId("canvas3d")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
  expect(await screen.findByTestId("canvas3d")).toBeInTheDocument();
  expect(ctl.importado).toBe(true);
});
