// 11/11 (Rúben: «ter também uma área onde se consegue mudar o impacto percentual de algumas opções»): ao lado do impacto de uma resposta
// («+ 4% sobre os serviços · Casa habitada…»), quem configura os campos muda-o em «Mudar»; sem essa permissão (nada registado), não aparece.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Campos } from "./CamposFase";
import { INTERIOR } from "./campos";
import { acoes, seed, type Negocio } from "./motor";
import { definirEfeitosCampos, definirGravarEfeitos, type CfgEfeitos } from "./efeitosLevantamento";

afterEach(() => { cleanup(); definirGravarEfeitos(null); definirEfeitosCampos(null); });

const montar = () => {
  const S = seed();
  const d = S.deals[0] as Negocio;
  d.f.habitada_durante_obra = "Sim";
  const A = acoes(S, () => {}, (fn) => fn());
  const campo = vi.spyOn(A, "campo");
  render(<Campos grupo={INTERIOR} d={d} A={A} run={(fn) => fn()} simples />);
  return { campo };
};

describe("mudar o impacto de uma resposta ao lado do campo (11/11)", () => {
  it("sem quem possa gravar, mostra o impacto e não há «Mudar»", () => {
    montar();
    expect(screen.getByText(/\+ 4% sobre os serviços/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mudar" })).toBeNull();
  });
  it("com quem possa gravar: muda a percentagem para a organização e o negócio refaz-se", async () => {
    let gravado: CfgEfeitos | null = null;
    definirGravarEfeitos(async (cfg) => { gravado = cfg; definirEfeitosCampos(cfg); return null; });
    const { campo } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Mudar" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Percentagem/ }), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(gravado?.habitada?.v?.pct).toBe(6));
    expect(campo).toHaveBeenCalledWith(expect.any(Number), "habitada_durante_obra", "Sim");
  });
});
