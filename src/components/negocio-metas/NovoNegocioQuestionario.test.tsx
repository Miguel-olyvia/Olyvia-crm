// A aba Qualificação de «Novo negócio» a ler as perguntas do questionário que o contexto dá (a base), como uma secção igual às outras, e a
// continuar com o catálogo do código sem fornecedor (o protótipo sem base). Tradução simulada com as do painel.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QUESTIONARIO_BRUTO } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import { QuestionarioContext, type ValorQuestionario } from "./QuestionarioContexto";
import { lerQuestionarioForm } from "./questionarioForm";
import { repor as reporRegistos } from "./registosPessoa";
import type { PessoaOpcao } from "./novoNegocio";

vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});
afterEach(reporRegistos);

const PESSOAS: PessoaOpcao[] = [{ id: "p-rui", nome: "Rui Figueiredo" }];
const valor = (extra: Partial<ValorQuestionario> = {}): ValorQuestionario => ({
  questionario: lerQuestionarioForm(QUESTIONARIO_BRUTO)!, estado: "pronto", erro: null, podeGuardar: true, repetir: () => {}, recarregar: async () => null, ...extra,
});

function abrir(v?: ValorQuestionario) {
  const aoCriar = vi.fn();
  const dialogo = <NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} pessoaInicialId="p-rui" />;
  render(v ? <QuestionarioContext.Provider value={v}>{dialogo}</QuestionarioContext.Provider> : dialogo);
  fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
  const d = screen.getByRole("dialog", { name: "Novo negócio" });
  fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Qualificação/ }));
  return { aoCriar, d };
}

describe("aba Qualificação com o questionário da base", () => {
  it("mostra as perguntas da organização (e não as seis do código) e conta sobre elas", () => {
    const { d } = abrir(valor());
    expect(within(d).getByRole("group", { name: "Tipo de imóvel" })).toBeInTheDocument();
    expect(within(d).getByRole("textbox", { name: /Orçamento do cliente/ })).toBeInTheDocument();
    expect(within(d).queryByRole("radiogroup", { name: "Quem decide" })).not.toBeInTheDocument();
    expect(within(d).getByText("0 de 2 respondidas")).toBeInTheDocument();
  });

  it("responder (múltipla e número) conta na aba e o negócio leva o texto das respostas, com a unidade", () => {
    const { aoCriar, d } = abrir(valor());
    fireEvent.click(within(d).getByRole("checkbox", { name: "Moradia" }));
    fireEvent.click(within(d).getByRole("checkbox", { name: "Apartamento" }));
    fireEvent.change(within(d).getByRole("textbox", { name: /Orçamento do cliente/ }), { target: { value: "12,5" } });
    expect(within(d).getByText("2 de 2 respondidas")).toBeInTheDocument();
    expect(within(d).getByRole("tab", { name: /^Qualificação.*2 respostas/ })).toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriar).toHaveBeenCalledTimes(1);
    expect(aoCriar.mock.calls[0][0].qualificacao).toEqual([
      { pergunta: "Tipo de imóvel", resposta: "Apartamento, Moradia" },
      { pergunta: "Orçamento do cliente", resposta: "12,5 €" },
    ]);
  });

  it("o texto da pergunta e das respostas é o da organização, escrito por ela (não uma chave de tradução)", () => {
    const { d } = abrir(valor());
    expect(within(d).getByRole("checkbox", { name: "Apartamento" })).toBeInTheDocument();
    expect(within(d).queryByText(/businessGoals\./)).not.toBeInTheDocument();
  });

  it("a morada da obra continua na aba, ao lado das perguntas", () => {
    const { d } = abrir(valor());
    expect(within(d).getByLabelText("Código postal")).toBeInTheDocument();
  });

  it("sem secção de Qualificação a aba não rebenta: só a morada", () => {
    const sem = valor({ questionario: { versao: 1, semBase: false, seccoes: [] } });
    const { d } = abrir(sem);
    expect(within(d).queryByRole("group")).not.toBeInTheDocument();
    expect(within(d).getByLabelText("Código postal")).toBeInTheDocument();
  });
});

describe("aba Qualificação: estado do questionário", () => {
  it("a carregar: diz-o e não mostra perguntas", () => {
    const { d } = abrir(valor({ estado: "a-carregar", podeGuardar: false, questionario: { versao: null, semBase: false, seccoes: [] } }));
    expect(within(d).getByRole("status")).toHaveTextContent("A carregar as perguntas do levantamento");
    expect(within(d).queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("erro: aviso com «Repetir», que pede de novo, e a morada continua disponível", () => {
    const repetir = vi.fn();
    const { d } = abrir(valor({ estado: "erro", podeGuardar: false, repetir, questionario: { versao: null, semBase: false, seccoes: [] } }));
    expect(within(d).getByRole("alert")).toHaveTextContent("Não foi possível carregar as perguntas do levantamento");
    fireEvent.click(within(d).getByRole("button", { name: "Repetir" }));
    expect(repetir).toHaveBeenCalledTimes(1);
    expect(within(d).getByLabelText("Código postal")).toBeInTheDocument();
  });
});

describe("sem fornecedor (o protótipo sem base)", () => {
  it("continua com as seis perguntas do catálogo do código, de escolha única", () => {
    const { d } = abrir();
    for (const p of ["Tipo de imóvel", "O cliente é", "Quem decide", "Orçamento do cliente", "Para quando", "Pediu outros orçamentos"]) {
      expect(within(d).getByRole("radiogroup", { name: p })).toBeInTheDocument();
    }
    expect(within(d).getByText("0 de 6 respondidas")).toBeInTheDocument();
  });
});
