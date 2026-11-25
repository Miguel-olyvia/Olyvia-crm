// 25/11 (Rúben): a barra de rolar do plano vivo fica no fundo do ecrã e mexe no mesmo rolar do gráfico.
import { afterEach, describe, expect, it } from "vitest";
import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BarraRolar } from "./BarraRolar";

afterEach(cleanup);

function Montar({ sw, cw }: { sw: number; cw: number }) {
  const r = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div data-testid="alvo" ref={(el) => {
        if (el) { Object.defineProperty(el, "scrollWidth", { configurable: true, value: sw }); Object.defineProperty(el, "clientWidth", { configurable: true, value: cw }); }
        (r as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}><div /></div>
      <BarraRolar alvo={r} rotulo="Rolar o plano pelos dias" passo={100} />
    </div>
  );
}

describe("a barra de rolar do plano vivo", () => {
  it("não aparece quando o gráfico cabe todo", () => {
    render(<Montar sw={500} cw={500} />);
    expect(screen.queryByRole("scrollbar")).toBeNull();
  });

  it("as setas do teclado, Home e End rolam o gráfico", () => {
    render(<Montar sw={2000} cw={500} />);
    const barra = screen.getByRole("scrollbar", { name: "Rolar o plano pelos dias" });
    const alvo = screen.getByTestId("alvo");
    fireEvent.keyDown(barra, { key: "ArrowRight" });
    expect(alvo.scrollLeft).toBe(100);
    fireEvent.keyDown(barra, { key: "End" });
    expect(alvo.scrollLeft).toBe(1500);
    expect(barra.getAttribute("aria-valuenow")).toBe("100");
    fireEvent.keyDown(barra, { key: "Home" });
    expect(alvo.scrollLeft).toBe(0);
  });

  it("o botão de trás fica desligado no início e o da frente rola", () => {
    render(<Montar sw={2000} cw={500} />);
    expect((screen.getByRole("button", { name: "Rolar para trás" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Rolar para a frente" }));
    expect(screen.getByTestId("alvo").scrollLeft).toBe(300);
  });

  it("arrastar o cursor rola na proporção da pista", () => {
    render(<Montar sw={2000} cw={500} />);
    const barra = screen.getByRole("scrollbar");
    Object.defineProperty(barra, "clientWidth", { configurable: true, value: 400 });
    const cursor = barra.firstElementChild as HTMLElement;
    Object.defineProperty(cursor, "clientWidth", { configurable: true, value: 100 });
    fireEvent.pointerDown(cursor, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(cursor, { clientX: 150, pointerId: 1 });
    fireEvent.pointerUp(cursor, { clientX: 150, pointerId: 1 });
    // 300 px de pista livre para 1500 px de rolar: 150 px = 750
    expect(screen.getByTestId("alvo").scrollLeft).toBe(750);
  });
});
