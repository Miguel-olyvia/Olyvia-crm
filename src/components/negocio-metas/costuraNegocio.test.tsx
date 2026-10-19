// A costura entre o protótipo (stores em memória) e a ficha real: os hooks que os ecrãs do negócio já usavam consultam primeiro o
// contexto `DadosNegocioContext`; sem provider devolvem o store, por isso o exemplo e os testes antigos ficam iguais.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { DadosNegocioContext, type DadosNegocio } from "./costuraNegocio";
import { DETALHES_EXEMPLO } from "./negocioDetalhesExemplo";
import { alteracoesAtuais, perderNegocio, repor as reporAlteracoes, useAlteracoesNegocios, useDetalheDoNegocio } from "./negociosAlterados";
import type { NegocioMes } from "./negocioMetas";
import { registarContacto, registosAtuais, repor as reporRegistos, useRegistosPessoa } from "./registosPessoa";
import { REGISTOS_VAZIOS, type EstadoRegistos } from "./registosTipos";

beforeEach(() => { reporAlteracoes(); reporRegistos(); });
afterEach(() => { reporAlteracoes(); reporRegistos(); });

const negocio: NegocioMes = {
  id: "n-store", pessoaId: "p", pessoa: "P", servico: "S", comercial: "C", dias: 1, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [], proposta: null, contrato: null,
};

const registosDaBase: EstadoRegistos = {
  ...REGISTOS_VAZIOS,
  contactos: [{ id: "c-base", pessoaId: "p", data: "2026-10-01", resultado: null, nota: "", negocioId: null }],
};

const dados = (extra: Partial<DadosNegocio> = {}): DadosNegocio => ({
  registos: registosDaBase,
  alteracoes: { editados: {}, perdidos: { "n-base": { motivo: "Preço", mes: "2026-10", data: "2026-10-05", fase: "proposta" } }, detalhes: {}, sequencia: 0 },
  detalhe: (id) => (id === "n-base" ? { orcamentos: { o1: { data: "2026-10-02", estado: "enviado" } } } : null),
  momentoGanho: "manual", podeEditar: true, podeCriar: true, leadsAbertas: [], documentosPorLigar: [],
  ...extra,
});

const comDados = (valor: DadosNegocio | null) => ({ children }: { children: ReactNode }) => (
  <DadosNegocioContext.Provider value={valor}>{children}</DadosNegocioContext.Provider>
);

describe("sem provider o store manda (o exemplo e os testes antigos)", () => {
  it("useRegistosPessoa devolve os registos do store e muda quando o store muda", () => {
    const { result } = renderHook(() => useRegistosPessoa());
    expect(result.current).toBe(registosAtuais());
    expect(result.current.contactos).toHaveLength(0);
  });

  it("useRegistosPessoa com semente semeia o store, uma vez", () => {
    renderHook(() => useRegistosPessoa(registosDaBase));
    expect(registosAtuais().contactos.map((c) => c.id)).toEqual(["c-base"]);
  });

  it("useAlteracoesNegocios devolve as alterações do store", () => {
    perderNegocio(negocio, "Preço", "2026-10-05");
    const { result } = renderHook(() => useAlteracoesNegocios());
    expect(result.current).toBe(alteracoesAtuais());
    expect(result.current.perdidos["n-store"]?.motivo).toBe("Preço");
  });

  it("useDetalheDoNegocio devolve o detalhe de exemplo do store", () => {
    const idExemplo = Object.keys(DETALHES_EXEMPLO)[0];
    const { result } = renderHook(() => useDetalheDoNegocio(idExemplo));
    expect(result.current).toEqual(DETALHES_EXEMPLO[idExemplo]);
  });

  it("um provider a null conta como sem provider", () => {
    const { result } = renderHook(() => useRegistosPessoa(), { wrapper: comDados(null) });
    expect(result.current).toBe(registosAtuais());
  });
});

describe("com provider (a ficha real) o contexto manda", () => {
  it("useRegistosPessoa devolve os registos da ficha, não os do store", () => {
    registarContacto({ pessoaId: "p", data: "2026-10-09", resultado: null, nota: "do store" });
    const { result } = renderHook(() => useRegistosPessoa(), { wrapper: comDados(dados()) });
    expect(result.current).toBe(registosDaBase);
  });

  it("com provider a semente NÃO semeia o store (a ficha real nunca polui o exemplo)", () => {
    renderHook(() => useRegistosPessoa(registosDaBase), { wrapper: comDados(dados()) });
    expect(registosAtuais().contactos).toHaveLength(0);
    // E, quando o provider desaparecer, o store ainda pode ser semeado pelo exemplo.
    renderHook(() => useRegistosPessoa(registosDaBase));
    expect(registosAtuais().contactos).toHaveLength(1);
  });

  it("useAlteracoesNegocios devolve as perdas da base, não as do store", () => {
    perderNegocio(negocio, "do store", "2026-10-05");
    const { result } = renderHook(() => useAlteracoesNegocios(), { wrapper: comDados(dados()) });
    expect(Object.keys(result.current.perdidos)).toEqual(["n-base"]);
  });

  it("useDetalheDoNegocio pergunta ao contexto, e um negócio sem detalhe dá null (nunca o exemplo de outro)", () => {
    const { result: a } = renderHook(() => useDetalheDoNegocio("n-base"), { wrapper: comDados(dados()) });
    expect(a.current?.orcamentos?.o1.estado).toBe("enviado");
    const { result: b } = renderHook(() => useDetalheDoNegocio(Object.keys(DETALHES_EXEMPLO)[0]), { wrapper: comDados(dados()) });
    expect(b.current).toBeNull();
  });

  it("o mesmo objeto de dados dá o mesmo resultado a cada render (sem redesenhos à toa)", () => {
    const d = dados();
    const { result, rerender } = renderHook(() => useRegistosPessoa(), { wrapper: comDados(d) });
    const antes = result.current;
    rerender();
    expect(result.current).toBe(antes);
  });
});
