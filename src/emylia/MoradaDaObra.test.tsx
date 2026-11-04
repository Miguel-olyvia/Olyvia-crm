import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MoradaDaObra } from "./MoradaDaObra";
import type { Negocio } from "./motor";

// 4/11 (Rúben): o passo «Morada da obra» propõe a morada que a lead já trazia: validar, editar ou outra
const negocio = (sobre: Partial<Negocio> = {}) => ({ id: 7, local: "", f: {}, ...sobre }) as unknown as Negocio;
const desenhar = (d: Negocio) => {
  const moradaDaLead = vi.fn();
  const ctx = { A: { moradaDaLead, localizacao: vi.fn() }, run: (fn: () => void) => fn() } as never;
  render(<MoradaDaObra ctx={ctx} d={d}><p>Os campos da morada</p></MoradaDaObra>);
  return moradaDaLead;
};
const FICHA = { morada: "Rua A 1", cp: "1000-001", localidade: "Lisboa", fracao: "2.º Dto.", de: "ficha" as const };

describe("MoradaDaObra", () => {
  it("com a morada da ficha: mostra-a, com Validar, Editar e Outra morada, sem os campos", () => {
    desenhar(negocio({ moradaLead: FICHA }));
    expect(screen.getByText("A morada que está na ficha do cliente")).toBeInTheDocument();
    expect(screen.getByText("Rua A 1, 2.º Dto.")).toBeInTheDocument();
    expect(screen.getByText("1000-001 Lisboa")).toBeInTheDocument();
    for (const b of ["Validar esta morada", "Editar", "Outra morada"]) expect(screen.getByRole("button", { name: b })).toBeInTheDocument();
    expect(screen.queryByText("Os campos da morada")).toBeNull();
  });

  it("Validar usa a morada da lead; com tudo preenchido não abre os campos", () => {
    const usar = desenhar(negocio({ moradaLead: FICHA }));
    fireEvent.click(screen.getByRole("button", { name: "Validar esta morada" }));
    expect(usar).toHaveBeenCalledWith(7, FICHA);
    expect(screen.queryByText("Os campos da morada")).toBeNull();
  });

  it("Validar com algo em falta (o andar) abre os campos para o completar; Editar também os abre", () => {
    const usar = desenhar(negocio({ moradaLead: { ...FICHA, fracao: "" } }));
    fireEvent.click(screen.getByRole("button", { name: "Validar esta morada" }));
    expect(usar).toHaveBeenCalled();
    expect(screen.getByText("Os campos da morada")).toBeInTheDocument();
  });

  it("Editar usa a morada e mostra os campos; Outra morada mostra os campos sem usar nada", () => {
    const usar = desenhar(negocio({ moradaLead: FICHA }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(usar).toHaveBeenCalledWith(7, FICHA);
    expect(screen.getByText("Os campos da morada")).toBeInTheDocument();
  });

  it("Outra morada: os campos vazios, para escrever, sem usar a da lead", () => {
    const usar = desenhar(negocio({ moradaLead: FICHA }));
    fireEvent.click(screen.getByRole("button", { name: "Outra morada" }));
    expect(usar).not.toHaveBeenCalled();
    expect(screen.getByText("Os campos da morada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /localização deste dispositivo/ })).toBeInTheDocument();
  });

  it("sem nada da lead (ou com a morada já escrita): os campos como antes", () => {
    desenhar(negocio({ local: "Almada" }));
    expect(screen.getByText("Os campos da morada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Validar esta morada" })).toBeNull();
  });

  it("sem ficha, a morada do pedido com código postal também se propõe", () => {
    desenhar(negocio({ local: "Estrada de Santo Eloy, 1675-010 Odivelas · 1" }));
    expect(screen.getByText("A morada que veio no pedido")).toBeInTheDocument();
    expect(screen.getByText("Estrada de Santo Eloy, 1")).toBeInTheDocument();
  });
});
