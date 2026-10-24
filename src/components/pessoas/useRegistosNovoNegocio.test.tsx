// O estado das abas Visita e Levantamento do «Novo negócio» da ficha real: o levantamento novo SEM visita tem data, estado e comercial próprios (preenchidos por
// omissão: hoje, por fazer, o comercial da sessão) e entrega-os no rascunho; com uma visita nova a representá-lo herda os dela.
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { REGISTOS_VAZIOS } from "@/components/negocio-metas/registosTipos";
import { registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { useRegistosNovoNegocio } from "./useRegistosNovoNegocio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/pessoas/useComercialDaSessao", () => ({ useComercialDaSessao: () => "Rita Gomes" }));

const HOJE = "2026-10-13";
const montar = () => renderHook(() => useRegistosNovoNegocio({
  porLigar: registosPorLigar(REGISTOS_VAZIOS, "a"), levantamentosCompletos: true, hoje: HOJE, aoSujar: vi.fn(),
}));
const escolherNovo = (r: ReturnType<typeof montar>) => act(() => {
  r.result.current.mudarLigar({ ...r.result.current.ligar, levantamento: { tipo: "novo" } });
});

describe("useRegistosNovoNegocio: o levantamento novo sem visita", () => {
  it("parte de hoje, por fazer e o comercial da sessão, e entrega-os no rascunho", () => {
    const r = montar();
    escolherNovo(r);
    expect(r.result.current.levantamento).toMatchObject({ data: HOJE, feitoPor: "Rita Gomes", estado: "porFazer" });
    expect(r.result.current.rascunho.dados).toEqual({ data: HOJE, estado: "porFazer", feitoPor: "Rita Gomes" });
  });

  it("corrigir a data, o estado ou o comercial muda o que se entrega", () => {
    const r = montar();
    escolherNovo(r);
    act(() => r.result.current.lev.acoes.mudar({ data: "2026-10-05", estado: "feito", feitoPor: "Tomás Reis" }));
    expect(r.result.current.rascunho.dados).toEqual({ data: "2026-10-05", estado: "feito", feitoPor: "Tomás Reis" });
  });

  it("a data limpa a meio da escrita fica limpa no campo (hoje só vale ao validar e ao entregar)", () => {
    const r = montar();
    escolherNovo(r);
    act(() => r.result.current.lev.acoes.mudar({ data: "" }));
    expect(r.result.current.levantamentoMostrado.data).toBe("");
    expect(r.result.current.errosLevantamento).toEqual({});
    expect(r.result.current.rascunho.dados).toMatchObject({ data: HOJE });
  });

  it("uma data inválida dá erro (só com o levantamento novo escolhido)", () => {
    const r = montar();
    act(() => r.result.current.lev.acoes.mudar({ data: "1999-01-01" }));
    expect(r.result.current.errosLevantamento).toEqual({});
    escolherNovo(r);
    expect(r.result.current.errosLevantamento.data).toBe("invalido");
  });

  it("com uma visita nova a representá-lo herda os dados dela e não entrega dados próprios", () => {
    const r = montar();
    escolherNovo(r);
    act(() => { r.result.current.vis.acoes.adicionar(); });
    expect(r.result.current.levantamento.feitoPor).toBe("Rita Gomes");
    expect(r.result.current.rascunho).not.toHaveProperty("dados");
    // Um erro de data própria não se mostra: a data é da visita.
    act(() => r.result.current.lev.acoes.mudar({ data: "1999-01-01" }));
    expect(r.result.current.errosLevantamento).toEqual({});
  });

  it("sem escolher um levantamento novo não há rascunho a gravar", () => {
    const r = montar();
    expect(r.result.current.rascunho).toEqual({ linhas: [], observacoes: "", respostas: {} });
  });
});
