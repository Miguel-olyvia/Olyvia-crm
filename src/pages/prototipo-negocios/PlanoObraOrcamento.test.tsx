// O plano da obra no orçamento (14/10/2026): as fases, o Gantt em datas, o teclado nas barras e o início.
import { useReducer } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, tot, type Estado, type Negocio } from "./motor";
import { PlanoObra } from "./PlanoObraOrcamento";

afterEach(cleanup);

function Pagina({ S, d }: { S: Estado; d: Negocio }) {
  const [, refazer] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); refazer(); };
  return <PlanoObra ctx={{ S, A: acoes(S, vi.fn(), run), run }} d={d} />;
}
const montar = (enviada = false) => {
  const S = seed();
  const d = S.deals.find((x) => x.orc && x.orc.linhas.filter((l) => l.t === "svc").length >= 3) as Negocio;
  d.orc!.enviada = enviada ? "2026-10-10" : null;
  render(<Pagina S={S} d={d} />);
  return { S, d };
};

describe("plano da obra no orçamento", () => {
  it("mostra as fases e uma barra por tarefa, com os dias", () => {
    const { d, S } = montar();
    expect(screen.getByRole("heading", { name: "Plano da obra" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Fases da obra" }).querySelectorAll("button").length).toBeGreaterThanOrEqual(3);
    const barras = screen.getAllByRole("slider");
    expect(barras.length).toBe(d.orc!.linhas.filter((l) => l.t === "svc" && l.q > 0).length + (d.orc!.demolicao?.r ? 1 : 0));
    expect(tot(d, S).custo).toBeGreaterThan(0);
  });

  it("← → numa barra mudam meio dia, e o custo do orçamento muda com eles", () => {
    const { d, S } = montar();
    const c0 = tot(d, S).custo;
    const b = screen.getAllByRole("slider")[1];
    const v0 = Number(b.getAttribute("aria-valuenow"));
    fireEvent.keyDown(b, { key: "ArrowRight" });
    expect(Number(screen.getAllByRole("slider")[1].getAttribute("aria-valuenow"))).toBe(v0 + 0.5);
    expect(tot(d, S).custo).toBeGreaterThan(c0);
    expect(screen.getByText(/Os dias mudados à mão somam/)).toBeTruthy();
  });

  it("tocar numa fase realça-a (aria-pressed); tocar outra vez tira o realce", () => {
    montar();
    const f = screen.getByRole("group", { name: "Fases da obra" }).querySelector("button")!;
    fireEvent.click(f);
    expect(f.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(f);
    expect(f.getAttribute("aria-pressed")).toBe("false");
  });

  it("escolher o início guarda a data e não mexe no custo", () => {
    const { d, S } = montar();
    const c0 = tot(d, S).custo;
    fireEvent.click(screen.getByRole("button", { name: /Daqui a 2 semanas/ }));
    expect(d.orc!.inicioObra).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByRole("button", { name: /Daqui a 2 semanas/ }).getAttribute("aria-pressed")).toBe("true");
    expect(tot(d, S).custo).toBe(c0);
  });

  it("com o orçamento enviado, as barras não mudam", () => {
    const { d, S } = montar(true);
    const c0 = tot(d, S).custo;
    fireEvent.keyDown(screen.getAllByRole("slider")[0], { key: "ArrowRight" });
    expect(tot(d, S).custo).toBe(c0);
  });
});
