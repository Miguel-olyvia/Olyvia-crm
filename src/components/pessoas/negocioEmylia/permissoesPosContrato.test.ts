import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { seed } from "@/emylia/motor";

const m = vi.hoisted(() => ({ ler: vi.fn(), definir: vi.fn() }));
vi.mock("@/emylia/permissoesReais", () => ({ lerPermissoesNegocios: m.ler }));
vi.mock("@/emylia/permissoes", () => ({ definirPermissoesReais: m.definir }));

import { podeNoPosContrato, usePermissoesPosContrato } from "./permissoesPosContrato";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("podeNoPosContrato", () => {
  it("enquanto as permissões da base se leem, não se grava", () => {
    expect(podeNoPosContrato(true, { k: "a-ler" })).toEqual({ gravar: false, aLer: true, falhou: false });
  });
  it("uma leitura que FALHOU não dá gravar (não vale por «sem permissões»)", () => {
    expect(podeNoPosContrato(true, { k: "falhou" })).toEqual({ gravar: false, aLer: false, falhou: true });
  });
  it("sem pessoas.edit na ficha não se grava, mesmo com permissões lidas", () => {
    expect(podeNoPosContrato(false, { k: "lidas", codigos: new Set(["financeiro.faturar"]) })).toEqual({ gravar: false, aLer: false, falhou: false });
  });
  it("com as duas coisas grava", () => {
    expect(podeNoPosContrato(true, { k: "lidas", codigos: new Set() })).toEqual({ gravar: true, aLer: false, falhou: false });
  });
});

describe("usePermissoesPosContrato", () => {
  it("lê as permissões, passa-as ao motor e só então deixa gravar", async () => {
    m.ler.mockResolvedValue(new Set(["negocios.validar_pagamento"]));
    const { result } = renderHook(() => usePermissoesPosContrato("org-1", null, true));
    expect(result.current.aLer).toBe(true);
    expect(result.current.gravar).toBe(false);
    await waitFor(() => expect(result.current.gravar).toBe(true));
    expect(m.definir).toHaveBeenCalledWith({ codigos: new Set(["negocios.validar_pagamento"]), simular: false });
  });
  it("uma leitura que falha diz-se, não deixa gravar, e repetir lê outra vez", async () => {
    m.ler.mockResolvedValueOnce(null).mockResolvedValueOnce(new Set());
    const { result } = renderHook(() => usePermissoesPosContrato("org-1", null, true));
    await waitFor(() => expect(result.current.falhou).toBe(true));
    expect(result.current.gravar).toBe(false);
    act(() => result.current.repetir());
    await waitFor(() => expect(result.current.gravar).toBe(true));
    expect(m.ler).toHaveBeenCalledTimes(2);
  });
  it("o papel da Emylia fixa-se num efeito, e o motor não recebe permissões inventadas enquanto não há leitura", async () => {
    m.ler.mockResolvedValue(null);
    const S = seed();
    S.role = "comercial";
    renderHook(() => usePermissoesPosContrato("org-1", S, true));
    expect(S.role).toBe("direcao");
    expect(m.definir).toHaveBeenCalledWith({ codigos: new Set(), simular: false });
  });
});
