// 23/11 (Rúben, negócio 1015): no painel da base, «Onde fica a coluna» muda o lado da coluna de duche na planta do depois.
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { retangulo, type Planta } from "@/emylia/planta";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import { PainelPeca } from "./pecasEstudio";
import type { Projeto } from "./necessidadesEstudio";

const planta = (w: number, x: number): Planta => ({ o: { x: 0, y: 0 }, paredes: retangulo(147, 147), pecas: [{ id: "b", tipo: "base", x, y: 0, w, h: 70 }] });
let ultimo: Projeto | null = null;
function Painel({ pl }: { pl: Planta }) {
  const [p, setP] = useState<Projeto>({ ...PROJETO_EXEMPLO, antes: pl, depois: pl, escolhas: {}, acompanha: {} });
  ultimo = p;
  return <PainelPeca p={p} pc={p.depois.pecas[0]} setP={setP} fechar={() => undefined} />;
}

describe("Onde fica a coluna (23/11)", () => {
  it("a base de parede a parede: Ao fundo (escolhido), esquerda e direita; tocar na esquerda grava-a na base", () => {
    render(<Painel pl={planta(147, 0)} />);
    const grupo = screen.getByRole("group", { name: "Onde fica a coluna" });
    expect(within(grupo).getByRole("button", { name: "Ao fundo" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(grupo).getByRole("button", { name: "Na parede da esquerda" }));
    expect(ultimo!.depois.pecas[0].coluna).toBe("esquerda");
    expect(within(grupo).getByRole("button", { name: "Na parede da esquerda" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(grupo).getByRole("button", { name: "Na parede da direita" })).toBeTruthy();
  });
  it("a base solta das paredes dos lados não pergunta (só há o fundo)", () => {
    render(<Painel pl={planta(120, 15)} />);
    expect(screen.queryByRole("group", { name: "Onde fica a coluna" })).toBeNull();
  });
});
