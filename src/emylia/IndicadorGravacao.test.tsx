// 25/11 (Rúben: «isto está bloqueado e não para»): a gravação parada tem «Terminar», o relógio não conta os dias parada,
// e quando o negócio não a fecha deixa-se apagar.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => {
  const ouvem = new Set<() => void>();
  const e = {
    g: { negocio: 7 as number | null, nome: "Rúben Macho", modo: "visita", voltar: "/negocios?id=7", estado: "interrompida", falas: [] as unknown[],
      inicioEm: 0 as number | null, noutroSeparador: false, pedeToque: false },
    pedido: null as number | null, ouvem,
    pedir: vi.fn(), descartar: vi.fn(), iniciar: vi.fn(() => Promise.resolve()), irPara: vi.fn(),
  };
  e.pedir.mockImplementation((n: number | null) => { e.pedido = n; ouvem.forEach((f) => f()); });
  return e;
});
vi.mock("./gravador", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useGravacao: () => m.g, usePainelAberto: () => false, useNivelMicrofone: () => 0,
    iniciarGravacao: m.iniciar, pausarGravacao: vi.fn(), descartarGravacao: m.descartar, pedirTerminarGravacao: m.pedir,
    useTerminarPedido: () => useSyncExternalStore((f: () => void) => { m.ouvem.add(f); return () => { m.ouvem.delete(f); }; }, () => m.pedido),
  };
});
vi.mock("./urlNegocio", () => ({ irPara: m.irPara }));

import { ESPERA_TERMINAR_MS, IndicadorGravacao, tempoGravado } from "./IndicadorGravacao";

const fala = (inicio: number, fim: number) => ({ inicio, fim, texto: "x", falante: "cliente", confianca_falante: 1 });

describe("a gravação parada no indicador", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    m.pedido = null; m.pedir.mockClear(); m.descartar.mockClear(); m.irPara.mockClear();
    // começou há 5 dias, com 3 min 20 s gravados
    m.g = { ...m.g, estado: "interrompida", inicioEm: Date.now() - 5 * 86_400_000, falas: [fala(0, 12), fala(150, 200)] };
  });
  afterEach(() => { vi.useRealTimers(); });

  it("parada, o relógio mostra o tempo gravado e não os dias desde o início", () => {
    expect(tempoGravado(m.g.falas as { fim: number }[])).toBe(200);
    render(<IndicadorGravacao />);
    expect(screen.getByRole("status")).toHaveTextContent("Gravação parada · Rúben Macho · 3:20 · 2 falas");
  });

  it("«Terminar» pede ao negócio que guarde a gravação e abre-o", () => {
    render(<IndicadorGravacao />);
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminar" }));
    expect(m.pedir).toHaveBeenCalledWith(7);
    expect(m.irPara).toHaveBeenCalledWith("/negocios?id=7");
    expect(screen.getByRole("status")).toHaveTextContent("A guardar no negócio...");
    expect(screen.queryByRole("button", { name: /Apagar/ })).not.toBeInTheDocument();
  });

  it("se o negócio não a fechar, deixa apagar as falas (com confirmação)", () => {
    render(<IndicadorGravacao />);
    fireEvent.click(screen.getByRole("button", { name: "Terminar" }));
    act(() => { vi.advanceTimersByTime(ESPERA_TERMINAR_MS + 1000); });
    expect(screen.getByRole("status")).toHaveTextContent("O negócio não guardou a gravação");
    fireEvent.click(screen.getByRole("button", { name: "Apagar a gravação" }));
    expect(m.descartar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sim, apagar as 2 falas" }));
    expect(m.descartar).toHaveBeenCalled();
  });

  it("a gravar, continua com «Parar» e o relógio desde o início", () => {
    m.g = { ...m.g, estado: "a_ouvir", inicioEm: Date.now() - 65_000 };
    render(<IndicadorGravacao />);
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Terminar" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1:05");
  });
});
