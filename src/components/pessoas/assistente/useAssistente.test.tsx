// O estado do assistente: o passo atual, avançar, recuar, saltar e o foco. Começa no primeiro passo que ainda falta e segue o passo pelo id quando a
// lista muda (o questionário pode mudar a meio).
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAssistente } from "./useAssistente";
import type { PassoAssistente } from "./tiposAssistente";

const passo = (id: string, feito = false): PassoAssistente => ({ id, icone: "telefone", obrigatorias: 1, respondidas: feito ? 1 : 0, precisaNegocio: false });
const LISTA = [passo("a", true), passo("b"), passo("c"), passo("d")];

describe("useAssistente", () => {
  it("abre no primeiro passo que ainda falta", () => {
    const { result } = renderHook(() => useAssistente(LISTA));
    expect(result.current.indice).toBe(1);
    expect(result.current.passo?.id).toBe("b");
  });

  it("abre no primeiro quando tudo está feito", () => {
    const { result } = renderHook(() => useAssistente([passo("a", true), passo("b", true)]));
    expect(result.current.indice).toBe(0);
  });

  it("avançar e recuar andam um passo e param nas pontas", () => {
    const { result } = renderHook(() => useAssistente(LISTA, { inicial: 0 }));
    act(() => result.current.recuar());
    expect(result.current.indice).toBe(0);
    act(() => result.current.avancar());
    act(() => result.current.avancar());
    expect(result.current.indice).toBe(2);
    act(() => { result.current.avancar(); result.current.avancar(); result.current.avancar(); });
    expect(result.current.indice).toBe(3);
  });

  it("irPara escolhe um passo e ignora um índice que não existe", () => {
    const { result } = renderHook(() => useAssistente(LISTA, { inicial: 0 }));
    act(() => result.current.irPara(3));
    expect(result.current.indice).toBe(3);
    act(() => result.current.irPara(9));
    act(() => result.current.irPara(-1));
    expect(result.current.indice).toBe(3);
  });

  it("os passos por onde se passou ficam visitados (para o «!» com falta)", () => {
    const { result } = renderHook(() => useAssistente(LISTA, { inicial: 0 }));
    expect(result.current.visitados.has("a")).toBe(true);
    act(() => result.current.irPara(2));
    expect(result.current.visitados.has("c")).toBe(true);
    expect(result.current.visitados.has("d")).toBe(false);
  });

  it("cada mudança de passo pede o foco para o título", () => {
    const { result } = renderHook(() => useAssistente(LISTA, { inicial: 0 }));
    const antes = result.current.pedidoFoco;
    act(() => result.current.avancar());
    expect(result.current.pedidoFoco).toBe(antes + 1);
  });

  it("segue o passo pelo id quando a lista muda (entra um passo à frente)", () => {
    const { result, rerender } = renderHook(({ passos }) => useAssistente(passos, { inicial: 1 }), { initialProps: { passos: LISTA } });
    expect(result.current.passo?.id).toBe("b");
    rerender({ passos: [passo("a", true), passo("novo"), ...LISTA.slice(1)] });
    expect(result.current.passo?.id).toBe("b");
    expect(result.current.indice).toBe(2);
  });

  it("se o passo desaparece fica num índice válido", () => {
    const { result, rerender } = renderHook(({ passos }) => useAssistente(passos, { inicial: 3 }), { initialProps: { passos: LISTA } });
    rerender({ passos: LISTA.slice(0, 2) });
    expect(result.current.indice).toBe(1);
  });

  it("sem passos não rebenta", () => {
    const { result } = renderHook(() => useAssistente([]));
    expect(result.current.passo).toBeNull();
    act(() => result.current.avancar());
    expect(result.current.indice).toBe(0);
  });
});
