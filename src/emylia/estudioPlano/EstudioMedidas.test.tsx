// 11/11 (Rúben: «ao ajustar paredes na planta de cima, os campos de baixo não acompanham, e o impacto no orçamento fica "Sem impacto"»):
// cada mudança na planta passa logo o chão e as paredes (m²) para as medidas; o impacto mexe; as outras medidas ficam como se escreveram.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { gravarPlanta, retangulo, type Planta } from "../planta";

// a planta: um botão que a troca por uma divisão maior (arrastar paredes no jsdom não dá)
vi.mock("../EditorPlanta", () => ({
  EditorPlanta: ({ planta, onMudar }: { planta: Planta; onMudar: (p: Planta) => void }) => (
    <button type="button" onClick={() => onMudar({ ...planta, paredes: retangulo(300, 250) })}>alargar a divisão</button>
  ),
}));

import { acoes, seed, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioMedidas } from "./EstudioMedidas";

afterEach(cleanup);
Element.prototype.scrollIntoView = function () {};

describe("Estúdio das medidas: as medidas seguem a planta (11/11)", () => {
  it("mexer na planta muda o chão e as paredes logo, e o impacto aparece", () => {
    const S = seed();
    S.role = "operacoes";
    const d = S.deals.find((x) => x.orc?.aceite && !x.orc.vendaDireta) as Negocio | undefined ?? (S.deals[0] as Negocio);
    d.f.planta = gravarPlanta({ o: { x: 0, y: 0 }, paredes: retangulo(200, 200), pecas: [] });
    d.f.diag_pe_direito_m = "2,5";
    const A = acoes(S, () => {}, (fn) => fn());
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<EstudioMedidas ctx={ctx} d={d} fechar={() => {}} />);
    const pav = screen.getByRole("textbox", { name: /Pavimento/ }) as HTMLInputElement;
    const outra = screen.getAllByRole("textbox").find((x) => x !== pav && !/Paredes/.test(x.getAttribute("aria-label") ?? "")) as HTMLInputElement | undefined;
    if (outra) fireEvent.change(outra, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "alargar a divisão" }));
    expect(pav.value).toBe("7.5");
    if (outra) expect(outra.value).toBe("7");
    const impacto = screen.getByRole("region", { name: "Impacto no orçamento" });
    expect(within(impacto).queryByText("Sem impacto")).toBeNull();
  });
});
