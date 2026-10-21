import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePermissaoQuadro, usePodeVerQuadro } from "./usePodeVerQuadro";

const permissoes = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => permissoes.valor }));

describe("usePodeVerQuadro", () => {
  beforeEach(() => { permissoes.valor = null; });

  it("é verdadeiro só com pessoas.view", () => {
    const pedidas: string[] = [];
    permissoes.valor = { hasPermission: (c: string) => { pedidas.push(c); return c === "pessoas.view"; } };
    expect(renderHook(() => usePodeVerQuadro()).result.current).toBe(true);
    expect(pedidas).toEqual(["pessoas.view"]);
  });

  it("sem a permissão é falso", () => {
    permissoes.valor = { hasPermission: () => false };
    expect(renderHook(() => usePodeVerQuadro()).result.current).toBe(false);
  });

  it("sem hasPermission (a carregar, ou um simulado parcial) conta como sem permissão", () => {
    permissoes.valor = {};
    expect(renderHook(() => usePodeVerQuadro()).result.current).toBe(false);
  });
});

describe("usePermissaoQuadro", () => {
  beforeEach(() => { permissoes.valor = null; });

  it("enquanto as permissões carregam diz que está a carregar (e que ainda não pode), para a página não decidir cedo", () => {
    permissoes.valor = { hasPermission: () => false, loading: true };
    expect(renderHook(() => usePermissaoQuadro()).result.current).toEqual({ pode: false, aCarregar: true });
  });

  it("carregadas, com pessoas.view: pode e já não está a carregar", () => {
    permissoes.valor = { hasPermission: (c: string) => c === "pessoas.view", loading: false };
    expect(renderHook(() => usePermissaoQuadro()).result.current).toEqual({ pode: true, aCarregar: false });
  });

  it("um simulado sem o campo loading não conta como a carregar", () => {
    permissoes.valor = { hasPermission: () => false };
    expect(renderHook(() => usePermissaoQuadro()).result.current).toEqual({ pode: false, aCarregar: false });
  });
});
