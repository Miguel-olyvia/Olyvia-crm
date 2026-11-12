import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({
  g: { negocio: null as number | null, nome: "", modo: "visita", voltar: "/negocios", estado: "parado", falas: [] as unknown[], inicioEm: null as number | null, nivel: 0 },
  iniciar: vi.fn(() => Promise.resolve()),
  pausar: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/emylia/gravador", () => ({
  useGravacao: () => m.g, usePainelAberto: () => false, iniciarGravacao: m.iniciar, pausarGravacao: m.pausar,
}));
vi.mock("@/emylia/urlNegocio", () => ({ irPara: vi.fn() }));

import { GravarNoEstudio } from "./GravarNoEstudio";
import { IndicadorGravacao } from "@/emylia/IndicadorGravacao";
import { PROJETO_EXEMPLO } from "./exemploEstudio";

const p = { ...PROJETO_EXEMPLO, negocio: 12, nome: "Verónica", origem: "/negocios?id=12&passo=estudio" };

describe("gravar e parar no Estúdio", () => {
  beforeEach(() => { m.iniciar.mockClear(); m.pausar.mockClear(); m.g = { ...m.g, negocio: null, estado: "parado", falas: [] }; });

  it("sem gravação: «Gravar a visita» começa a gravar este negócio", () => {
    render(<><GravarNoEstudio p={p} /><IndicadorGravacao /></>);
    fireEvent.click(screen.getByRole("button", { name: "Gravar a visita" }));
    expect(m.iniciar).toHaveBeenCalledWith({ negocio: 12, nome: "Verónica", modo: "visita", voltar: "/negocios?id=12&passo=estudio" });
  });

  it("a gravar: o indicador tem «Parar», que para sem terminar; parada, tem «Continuar»", () => {
    m.g = { ...m.g, negocio: 12, nome: "Verónica", estado: "a_ouvir", inicioEm: Date.now() };
    const { rerender } = render(<><GravarNoEstudio p={p} /><IndicadorGravacao /></>);
    expect(screen.queryByRole("button", { name: "Gravar a visita" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(m.pausar).toHaveBeenCalled();
    m.g = { ...m.g, estado: "interrompida" };
    rerender(<><GravarNoEstudio p={p} /><IndicadorGravacao /></>);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(m.iniciar).toHaveBeenCalledWith({ negocio: 12, nome: "Verónica", modo: "visita", voltar: "/negocios" }, true);
  });

  it("uma gravação terminada por guardar não se apaga com uma nova", () => {
    m.g = { ...m.g, negocio: 12, nome: "Verónica", estado: "terminada" };
    render(<GravarNoEstudio p={p} />);
    expect(screen.queryByRole("button", { name: "Gravar a visita" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar no negócio" })).toBeInTheDocument();
  });
});
