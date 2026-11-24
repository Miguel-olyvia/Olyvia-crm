// 24/11: os revestimentos na pré-visualização 3D do produto: a amostra de chão ou de parede, o rótulo visível («No chão» / «Na parede») e o interruptor
// («Ver no chão» / «Ver na parede») que muda a vista sem gravar nada. O Visualizador3D está simulado (jsdom não tem WebGL): mostra o que recebeu. O desenho em si
// (peças, juntas, textura) vê-se ao vivo; o planeamento está em planta3d/revestimentoPrevia.test.ts.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoCat } from "./planta3d/catalogo3d";

vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { descricao: string; modelos: Record<string, unknown>; camara?: { chave: string } | null;
    revestimento?: { amostra: { plano: { superficie: string; pecas: unknown[]; pecaRealCm: number[]; espessuraM: number } }; cor: string; textura?: { url: string } } | null }) => (
    <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-superficie={p.revestimento?.amostra.plano.superficie ?? "nenhuma"}
      data-pecas={p.revestimento?.amostra.plano.pecas.length ?? 0} data-peca={p.revestimento?.amostra.plano.pecaRealCm.join("x") ?? ""}
      data-espessura={p.revestimento?.amostra.plano.espessuraM ?? ""} data-textura={p.revestimento?.textura?.url ?? ""} data-cor={p.revestimento?.cor ?? ""}
      data-modelos={Object.keys(p.modelos).length} data-chave={p.camara?.chave} />
  ),
}));

import { Previa3DProduto } from "./Previa3DProduto";

afterEach(cleanup);

const ARVORE: NoCat[] = [
  { id: "rev", n: "Revestimentos", pai: null }, { id: "spc", n: "SPC", pai: "rev" }, { id: "cer", n: "Cerâmico", pai: "rev" },
  { id: "por", n: "Porcelânico", pai: "rev" }, { id: "wc", n: "Casa de banho", pai: null }, { id: "san", n: "Sanitas", pai: "wc" },
];
const SAJONIA = "Revestimento PORCELÂNICO SAJONIA NOGAL 19,5x120";
const canvas = () => screen.findByTestId("canvas3d");
const botao = (nome: string) => screen.getByRole("button", { name: nome });

describe("Previa3DProduto: revestimentos como superfície", () => {
  it("revestimento_chao escolhido: a amostra no chão, com a peça real, a textura da foto e o rótulo «No chão»", async () => {
    render(<Previa3DProduto nome={SAJONIA} sub="Porcelânico" no="por" arvore={ARVORE} modelo3d="revestimento_chao" cor="#8b5a2b"
      medidaRevestimento={{ ladoCm: [19.5, 120] }} textura={{ url: "/nogal.webp", ladoCm: 40 }} />);
    const c = await canvas();
    expect(c.getAttribute("data-superficie")).toBe("chao");
    expect(c.getAttribute("data-peca")).toBe("120x19.5");
    expect(c.getAttribute("data-textura")).toBe("/nogal.webp");
    expect(c.getAttribute("data-cor")).toBe("#8b5a2b");
    expect(c.getAttribute("data-modelos")).toBe("0"); // nada de caixa
    expect(Number(c.getAttribute("data-pecas"))).toBeGreaterThan(4);
    expect(screen.getByText("No chão")).toBeVisible();
    // já não diz que «ainda não tem desenho próprio»
    expect(screen.queryByText(/ainda não têm desenho próprio/)).toBeNull();
  });

  it("revestimento_parede escolhido: na parede, com o rótulo «Na parede»", async () => {
    render(<Previa3DProduto nome={SAJONIA} no="por" arvore={ARVORE} modelo3d="revestimento_parede" medidaRevestimento={{ ladoCm: [19.5, 120] }} />);
    expect((await canvas()).getAttribute("data-superficie")).toBe("parede");
    expect(screen.getByText("Na parede")).toBeVisible();
  });

  it("o interruptor: dois botões com aria-pressed e 44 px; muda a vista (e a câmara) sem mexer no modelo escolhido", async () => {
    render(<Previa3DProduto nome={SAJONIA} no="por" arvore={ARVORE} modelo3d="revestimento_chao" medidaRevestimento={{ ladoCm: [19.5, 120] }} />);
    const c = await canvas();
    const chao = botao("Ver no chão"), parede = botao("Ver na parede");
    for (const b of [chao, parede]) { expect(b.className).toContain("min-h-11"); expect(b).toHaveAttribute("type", "button"); }
    expect(chao).toHaveAttribute("aria-pressed", "true");
    expect(parede).toHaveAttribute("aria-pressed", "false");
    const chave = c.getAttribute("data-chave");
    fireEvent.click(parede);
    expect((await canvas()).getAttribute("data-superficie")).toBe("parede");
    expect(botao("Ver na parede")).toHaveAttribute("aria-pressed", "true");
    expect(botao("Ver no chão")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Na parede")).toBeVisible();
    expect((await canvas()).getAttribute("data-chave")).not.toBe(chave);
    fireEvent.click(botao("Ver no chão"));
    expect((await canvas()).getAttribute("data-superficie")).toBe("chao");
  });

  it("automático num Revestimento: pela subcategoria (SPC → chão, Cerâmico → parede); a Aplicação manda sobre a subcategoria", async () => {
    const { unmount } = render(<Previa3DProduto nome="Revestimento SPC AVON NOGAL 5,5mm" sub="SPC" no="spc" arvore={ARVORE} />);
    expect((await canvas()).getAttribute("data-superficie")).toBe("chao");
    unmount();
    const r2 = render(<Previa3DProduto nome="Revestimento CERÂMICO BRANCO 30x60" sub="Cerâmico" no="cer" arvore={ARVORE} />);
    expect((await canvas()).getAttribute("data-superficie")).toBe("parede");
    r2.unmount();
    render(<Previa3DProduto nome="Revestimento CERÂMICO BRANCO 30x60" sub="Cerâmico" no="cer" arvore={ARVORE} aplicacao="Pavimento" />);
    expect((await canvas()).getAttribute("data-superficie")).toBe("chao");
  });

  it("sem medida nos atributos: a do nome (30x60); sem nenhuma, 60×60 e di-lo", async () => {
    const { unmount } = render(<Previa3DProduto nome="Revestimento CERÂMICO BRANCO 30x60" no="cer" arvore={ARVORE} />);
    expect((await canvas()).getAttribute("data-peca")).toBe("60x30");
    unmount();
    render(<Previa3DProduto nome="Revestimento SPC AVON" no="spc" arvore={ARVORE} />);
    expect((await canvas()).getAttribute("data-peca")).toBe("60x60");
    expect(await screen.findByText(/Sem medida/)).toBeInTheDocument();
  });

  it("a espessura da medida do revestimento (laminado de 3,5 mm)", async () => {
    render(<Previa3DProduto nome="Cerâmico Laminado 1000x3000" no="por" arvore={ARVORE} medidaRevestimento={{ ladoCm: [100, 300], espessuraCm: 0.35 }} />);
    expect(Number((await canvas()).getAttribute("data-espessura"))).toBeCloseTo(0.0035, 6);
  });

  it("um produto que não é revestimento fica como hoje: sem amostra, sem rótulo nem interruptor", async () => {
    render(<Previa3DProduto nome="Sanita NEXO 36x65x40" sub="Sanitas" no="san" arvore={ARVORE} />);
    const c = await canvas();
    expect(c.getAttribute("data-superficie")).toBe("nenhuma");
    expect(c.getAttribute("data-modelos")).toBe("1");
    expect(screen.queryByRole("button", { name: "Ver no chão" })).toBeNull();
    expect(screen.queryByText("No chão")).toBeNull();
  });

  it("outro modelo escolhido num revestimento (a caixa): fica a caixa, sem amostra", async () => {
    render(<Previa3DProduto nome={SAJONIA} no="por" arvore={ARVORE} modelo3d="caixa" />);
    expect((await canvas()).getAttribute("data-superficie")).toBe("nenhuma");
  });
});
