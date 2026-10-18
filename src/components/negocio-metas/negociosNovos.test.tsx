import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { criarNegocioNovo, negociosNovos, repor, useNegociosNovos } from "./negociosNovos";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";
import { MORADA_VAZIA } from "./moradaObra";
import { registarContacto, registarLevantamento, registarVisita, registosAtuais, repor as reporRegistos } from "./registosPessoa";

const dados = { pessoa: { id: "p-rui", nome: "Rui Figueiredo" }, comercial: "Ana Ribeiro" };

afterEach(() => { repor(); reporRegistos(); });

describe("negociosNovos", () => {
  it("começa vazio e a mesma lista enquanto não se cria nada", () => {
    expect(negociosNovos()).toEqual([]);
    expect(negociosNovos()).toBe(negociosNovos());
  });

  it("cria com ids em sequência, na ordem, sem mexer na lista anterior", () => {
    const antes = negociosNovos();
    const a = criarNegocioNovo(dados, HOJE_EXEMPLO);
    const b = criarNegocioNovo(dados, HOJE_EXEMPLO);
    expect([a.id, b.id]).toEqual(["n-novo-1", "n-novo-2"]);
    expect(negociosNovos().map((n) => n.id)).toEqual(["n-novo-1", "n-novo-2"]);
    expect(antes).toEqual([]);
  });

  it("repor() esquece tudo e recomeça a numeração", () => {
    criarNegocioNovo(dados, HOJE_EXEMPLO);
    repor();
    expect(negociosNovos()).toEqual([]);
    expect(criarNegocioNovo(dados, HOJE_EXEMPLO).id).toBe("n-novo-1");
  });

  describe("liga os registos escolhidos ao negócio criado", () => {
    const visita = { pessoaId: "p-rui", data: "2026-10-10", hora: "", feitoPor: "Ana", estado: "feita" as const, tipo: "levantamento" as const, quemVaiEstar: "", duracao: "", morada: MORADA_VAZIA, igualALead: true, nota: "" };
    const rascunho = { linhas: [], observacoes: "", respostas: {} };

    it("os contactos e as visitas marcados e o levantamento existente passam a ser do negócio; o resto fica por ligar", () => {
      const c = registarContacto({ pessoaId: "p-rui", data: "2026-10-09", resultado: "atendeuInteressado", nota: "" });
      const outroContacto = registarContacto({ pessoaId: "p-rui", data: "2026-10-08", resultado: "naoAtendeu", nota: "" });
      const v = registarVisita(visita);
      const l = registarLevantamento({ pessoaId: "p-rui", visitaId: v.id, data: "2026-10-10", feitoPor: "Ana", rascunho });
      const criado = criarNegocioNovo(
        { ...dados, ligar: { registos: [{ tipo: "contacto", id: c.id }, { tipo: "visita", id: v.id }], levantamento: { tipo: "existente", id: l.id } } },
        HOJE_EXEMPLO,
      );
      const r = registosAtuais();
      expect(r.contactos.find((x) => x.id === c.id)?.negocioId).toBe(criado.id);
      expect(r.contactos.find((x) => x.id === outroContacto.id)?.negocioId).toBeNull();
      expect(r.visitas[0].negocioId).toBe(criado.id);
      expect(r.levantamentos[0].negocioId).toBe(criado.id);
    });

    it("nada se copia: o negócio criado não leva visitas nem levantamento, só a decisão", () => {
      const v = registarVisita(visita);
      const criado = criarNegocioNovo({ ...dados, ligar: { registos: [{ tipo: "visita", id: v.id }], levantamento: { tipo: "novo" } } }, HOJE_EXEMPLO);
      expect(criado).not.toHaveProperty("visitas");
      expect(criado).not.toHaveProperty("levantamento");
      expect(criado.decisaoLevantamento).toBe("ligado");
    });

    it("um registo de outra pessoa, ou já ligado a outro negócio, não se liga", () => {
      const doutra = registarContacto({ pessoaId: "p-outra", data: "2026-10-09", resultado: "atendeuInteressado", nota: "" });
      const primeiro = criarNegocioNovo({ ...dados, ligar: { registos: [], levantamento: { tipo: "dispensar" } } }, HOJE_EXEMPLO);
      const v = registarVisita(visita);
      criarNegocioNovo({ ...dados, ligar: { registos: [{ tipo: "visita", id: v.id }], levantamento: { tipo: "novo" } } }, HOJE_EXEMPLO);
      criarNegocioNovo({ ...dados, ligar: { registos: [{ tipo: "visita", id: v.id }, { tipo: "contacto", id: doutra.id }], levantamento: { tipo: "novo" } } }, HOJE_EXEMPLO);
      expect(registosAtuais().visitas[0].negocioId).toBe("n-novo-2");
      expect(registosAtuais().contactos[0].negocioId).toBeNull();
      expect(primeiro.id).toBe("n-novo-1");
    });

    it("sem escolha (nada a ligar) não toca nos registos", () => {
      const c = registarContacto({ pessoaId: "p-rui", data: "2026-10-09", resultado: "atendeuInteressado", nota: "" });
      const antes = registosAtuais();
      criarNegocioNovo(dados, HOJE_EXEMPLO);
      expect(registosAtuais()).toBe(antes);
      expect(registosAtuais().contactos[0].id).toBe(c.id);
    });
  });

  it("avisa quem está à escuta, e deixa de avisar depois de sair", () => {
    const { result, unmount } = renderHook(() => useNegociosNovos());
    expect(result.current).toHaveLength(0);
    act(() => { criarNegocioNovo(dados, HOJE_EXEMPLO); });
    expect(result.current).toHaveLength(1);
    act(() => repor());
    expect(result.current).toHaveLength(0);
    unmount();
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => { criarNegocioNovo(dados, HOJE_EXEMPLO); });
    expect(erro).not.toHaveBeenCalled();
  });
});
