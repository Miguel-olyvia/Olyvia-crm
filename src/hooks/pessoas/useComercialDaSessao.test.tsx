// O comercial de partida de uma visita nova na ficha real: o nome de quem está na sessão, se for um dos comerciais da organização; senão vazio.
// Nunca o nome de exemplo («Ana Ribeiro»). Sem sessão, ou enquanto os comerciais carregam, também vazio.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useComercialDaSessao } from "./useComercialDaSessao";
import type { FontePessoas } from "./useFontePessoas";

const estado = vi.hoisted(() => ({
  fonte: { modo: "exemplo" } as unknown,
  comerciais: { comerciais: [] as { id: string; nome: string }[], isLoading: false, isError: false, repetir: () => undefined },
}));
vi.mock("./useFontePessoas", () => ({ useFontePessoas: () => estado.fonte }));
vi.mock("./useComerciaisNegocio", () => ({ useComerciaisNegocio: () => estado.comerciais }));

const real = (utilizadorId: string | null | undefined): FontePessoas => ({ modo: "real", organizationId: "org-nike", momentoGanho: "manual", utilizadorId });
const LISTA = [{ id: "u1", nome: "Rita Gomes" }, { id: "u2", nome: "Tomás Reis" }];

beforeEach(() => {
  estado.fonte = real("u2");
  estado.comerciais = { comerciais: LISTA, isLoading: false, isError: false, repetir: () => undefined };
});

describe("useComercialDaSessao", () => {
  it("é o nome de quem está na sessão quando é um dos comerciais", () => {
    expect(renderHook(() => useComercialDaSessao()).result.current).toBe("Tomás Reis");
  });

  it("vazio se quem está na sessão não é comercial da organização", () => {
    estado.fonte = real("u9");
    expect(renderHook(() => useComercialDaSessao()).result.current).toBe("");
  });

  it("vazio sem utilizador na sessão (ainda por ler) ou sem comerciais carregados", () => {
    estado.fonte = real(null);
    expect(renderHook(() => useComercialDaSessao()).result.current).toBe("");
    estado.fonte = real(undefined);
    expect(renderHook(() => useComercialDaSessao()).result.current).toBe("");
    estado.fonte = real("u2");
    estado.comerciais = { ...estado.comerciais, comerciais: [] };
    expect(renderHook(() => useComercialDaSessao()).result.current).toBe("");
  });

  it("fora do modo real (o exemplo) é vazio: o exemplo tem os seus próprios comerciais", () => {
    estado.fonte = { modo: "exemplo" };
    expect(renderHook(() => useComercialDaSessao()).result.current).toBe("");
  });
});
