// «Outras medidas» do mesmo modelo de catálogo: ligações (<a href>) e não botões, porque mudar de medida muda de família e de endereço; a medida desta família leva
// aria-current="page"; a cor e a textura escolhidas vão no endereço (mantém-se ao mudar de medida); com muitas medidas há pesquisa e grupos.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt", setLanguage: () => undefined }) }));

import { veioDeMudancaDeMedida, type OutraMedida } from "./escolhaVariacao";
import { OutrasMedidas } from "./OutrasMedidas";

afterEach(cleanup);

const m = (id: string, medida: string | null, atual = false): OutraMedida => ({ id, nome: `Base de Duche CACH ${medida ?? ""}`, atual, medida, medidaValor: null, unidade: "cm" });
const SEIS = [m("f6", "90×210 cm"), m("f1", "70×70 cm"), m("f2", "70×100 cm", true), m("f3", "80×120 cm")];
const MUITAS = [...SEIS, m("f7", "70×120 cm"), m("f8", "80×80 cm"), m("f9", "100×100 cm")];
const PARAMS = new URLSearchParams("cor=Antracita&textura=Liso");
const montar = (outras: readonly OutraMedida[], modelo: string | null = "CACH") => render(<MemoryRouter><OutrasMedidas outras={outras} parametros={PARAMS} modelo={modelo} /></MemoryRouter>);

describe("OutrasMedidas", () => {
  it("com uma só família (35 dos 48 modelos) a lista não aparece", () => {
    const { container } = montar([m("f1", "70×70 cm", true)]);
    expect(container.firstChild).toBeNull();
  });

  it("cada medida é uma ligação para a família dela, com a cor e a textura no endereço", () => {
    montar(SEIS);
    const l = screen.getByRole("link", { name: /90×210 cm/ });
    expect(l.getAttribute("href")).toBe("/catalogo/produtos/familias/f6?cor=Antracita&textura=Liso");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("a ligação diz ao ecrã seguinte que se veio de uma mudança de medida (para ele pôr o foco no título)", () => {
    const Estado = () => <p data-testid="estado">{String(veioDeMudancaDeMedida(useLocation().state))}</p>;
    render(
      <MemoryRouter initialEntries={["/catalogo/produtos/familias/f2"]}>
        <Routes>
          <Route path="/catalogo/produtos/familias/f2" element={<OutrasMedidas outras={SEIS} parametros={PARAMS} modelo="CACH" />} />
          <Route path="/catalogo/produtos/familias/:id" element={<Estado />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: /90×210 cm/ }));
    expect(screen.getByTestId("estado").textContent).toBe("true");
    expect(veioDeMudancaDeMedida(undefined)).toBe(false);
    expect(veioDeMudancaDeMedida({ x: 1 })).toBe(false);
  });

  it("as ligações têm contorno visível (3:1) e margem de rolagem em baixo no telemóvel", () => {
    montar(SEIS);
    const l = screen.getByRole("link", { name: /90×210 cm/ });
    expect(l.className).toContain("border-foreground/50");
    expect(l.className).not.toContain("border-input");
    expect(l.className).toContain("max-lg:scroll-mb-64");
  });

  it("a medida desta família leva aria-current=page, e só ela", () => {
    montar(SEIS);
    expect(screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)).toEqual([expect.stringContaining("70×100 cm")]);
  });

  it("pelo número, e não pelo texto: 70×70, 70×100, 80×120, 90×210", () => {
    montar(SEIS);
    expect(screen.getAllByRole("link").map((a) => a.textContent?.replace(/\s*\(.*\)$/, ""))).toEqual(["70×70 cm", "70×100 cm", "80×120 cm", "90×210 cm"]);
  });

  it("o título diz o modelo de catálogo (e nunca «modelo» sozinho)", () => {
    montar(SEIS);
    expect(screen.getByRole("heading", { name: "Outras medidas do modelo de catálogo CACH" })).toBeTruthy();
  });

  it("até 6 medidas não há pesquisa nem grupos", () => {
    montar(SEIS);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText(/Medidas com/)).toBeNull();
  });

  it("com mais de 6: caixa de pesquisa que filtra as ligações e diz «3 de 7 medidas»", () => {
    montar(MUITAS);
    const caixa = screen.getByRole("searchbox", { name: "Procurar medida, por exemplo 100" });
    fireEvent.change(caixa, { target: { value: "100" } });
    expect(screen.getAllByRole("link").map((a) => a.textContent?.replace(/\s*\(.*\)$/, ""))).toEqual(["70×100 cm", "100×100 cm"]);
    expect(screen.getByRole("status").textContent).toBe("2 de 7 medidas");
  });

  it("uma pesquisa sem resultados diz-o, em vez de uma lista vazia", () => {
    montar(MUITAS);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "999" } });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText("Nenhuma medida corresponde a «999».")).toBeTruthy();
  });

  it("com mais de 6 as ligações agrupam-se pela primeira medida", () => {
    montar(MUITAS);
    const grupo70 = screen.getByRole("group", { name: "Medidas com 70" });
    expect(within(grupo70).getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("group", { name: "Medidas com 100" })).toBeTruthy();
  });

  it("uma medida sem texto cai no nome da família", () => {
    montar([m("f1", null, true), m("f2", "70×100 cm")]);
    expect(screen.getByRole("link", { name: /Base de Duche CACH/ })).toBeTruthy();
  });
});
