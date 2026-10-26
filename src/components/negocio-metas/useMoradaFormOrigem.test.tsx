// A morada da obra do negócio real: começa VAZIA (não herda das visitas), e sabe de onde veio: copiada da entidade, escrita à mão ou pela localização.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMoradaForm } from "./useEstadoNovoNegocio";
import type { VisitaNegocio } from "./negocioMetas";
import { novaVisita } from "./visitasNegocio";

const VAZIA = { rua: "", codigoPostal: "", localidade: "", andar: "" };
const ENTIDADE = { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "2.º Dto." };

function visitaComMorada(): VisitaNegocio {
  return { ...novaVisita("v1", "2026-10-20", "Ana"), morada: { rua: "Rua da Visita 9", codigoPostal: "2000-002", localidade: "Santarém", andar: "" }, igualALead: false };
}

describe("useMoradaForm: início vazio e origem", () => {
  it("com `semVisitas` não herda a morada das visitas", () => {
    const { result } = renderHook(() => useMoradaForm(vi.fn(), { visitas: [visitaComMorada()], semVisitas: true }));
    expect(result.current.morada).toEqual(VAZIA);
    expect(result.current.origem).toBeNull();
    expect(result.current.origemObra).toBeNull();
  });

  it("sem `semVisitas` herda como antes (o exemplo não muda)", () => {
    const { result } = renderHook(() => useMoradaForm(vi.fn(), { visitas: [visitaComMorada()] }));
    expect(result.current.morada.rua).toBe("Rua da Visita 9");
  });

  it("preencher com a entidade copia os quatro campos e marca a origem 'entidade'", () => {
    const aoSujar = vi.fn();
    const { result } = renderHook(() => useMoradaForm(aoSujar, { semVisitas: true }));
    act(() => result.current.preencherDe(ENTIDADE, "entidade"));
    expect(result.current.morada).toEqual(ENTIDADE);
    expect(result.current.origemObra).toBe("entidade");
    expect(aoSujar).toHaveBeenCalled();
  });

  it("é uma cópia: mexer na entidade depois não muda a morada da obra, e escrever na obra passa a 'manual'", () => {
    const entidade = { ...ENTIDADE };
    const { result } = renderHook(() => useMoradaForm(vi.fn(), { semVisitas: true }));
    act(() => result.current.preencherDe(entidade, "entidade"));
    entidade.rua = "Outra rua";
    expect(result.current.morada.rua).toBe("Rua A 1");
    act(() => result.current.mudar("rua", "Rua A 1B"));
    expect(result.current.origemObra).toBe("manual");
    expect(result.current.morada.rua).toBe("Rua A 1B");
  });

  it("a localização preenche rua, código postal e localidade, mantém o andar escrito e marca 'localizacao'", () => {
    const { result } = renderHook(() => useMoradaForm(vi.fn(), { semVisitas: true }));
    act(() => result.current.mudar("andar", "3.º Esq."));
    act(() => result.current.preencherDe({ rua: "Rua B 2", codigoPostal: "3000-003", localidade: "Coimbra", andar: "" }, "localizacao"));
    expect(result.current.morada).toEqual({ rua: "Rua B 2", codigoPostal: "3000-003", localidade: "Coimbra", andar: "3.º Esq." });
    expect(result.current.origemObra).toBe("localizacao");
  });

  it("a entidade copia também o andar (são os quatro campos)", () => {
    const { result } = renderHook(() => useMoradaForm(vi.fn(), { semVisitas: true }));
    act(() => result.current.mudar("andar", "lixo"));
    act(() => result.current.preencherDe(ENTIDADE, "entidade"));
    expect(result.current.morada.andar).toBe("2.º Dto.");
  });

  it("parte da morada e da origem já guardadas; se se limpa tudo, deixa de haver origem", () => {
    const { result } = renderHook(() => useMoradaForm(vi.fn(), { semVisitas: true, moradaObra: ENTIDADE, origemObra: "localizacao" }));
    expect(result.current.origemObra).toBe("localizacao");
    act(() => {
      for (const c of ["rua", "codigoPostal", "localidade", "andar"] as const) result.current.mudar(c, "");
    });
    expect(result.current.origemObra).toBeNull();
  });
});
