// O rascunho do levantamento: o que o utilizador escreveu por cima do que a base tem. Vive no diálogo (e não no separador) para sobreviver
// à troca de separador e para o diálogo saber se há alterações por gravar. Guarda a versão em que as alterações começaram.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { criarPergunta, lerQuestionario, type QuestionarioEd } from "./questionario";
import { adicionarPergunta, alterarSeccao } from "./questionarioEdicao";
import { QUESTIONARIO_BRUTO, uuid } from "./questionarioTestUtil";
import { useRascunhoQuestionario } from "./useRascunhoQuestionario";

const dados = (versao = 7): QuestionarioEd => ({ ...lerQuestionario(QUESTIONARIO_BRUTO)!, versao });
const montar = (d: QuestionarioEd | null, habilitado = true) =>
  renderHook((p: { d: QuestionarioEd | null; h: boolean }) => useRascunhoQuestionario(p.d, p.h), { initialProps: { d, h: habilitado } });

describe("useRascunhoQuestionario", () => {
  it("sem alterações mostra o que a base tem, na versão da base, e não está sujo", () => {
    const { result } = montar(dados());
    expect(result.current.seccoes.map((s) => s.titulo)).toEqual(["Visitas", "Exterior do edifício", "Medidas da área", "Qualificação"]);
    expect(result.current.versao).toBe(7);
    expect(result.current.sujo).toBe(false);
  });

  it("temRascunho: só depois de alterar (mesmo que se volte ao que a base tem) e até descartar", () => {
    const { result } = montar(dados());
    expect(result.current.temRascunho).toBe(false);
    act(() => result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "Fachada" })));
    expect(result.current.temRascunho).toBe(true);
    act(() => result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "Exterior do edifício" })));
    expect(result.current.sujo).toBe(false);
    expect(result.current.temRascunho).toBe(true);
    act(() => result.current.descartar());
    expect(result.current.temRascunho).toBe(false);
  });

  it("sem dados ainda não há secções nem versão, e alterar não faz nada", () => {
    const { result } = montar(null);
    expect(result.current.seccoes).toEqual([]);
    act(() => result.current.alterar((s) => s));
    expect(result.current.sujo).toBe(false);
  });

  it("alterar cria o rascunho a partir da base, fixa a versão e fica sujo", () => {
    const { result, rerender } = montar(dados(7));
    act(() => result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "Fachada" })));
    expect(result.current.seccoes[1].titulo).toBe("Fachada");
    expect(result.current.sujo).toBe(true);
    // A base muda entretanto (outra pessoa gravou): o rascunho conserva a versão em que começou.
    rerender({ d: dados(9), h: true });
    expect(result.current.versao).toBe(7);
    expect(result.current.seccoes[1].titulo).toBe("Fachada");
  });

  it("voltar ao que a base tem deixa de estar sujo", () => {
    const { result } = montar(dados());
    act(() => result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "Fachada" })));
    expect(result.current.sujo).toBe(true);
    act(() => result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "Exterior do edifício" })));
    expect(result.current.sujo).toBe(false);
  });

  it("alterações seguidas somam-se (a função recebe o rascunho atual)", () => {
    const { result } = montar(dados());
    act(() => {
      result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "A" }));
      result.current.alterar((s) => alterarSeccao(s, uuid(4), { titulo: "B" }));
    });
    expect(result.current.seccoes.map((s) => s.titulo)).toEqual(["Visitas", "A", "Medidas da área", "B"]);
  });

  it("alterar limpa as condições que ficaram sem sentido", () => {
    const { result } = montar(dados());
    act(() => result.current.alterar((s) => adicionarPergunta(s, uuid(2), criarPergunta("texto"))));
    act(() => result.current.alterar((s) => s.map((x) => ({ ...x, perguntas: x.perguntas.filter((p) => p.k !== uuid(10)) }))));
    expect(result.current.seccoes[1].perguntas.find((p) => p.k === uuid(11))?.depende).toBeNull();
  });

  it("rebasear muda a versão do rascunho sem perder o que se escreveu", () => {
    const { result } = montar(dados(7));
    act(() => result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "Fachada" })));
    act(() => result.current.rebasear(9));
    expect(result.current.versao).toBe(9);
    expect(result.current.seccoes[1].titulo).toBe("Fachada");
    expect(result.current.sujo).toBe(true);
  });

  it("descartar volta ao que a base tem, na versão atual da base", () => {
    const { result, rerender } = montar(dados(7));
    act(() => result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "Fachada" })));
    rerender({ d: dados(9), h: true });
    act(() => result.current.descartar());
    expect(result.current.sujo).toBe(false);
    expect(result.current.versao).toBe(9);
    expect(result.current.seccoes[1].titulo).toBe("Exterior do edifício");
  });

  it("ao desligar (diálogo fechado) o rascunho desaparece", () => {
    const { result, rerender } = montar(dados());
    act(() => result.current.alterar((s) => alterarSeccao(s, uuid(2), { titulo: "Fachada" })));
    rerender({ d: dados(), h: false });
    expect(result.current.sujo).toBe(false);
    expect(result.current.seccoes[1].titulo).toBe("Exterior do edifício");
  });
});
