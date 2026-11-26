// Os seletores da vista da família: bolinhas de cor (o nome escrito sempre) e botões de escolha simples. Grupos de rádio com teclado (setas), foco visível,
// alvos de 44 px e só as opções que recebem (as que existem na família).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt", setLanguage: () => undefined }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ getPublicUrl: (c: string) => ({ data: { publicUrl: `https://cdn.teste/${c}` } }) }) } } }));

import type { OpcaoEixo } from "./escolhaVariacao";
import { SeletorBotoes, SeletorCor } from "./SeletoresVariacao";

afterEach(cleanup);

const COR: OpcaoEixo[] = [
  { valor: "GRIS", nome: "GRIS", hex: "#A3A3A3", foto: null, ordem: 1 },
  { valor: "GRIS MEDIO", nome: "GRIS MEDIO", hex: "#A3A3A3", foto: null, ordem: 2 },
  { valor: "NEGRO", nome: "NEGRO", hex: "#222222", foto: null, ordem: 3 },
];
const TEX: OpcaoEixo[] = [{ valor: "Liso", nome: "Liso", hex: null, foto: null, ordem: 1 }, { valor: "Pizarra", nome: "Pizarra", hex: null, foto: null, ordem: 2 }];

describe("SeletorCor", () => {
  it("um grupo com nome, uma bolinha por opção recebida e o nome da cor escolhida escrito (normalizado)", () => {
    render(<SeletorCor rotulo="Cor" opcoes={COR} valor="NEGRO" aoEscolher={() => undefined} />);
    expect(screen.getByRole("radiogroup", { name: "Cor" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["Gris", "Gris medio", "Negro"]);
    expect(screen.getByRole("radio", { name: "Negro" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Cor: Negro")).toBeTruthy();
  });

  it("a bolinha leva a cor da opção e tem pelo menos 44 px", () => {
    render(<SeletorCor rotulo="Cor" opcoes={COR} valor="GRIS" aoEscolher={() => undefined} />);
    const b = screen.getByRole("radio", { name: "Negro" });
    expect(b.className).toContain("min-h-11");
    expect(b.className).toContain("min-w-11");
    expect(b.querySelector<HTMLElement>("[data-amostra]")?.style.backgroundColor).toBe("rgb(34, 34, 34)");
  });

  it("clicar escolhe", () => {
    const aoEscolher = vi.fn();
    render(<SeletorCor rotulo="Cor" opcoes={COR} valor="GRIS" aoEscolher={aoEscolher} />);
    fireEvent.click(screen.getByRole("radio", { name: "Negro" }));
    expect(aoEscolher).toHaveBeenCalledWith("NEGRO");
  });

  it("só a escolhida entra na ordem do Tab; as setas mudam de opção (com volta ao princípio)", () => {
    const aoEscolher = vi.fn();
    render(<SeletorCor rotulo="Cor" opcoes={COR} valor="NEGRO" aoEscolher={aoEscolher} />);
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Negro" }), { key: "ArrowRight" });
    expect(aoEscolher).toHaveBeenLastCalledWith("GRIS");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Negro" }), { key: "ArrowLeft" });
    expect(aoEscolher).toHaveBeenLastCalledWith("GRIS MEDIO");
  });

  it("ao passar o rato ou focar uma bolinha o nome dela aparece, com o aviso de tom repetido (Gris e Gris medio têm o mesmo hex)", () => {
    render(<SeletorCor rotulo="Cor" opcoes={COR} valor="NEGRO" aoEscolher={() => undefined} />);
    fireEvent.focus(screen.getByRole("radio", { name: "Gris medio" }));
    expect(screen.getByText("Cor: Gris medio (mesmo tom que Gris)")).toBeTruthy();
    fireEvent.blur(screen.getByRole("radio", { name: "Gris medio" }));
    expect(screen.getByText("Cor: Negro")).toBeTruthy();
    fireEvent.mouseEnter(screen.getByRole("radio", { name: "Gris" }));
    expect(screen.getByText("Cor: Gris (mesmo tom que Gris medio)")).toBeTruthy();
  });

  it("uma opção com cor dupla desenha as duas cores", () => {
    const dupla: OpcaoEixo[] = [{ valor: "BP", nome: "Branco/Preto", hex: "#F5F5F0, #000000", foto: null, ordem: 1 }];
    render(<SeletorCor rotulo="Cor" opcoes={dupla} valor="BP" aoEscolher={() => undefined} />);
    expect(screen.getByRole("radio", { name: "Branco/Preto" }).querySelector("[data-amostra]")?.getAttribute("style")).toMatch(/linear-gradient\(135deg/);
  });
});

describe("SeletorBotoes", () => {
  it("um grupo de rádio com as opções recebidas, a escolhida marcada, e a nota por baixo", () => {
    render(<SeletorBotoes rotulo="Textura" opcoes={TEX} valor="Liso" aoEscolher={() => undefined} nota="A textura escolhe o produto." />);
    expect(screen.getByRole("radiogroup", { name: "Textura" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Liso", "Pizarra"]);
    expect(screen.getByRole("radio", { name: "Liso" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("A textura escolhe o produto.")).toBeTruthy();
  });

  it("os botões têm 44 px, texto de 15 px e anel de foco", () => {
    render(<SeletorBotoes rotulo="Textura" opcoes={TEX} valor="Liso" aoEscolher={() => undefined} />);
    const c = screen.getByRole("radio", { name: "Pizarra" }).className;
    expect(c).toContain("min-h-11");
    expect(c).toContain("text-[15px]");
    expect(c).toContain("focus-visible:ring-2");
  });

  it("clicar e as setas escolhem; Espaço e Enter são o clique do botão", () => {
    const aoEscolher = vi.fn();
    render(<SeletorBotoes rotulo="Textura" opcoes={TEX} valor="Liso" aoEscolher={aoEscolher} />);
    fireEvent.click(screen.getByRole("radio", { name: "Pizarra" }));
    expect(aoEscolher).toHaveBeenLastCalledWith("Pizarra");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Liso" }), { key: "ArrowDown" });
    expect(aoEscolher).toHaveBeenLastCalledWith("Pizarra");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Liso" }), { key: "ArrowUp" });
    expect(aoEscolher).toHaveBeenLastCalledWith("Pizarra"); // volta ao fim
  });

  it("os nomes todos em maiúsculas passam a primeira letra maiúscula; siglas curtas ficam", () => {
    const ops: OpcaoEixo[] = [{ valor: "BRILHO", nome: "BRILHO", hex: null, foto: null, ordem: 1 }, { valor: "PVC", nome: "PVC", hex: null, foto: null, ordem: 2 }];
    render(<SeletorBotoes rotulo="Tonalidade" opcoes={ops} valor="BRILHO" aoEscolher={() => undefined} />);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Brilho", "PVC"]);
  });
});
