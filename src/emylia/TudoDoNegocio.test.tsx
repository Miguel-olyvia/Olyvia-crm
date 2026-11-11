// 11/11 (Rúben: «ver toda a informação do negócio, de todas as fases, num sítio só»): a linha do tempo pelas seis fases, a atual aberta,
// as futuras esbatidas, a pesquisa, os saltos e «Ir a esta fase»; o histórico vai para a fase certa.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes, seed, type Evento, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { TudoDoNegocio, historicoPorFase } from "./TudoDoNegocio";

afterEach(cleanup);
Element.prototype.scrollIntoView = function () {};

const montar = (escolher: (d: Negocio) => boolean) => {
  const S = seed();
  const d = S.deals.find(escolher) as Negocio;
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const irPara = vi.fn();
  render(<TudoDoNegocio ctx={ctx} d={d} fechar={() => {}} irPara={irPara} />);
  return { d, irPara };
};

describe("Tudo do negócio (11/11)", () => {
  it("as seis fases; a atual aberta e marcada; as futuras sem «Ir a esta fase»", () => {
    const { d } = montar((x) => x.fase === 3 && !!x.orc);
    const fases = screen.getAllByRole("region");
    expect(fases.length).toBe(6);
    const atual = screen.getByRole("region", { name: "Negócio" });
    expect(within(atual).getByText("Agora")).toBeTruthy();
    expect(within(atual).getByRole("button", { name: /Negócio/, expanded: true })).toBeTruthy();
    expect(within(atual).getByText("O orçamento e a proposta")).toBeTruthy();
    const futura = screen.getByRole("region", { name: "Obra" });
    expect(within(futura).queryByRole("button", { name: /Ir a esta fase/ })).toBeNull();
    expect(d.fase).toBe(3);
  });
  it("«Ir a esta fase» leva à fase; abrir e fechar uma fase feita", () => {
    const { irPara } = montar((x) => x.fase === 3 && !!x.orc);
    const visita = screen.getByRole("region", { name: "Visita" });
    const cab = within(visita).getByRole("button", { name: /Visita/, expanded: false });
    fireEvent.click(cab);
    expect(cab.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(within(visita).getByRole("button", { name: /Ir a esta fase/ }));
    expect(irPara).toHaveBeenCalledWith(2);
  });
  it("a pesquisa encontra um valor em qualquer fase e abre-a", () => {
    montar((x) => x.fase === 3 && !!x.orc);
    fireEvent.change(screen.getByRole("searchbox", { name: /Procurar/ }), { target: { value: "s/ iva" } });
    expect(screen.getAllByText((_, el) => el?.tagName === "MARK").length).toBeGreaterThan(0);
    expect(screen.getByText(/resultados? para «s\/ iva»/)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: /Procurar/ }), { target: { value: "zzzz-nada" } });
    expect(screen.getByText("Nada encontrado para «zzzz-nada».")).toBeTruthy();
  });
  it("o histórico vai para a fase em que aconteceu (pelas entradas «Passou a …»)", () => {
    const h: Evento[] = [
      { t: "Plano aprovado pelas Operações", q: "hoje 10:00", k: "a" },
      { t: "Passou a Negócio · sozinho", q: "ontem", k: "a" },
      { t: "Visita feita", q: "há 2 dias", k: "a" },
      { t: "Passou a Visita · sozinho", q: "há 3 dias", k: "a" },
      { t: "Lead criada", q: "há 5 dias", k: "a" },
    ];
    const p = historicoPorFase(h);
    expect(p[0].map((e) => e.t)).toEqual(["Lead criada"]);
    expect(p[2].map((e) => e.t)).toEqual(["Visita feita", "Passou a Visita · sozinho"]);
    expect(p[3].map((e) => e.t)).toEqual(["Plano aprovado pelas Operações", "Passou a Negócio · sozinho"]);
  });
});
