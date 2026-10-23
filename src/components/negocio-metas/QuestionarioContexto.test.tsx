// O contexto do questionário do formulário do levantamento: sem fornecedor vale o catálogo do código (o protótipo sem base, que continua a
// funcionar), e com ele o formulário vê o estado (a carregar, erro com «Repetir», pronto) e se pode gravar.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { QuestionarioContext, useQuestionario, type ValorQuestionario } from "./QuestionarioContexto";
import { EstadoQuestionario } from "./EstadoQuestionario";
import { QUESTIONARIO_CODIGO } from "./questionarioForm";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return { useTranslation: () => ({ language: "pt", t: (key: string) => negocioMetasTranslations.pt[key] ?? key }) };
});

const valor = (extra: Partial<ValorQuestionario>): ValorQuestionario => ({
  questionario: { versao: null, semBase: false, seccoes: [] }, estado: "pronto", erro: null, podeGuardar: true, repetir: () => {}, recarregar: async () => null, ...extra,
});
const com = (v: ValorQuestionario) => ({ wrapper: ({ children }: { children: ReactNode }) => <QuestionarioContext.Provider value={v}>{children}</QuestionarioContext.Provider> });

describe("useQuestionario", () => {
  it("sem fornecedor: o catálogo do código, pronto e a poder gravar (o protótipo não tem base)", () => {
    const { result } = renderHook(() => useQuestionario());
    expect(result.current.questionario).toBe(QUESTIONARIO_CODIGO);
    expect(result.current.estado).toBe("pronto");
    expect(result.current.podeGuardar).toBe(true);
    expect(result.current.erro).toBeNull();
  });

  it("com fornecedor: o que ele der", () => {
    const v = valor({ estado: "erro", podeGuardar: false });
    const { result } = renderHook(() => useQuestionario(), com(v));
    expect(result.current).toBe(v);
  });
});

describe("EstadoQuestionario", () => {
  it("pronto: não desenha nada", () => {
    const { container } = render(<EstadoQuestionario estado="pronto" aoRepetir={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a carregar: diz-o, como estado educado para quem lê o ecrã", () => {
    render(<EstadoQuestionario estado="a-carregar" aoRepetir={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("A carregar as perguntas do levantamento");
  });

  it("erro: aviso e botão Repetir, que volta a pedir", () => {
    const aoRepetir = vi.fn();
    render(<EstadoQuestionario estado="erro" aoRepetir={aoRepetir} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar as perguntas do levantamento");
    expect(screen.getByRole("alert")).toHaveTextContent(/não é possível guardar|Não se pode guardar/i);
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    expect(aoRepetir).toHaveBeenCalledTimes(1);
  });
});

describe("EstadoQuestionario: foco e razão do erro", () => {
  it("«Repetir» não faz o foco cair no corpo da página: o botão fica (ocupado, a dizer que carrega) enquanto a leitura se repete", () => {
    const { rerender } = render(<EstadoQuestionario estado="erro" aoRepetir={() => {}} />);
    const botao = screen.getByRole("button", { name: "Repetir" });
    botao.focus();
    fireEvent.click(botao);
    rerender(<EstadoQuestionario estado="a-carregar" aoRepetir={() => {}} />);
    const ocupado = screen.getByRole("button", { name: /a carregar/i });
    expect(ocupado).toBe(botao);
    expect(ocupado).toHaveFocus();
    expect(ocupado).toHaveAttribute("aria-busy", "true");
    expect(ocupado).toHaveAttribute("aria-disabled", "true");
  });

  it("durante a repetição o botão não pede outra leitura", () => {
    const aoRepetir = vi.fn();
    const { rerender } = render(<EstadoQuestionario estado="erro" aoRepetir={aoRepetir} />);
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    rerender(<EstadoQuestionario estado="a-carregar" aoRepetir={aoRepetir} />);
    fireEvent.click(screen.getByRole("button", { name: /a carregar/i }));
    expect(aoRepetir).toHaveBeenCalledTimes(1);
  });

  it("o primeiro carregamento (sem ter falhado antes) continua a ser só o «a carregar», sem botão", () => {
    render(<EstadoQuestionario estado="a-carregar" aoRepetir={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("A carregar as perguntas do levantamento");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("se a repetição acaba e o erro volta, o botão volta a ser «Repetir»", () => {
    const { rerender } = render(<EstadoQuestionario estado="erro" aoRepetir={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    rerender(<EstadoQuestionario estado="a-carregar" aoRepetir={() => {}} />);
    rerender(<EstadoQuestionario estado="erro" aoRepetir={() => {}} />);
    expect(screen.getByRole("button", { name: "Repetir" })).not.toHaveAttribute("aria-disabled");
  });

  it.each([
    ["NG008", /ainda não tem o levantamento configurável ativo/i],
    ["42501", /não tem acesso ao levantamento desta organização/i],
  ])("%s (sem acesso à organização) diz a razão, e não a falha genérica de carregamento", (codigo, razao) => {
    const erro = Object.assign(new Error(codigo), { codigo });
    render(<QuestionarioContext.Provider value={valor({ estado: "erro", podeGuardar: false, erro })}><EstadoQuestionario estado="erro" aoRepetir={() => {}} /></QuestionarioContext.Provider>);
    expect(screen.getByRole("alert")).toHaveTextContent(razao);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/enquanto não carregarem/i);
  });

  it("uma avaria (sem código) e um erro desconhecido ficam com a mensagem genérica", () => {
    for (const erro of [null, new Error("rede"), Object.assign(new Error("x"), { codigo: "NG005" }), Object.assign(new Error("x"), { codigo: null })]) {
      const { unmount } = render(<QuestionarioContext.Provider value={valor({ estado: "erro", podeGuardar: false, erro })}><EstadoQuestionario estado="erro" aoRepetir={() => {}} /></QuestionarioContext.Provider>);
      expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível carregar as perguntas do levantamento/i);
      expect(screen.getByRole("alert")).toHaveTextContent(/enquanto não carregarem/i);
      unmount();
    }
  });
});
