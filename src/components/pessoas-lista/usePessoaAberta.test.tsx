import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { usePessoaAberta } from "./usePessoaAberta";

const embrulho = (entrada: string) => ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={[entrada]}>{children}</MemoryRouter>
);

describe("usePessoaAberta", () => {
  it("aoAbrir guarda o elemento de origem do foco e abre a ficha pelo endereço", () => {
    const { result } = renderHook(() => usePessoaAberta(), { wrapper: embrulho("/pessoas") });
    const botao = document.createElement("button");
    act(() => result.current.aoAbrir("p1", botao));
    expect(result.current.origemFoco.current).toBe(botao);
    expect(result.current.abertaId).toBe("p1");
  });

  it("aoAbrir sem origem limpa a origem anterior", () => {
    const { result } = renderHook(() => usePessoaAberta(), { wrapper: embrulho("/pessoas") });
    act(() => result.current.aoAbrir("p1", document.createElement("button")));
    act(() => result.current.aoAbrir("p2"));
    expect(result.current.origemFoco.current).toBeNull();
  });

  it("aoAbrir e aoIrPara são estáveis entre renders, mesmo quando o endereço muda", () => {
    const { result, rerender } = renderHook(() => usePessoaAberta(), { wrapper: embrulho("/pessoas") });
    const antes = { abrir: result.current.aoAbrir, ir: result.current.aoIrPara, quadro: result.current.aoAbrirQuadro, neg: result.current.aoAbrirNegocio };
    act(() => result.current.aoAbrir("p1"));
    rerender();
    expect(result.current.aoAbrir).toBe(antes.abrir);
    expect(result.current.aoIrPara).toBe(antes.ir);
    expect(result.current.aoAbrirQuadro).toBe(antes.quadro);
    expect(result.current.aoAbrirNegocio).toBe(antes.neg);
  });

  it("aoAbrirNegocio só atua se a pessoa aberta é a do negócio", () => {
    const { result } = renderHook(() => usePessoaAberta(), { wrapper: embrulho("/pessoas?open=p1") });
    act(() => result.current.aoAbrirNegocio("n9", "outra"));
    expect(result.current.negocioId).toBeNull();
    act(() => result.current.aoAbrirNegocio("n1", "p1"));
    expect(result.current.negocioId).toBe("n1");
  });

  it("aoAbrirQuadro abre a pessoa com o negócio", () => {
    const { result } = renderHook(() => usePessoaAberta(), { wrapper: embrulho("/pipeline") });
    act(() => result.current.aoAbrirQuadro("p1", "n1"));
    expect(result.current.abertaId).toBe("p1");
    expect(result.current.negocioId).toBe("n1");
  });

  it("anunciar mostra a mensagem e duas iguais seguidas anunciam-se as duas", () => {
    const { result } = renderHook(() => usePessoaAberta(), { wrapper: embrulho("/pessoas") });
    act(() => result.current.anunciar("Lead criada"));
    const primeira = result.current.mensagemAcao;
    expect(primeira.trim()).toBe("Lead criada");
    act(() => result.current.anunciar("Lead criada"));
    expect(result.current.mensagemAcao).not.toBe(primeira);
  });
});
