// O estado do assistente, os casos de corrida: avançar pelo ID do passo (e não pelo índice do render do clique, que fica velho depois de um await) e o
// passo inicial certo quando o questionário ainda está a carregar (uma secção por carregar não conta como completa nem fixa o passo).
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAssistente } from "./useAssistente";
import type { PassoAssistente } from "./tiposAssistente";

const passo = (id: string, feito = false): PassoAssistente => ({ id, icone: "telefone", obrigatorias: 1, respondidas: feito ? 1 : 0, precisaNegocio: false });

describe("avancarDe: navega pelo id do passo, com a lista de agora", () => {
  it("depois de a lista ganhar um passo, avançar a partir de «b» vai ao que vem depois de «b» na lista nova", () => {
    const { result, rerender } = renderHook(({ passos }) => useAssistente(passos, { inicial: 1 }), {
      initialProps: { passos: [passo("a", true), passo("b"), passo("c")] },
    });
    // O clique guardou esta função antes do await; a lista mudou enquanto a gravação corria.
    const doClique = result.current.avancarDe;
    rerender({ passos: [passo("a", true), passo("b"), passo("novo"), passo("c")] });
    act(() => doClique("b"));
    expect(result.current.passo?.id).toBe("novo");
  });

  it("se o passo de onde se avança já não existe, não salta para um sítio ao acaso", () => {
    const { result, rerender } = renderHook(({ passos }) => useAssistente(passos, { inicial: 1 }), { initialProps: { passos: [passo("a"), passo("b"), passo("c")] } });
    const doClique = result.current.avancarDe;
    rerender({ passos: [passo("a"), passo("c")] });
    act(() => doClique("b"));
    expect(result.current.indice).toBeGreaterThanOrEqual(0);
    expect(result.current.indice).toBeLessThanOrEqual(1);
  });

  it("no último passo fica no último", () => {
    const { result } = renderHook(() => useAssistente([passo("a"), passo("b")], { inicial: 1 }));
    act(() => result.current.avancarDe("b"));
    expect(result.current.passo?.id).toBe("b");
  });
});

describe("o passo inicial com o questionário ainda a carregar", () => {
  it("enquanto não está pronto não fixa o passo: quando chega o questionário abre no primeiro que falta", () => {
    const aCarregar = [passo("visitas", true), passo("fechar")];
    const carregado = [passo("visitas", true), passo("s1"), passo("s2"), passo("fechar")];
    const { result, rerender } = renderHook(({ passos, pronto }) => useAssistente(passos, { pronto }), { initialProps: { passos: aCarregar, pronto: false } });
    rerender({ passos: carregado, pronto: true });
    expect(result.current.passo?.id).toBe("s1");
  });

  it("depois de pronto o passo fica fixo: responder não o muda debaixo dos pés", () => {
    const { result, rerender } = renderHook(({ passos }) => useAssistente(passos, { pronto: true }), { initialProps: { passos: [passo("a"), passo("b")] } });
    expect(result.current.passo?.id).toBe("a");
    rerender({ passos: [passo("a", true), passo("b")] });
    expect(result.current.passo?.id).toBe("a");
  });

  it("se o utilizador já escolheu um passo antes de estar pronto, essa escolha manda", () => {
    const { result, rerender } = renderHook(({ passos, pronto }) => useAssistente(passos, { pronto }), {
      initialProps: { passos: [passo("visitas", true), passo("fechar")], pronto: false },
    });
    act(() => result.current.irPara(1));
    rerender({ passos: [passo("visitas", true), passo("s1"), passo("fechar")], pronto: true });
    expect(result.current.passo?.id).toBe("fechar");
  });

  it("sem a opção pronto o comportamento é o de sempre (abre no primeiro que falta)", () => {
    const { result } = renderHook(() => useAssistente([passo("a", true), passo("b")]));
    expect(result.current.passo?.id).toBe("b");
  });
});
