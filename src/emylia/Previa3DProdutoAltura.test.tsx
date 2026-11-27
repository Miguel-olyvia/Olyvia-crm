// 26/11: a prop `alturaClasse` do 3D (a vista da família quer o 3D grande). Sem ela fica EXACTAMENTE a altura de hoje (h-64 sm:h-80), para a ficha do produto não mudar.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://cdn.teste/x" } }) }) } } }));
vi.mock("./planta3d/Visualizador3D", () => ({ default: () => <div data-testid="canvas3d" role="img" aria-label="3D" /> }));

import { Previa3DProduto } from "./Previa3DProduto";

afterEach(cleanup);

const grupo3d = () => screen.getByRole("group", { name: "Pré-visualização 3D do produto" });
/** A caixa do 3D: o pai do grupo focável, que é quem leva a altura. */
const caixa = () => grupo3d().parentElement!;

describe("Previa3DProduto: altura", () => {
  it("sem a prop mantém a altura de sempre (256 px, 320 px a partir de sm)", async () => {
    render(<Previa3DProduto nome="Base de duche" no={null} arvore={[]} />);
    await screen.findByTestId("canvas3d");
    expect(caixa().className).toContain("h-64");
    expect(caixa().className).toContain("sm:h-80");
  });

  it("com a prop a caixa usa a altura pedida e já não a de omissão", async () => {
    render(<Previa3DProduto nome="Base de duche" no={null} arvore={[]} alturaClasse="h-[45vh] lg:h-[34rem]" />);
    await screen.findByTestId("canvas3d");
    expect(caixa().className).toContain("h-[45vh]");
    expect(caixa().className).toContain("lg:h-[34rem]");
    expect(caixa().className).not.toContain("h-64");
    expect(caixa().className).not.toContain("sm:h-80");
  });
});
