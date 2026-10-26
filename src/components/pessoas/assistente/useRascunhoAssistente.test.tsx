// O rascunho como estado do ecrã: grava a cada alteração, migra-se quando a chave muda (a pessoa passa a ter negócio) sem perder o escrito, e
// `limpar` volta ao vazio e apaga o guardado (depois de gravar com sucesso).
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { guardarRascunho, lerRascunho, RASCUNHO_VAZIO } from "./rascunhoAssistente";
import { useRascunhoAssistente } from "./useRascunhoAssistente";

beforeEach(() => window.sessionStorage.clear());

describe("useRascunhoAssistente", () => {
  it("cada alteração fica guardada na chave atual", () => {
    const { result } = renderHook(() => useRascunhoAssistente("n1"));
    act(() => result.current[1]({ observacoes: "olá" }));
    expect(result.current[0].observacoes).toBe("olá");
    expect(lerRascunho("n1").observacoes).toBe("olá");
  });

  it("quando a chave passa de pessoa a negócio, o escrito acompanha e a chave antiga fica vazia", () => {
    const { result, rerender } = renderHook(({ chave }) => useRascunhoAssistente(chave), { initialProps: { chave: "pessoa-1" } });
    act(() => result.current[1]({ preparar: { duracao: "h2", quem: "casal", nota: "levar escada" } }));
    rerender({ chave: "n7" });
    expect(result.current[0].preparar.nota).toBe("levar escada");
    expect(lerRascunho("n7").preparar.duracao).toBe("h2");
    expect(window.sessionStorage.getItem("olyvia.assistente:pessoa-1")).toBeNull();
    // E uma alteração seguinte vai para a chave nova.
    act(() => result.current[1]({ observacoes: "depois" }));
    expect(lerRascunho("n7").observacoes).toBe("depois");
    expect(window.sessionStorage.getItem("olyvia.assistente:pessoa-1")).toBeNull();
  });

  it("se o negócio já tinha rascunho, esse é que vale", () => {
    guardarRascunho("n7", { ...RASCUNHO_VAZIO, observacoes: "do negócio" });
    const { result, rerender } = renderHook(({ chave }) => useRascunhoAssistente(chave), { initialProps: { chave: "pessoa-1" } });
    act(() => result.current[1]({ observacoes: "da pessoa" }));
    rerender({ chave: "n7" });
    expect(result.current[0].observacoes).toBe("do negócio");
  });

  it("de um negócio para outro da mesma pessoa o rascunho não passa de um para o outro", () => {
    const { result, rerender } = renderHook(({ chave }) => useRascunhoAssistente(chave), { initialProps: { chave: "n1" } });
    act(() => result.current[1]({ observacoes: "do n1" }));
    rerender({ chave: "n2" });
    expect(result.current[0]).toEqual(RASCUNHO_VAZIO);
    expect(lerRascunho("n2")).toEqual(RASCUNHO_VAZIO);
    expect(lerRascunho("n1").observacoes).toBe("do n1");
    act(() => result.current[1]({ observacoes: "do n2" }));
    rerender({ chave: "n1" });
    expect(result.current[0].observacoes).toBe("do n1");
    expect(lerRascunho("n2").observacoes).toBe("do n2");
  });

  it("de um negócio para outro que já tinha rascunho mostra o desse", () => {
    guardarRascunho("n2", { ...RASCUNHO_VAZIO, observacoes: "do n2" });
    const { result, rerender } = renderHook(({ chave }) => useRascunhoAssistente(chave), { initialProps: { chave: "n1" } });
    act(() => result.current[1]({ observacoes: "do n1" }));
    rerender({ chave: "n2" });
    expect(result.current[0].observacoes).toBe("do n2");
    expect(lerRascunho("n1").observacoes).toBe("do n1");
  });

  it("limpar volta ao vazio e apaga o guardado", () => {
    const { result } = renderHook(() => useRascunhoAssistente("n1"));
    act(() => result.current[1]({ observacoes: "x", respostas: { a: "b" } }));
    act(() => result.current[2]());
    expect(result.current[0]).toEqual(RASCUNHO_VAZIO);
    expect(window.sessionStorage.getItem("olyvia.assistente:n1")).toBeNull();
  });
});
