// O painel «Visita e levantamento» e o «Novo negócio» ligados ao questionário da base: as secções da Visita vêm da organização, texto e número
// escrevem-se, a validação IMPEDE gravar (botão aria-disabled e o envio recusado), sem base o catálogo do código continua, o texto da organização é
// só texto (XSS) e o estado do questionário diz-se num contentor aria-live que não desaparece. Tradução simulada com as do painel.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QUESTIONARIO_BRUTO, copiarBruto } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import { QuestionarioContext, type ValorQuestionario } from "./QuestionarioContexto";
import { lerQuestionarioForm, type QuestionarioForm } from "./questionarioForm";
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
afterEach(() => { cleanup(); reporRegistos(); });

const PESSOAS: PessoaOpcao[] = [{ id: "p-rui", nome: "Rui Figueiredo" }];
const XSS = "<img src=x onerror=alert(1)>";

type Bruto = ReturnType<typeof copiarBruto>;
const questionario = (mexer?: (b: Bruto) => void): QuestionarioForm => {
  const b = copiarBruto();
  mexer?.(b);
  return lerQuestionarioForm(b)!;
};
const valor = (extra: Partial<ValorQuestionario> = {}): ValorQuestionario => ({
  questionario: questionario(), estado: "pronto", erro: null, podeGuardar: true, repetir: () => {}, recarregar: async () => null, ...extra,
});
/** Uma pergunta de número na secção Exterior, para a aba Visita também ter um campo que se valida. */
const comNumeroNoExterior = (b: Bruto): void => {
  const exterior = b.seccoes.find((s) => s.chave === "exterior")!;
  exterior.perguntas.push({
    id: "a0000000-0000-4000-8000-000000000030", chave: "distancia", texto: "Distância ao contentor", tipo: "numero", bloco: null, ordem: 9, activa: true,
    numero: { min: 0, max: 100, casas: 1, unidade: "m" }, texto_max: null, depende: null, opcoes: [],
  } as never);
};

interface Abertura { v?: ValorQuestionario; pronto?: boolean; aba?: "Visita" | "Qualificação" | "Geral" }
const dialogoRegistos = (pronto?: boolean) => {
  const aoGuardar = vi.fn(() => true);
  const ui = <NovoNegocioDialogo
    pessoas={PESSOAS} modo="registos" aberto semBotao pessoaInicialId="p-rui"
    guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar, pronto }}
  />;
  return { aoGuardar, ui };
};
const envolver = (ui: JSX.Element, v?: ValorQuestionario) => (v ? <QuestionarioContext.Provider value={v}>{ui}</QuestionarioContext.Provider> : ui);

function abrirRegistos({ v, pronto, aba = "Visita" }: Abertura = {}) {
  const { aoGuardar, ui } = dialogoRegistos(pronto);
  const r = render(envolver(ui, v));
  const d = screen.getByRole("dialog", { name: "Novo negócio" });
  fireEvent.mouseDown(within(d).getByRole("tab", { name: new RegExp(`^${aba}`) }));
  const reabrir = (novo: ValorQuestionario) => r.rerender(envolver(ui, novo));
  return { aoGuardar, d, reabrir };
}
const botaoGuardar = (d: HTMLElement) => within(d).getByRole("button", { name: "Guardar o levantamento" });
const seccoes = (d: HTMLElement) => within(within(d).getByRole("navigation", { name: "Secções da visita" })).getAllByRole("button").map((b) => b.textContent ?? "");

describe("aba Visita com o questionário da base", () => {
  it("a lista de secções é a da organização (e não as sete do código)", () => {
    const { d } = abrirRegistos({ v: valor() });
    const nomes = seccoes(d).join("|");
    expect(nomes).toContain("Visitas");
    expect(nomes).toContain("Exterior do edifício");
    expect(nomes).toContain("Medidas da área");
    expect(nomes).not.toContain("Interior do espaço");
    expect(seccoes(d)).toHaveLength(3);
  });

  it("uma pergunta de texto da base escreve-se e vai no rascunho que se guarda", () => {
    const { aoGuardar, d } = abrirRegistos({ v: valor() });
    fireEvent.click(within(d).getByRole("button", { name: /^Exterior do edifício/ }));
    expect(within(d).getByRole("heading", { level: 3, name: "Exterior do edifício" })).toBeInTheDocument();
    fireEvent.change(within(d).getByRole("textbox", { name: "Notas sobre o exterior" }), { target: { value: "portão avariado" } });
    fireEvent.click(botaoGuardar(d));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
    expect((aoGuardar.mock.calls[0] as unknown[])[0]).toMatchObject({ respostas: { notas: "portão avariado" } });
  });

  it("o contador do passo e das secções conta as perguntas da base", () => {
    const { d } = abrirRegistos({ v: valor() });
    fireEvent.click(within(d).getByRole("button", { name: /^Exterior do edifício/ }));
    expect(within(d).getByText(/Passo 2 de 3 · faltam 2 respostas/)).toBeInTheDocument();
    fireEvent.change(within(d).getByRole("textbox", { name: "Notas sobre o exterior" }), { target: { value: "ok" } });
    expect(within(d).getByText(/Passo 2 de 3 · falta 1 resposta/)).toBeInTheDocument();
  });

  it("sem base (sem fornecedor, o protótipo) continuam as sete secções do catálogo do código e guarda-se", () => {
    const { aoGuardar, d } = abrirRegistos();
    expect(seccoes(d).join("|")).toContain("Interior do espaço");
    expect(seccoes(d)).toHaveLength(7);
    expect(botaoGuardar(d)).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botaoGuardar(d));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });
});

describe("a validação impede gravar", () => {
  it("um número inválido na Qualificação deixa o Guardar aria-disabled, com o motivo dito, e o envio não chama o guardar", () => {
    const { aoGuardar, d } = abrirRegistos({ v: valor(), aba: "Qualificação" });
    fireEvent.change(within(d).getByRole("textbox", { name: /Orçamento do cliente/ }), { target: { value: "abc" } });
    expect(botaoGuardar(d)).toHaveAttribute("aria-disabled", "true");
    expect(botaoGuardar(d).getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(botaoGuardar(d).getAttribute("aria-describedby")!)).toHaveTextContent("Corrija as respostas assinaladas");
    fireEvent.click(botaoGuardar(d));
    fireEvent.submit(botaoGuardar(d).closest("form")!);
    expect(aoGuardar).not.toHaveBeenCalled();
    fireEvent.change(within(d).getByRole("textbox", { name: /Orçamento do cliente/ }), { target: { value: "12,5" } });
    expect(botaoGuardar(d)).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botaoGuardar(d));
    expect(aoGuardar).toHaveBeenCalledTimes(1);
  });

  it("um erro numa pergunta da aba Visita também bloqueia, e o campo diz o que está errado", () => {
    const { aoGuardar, d } = abrirRegistos({ v: valor({ questionario: questionario(comNumeroNoExterior) }) });
    fireEvent.click(within(d).getByRole("button", { name: /^Exterior do edifício/ }));
    const campo = within(d).getByRole("textbox", { name: "Distância ao contentor" });
    fireEvent.change(campo, { target: { value: "500" } });
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(botaoGuardar(d)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botaoGuardar(d));
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("com o guardar por pronto (useGuardarLevantamento().pronto falso) o botão fica aria-disabled, diz porquê, e não guarda", () => {
    const { aoGuardar, d } = abrirRegistos({ v: valor(), pronto: false });
    expect(botaoGuardar(d)).toHaveAttribute("aria-disabled", "true");
    expect(document.getElementById(botaoGuardar(d).getAttribute("aria-describedby")!)).toHaveTextContent("Não é possível guardar enquanto não carregarem");
    fireEvent.click(botaoGuardar(d));
    fireEvent.submit(botaoGuardar(d).closest("form")!);
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("com o contexto sem poder guardar (leitura falhada) também não guarda, mesmo sem o pronto da gravação", () => {
    const { aoGuardar, d } = abrirRegistos({ v: valor({ estado: "erro", podeGuardar: false, questionario: { versao: null, semBase: false, seccoes: [] } }) });
    expect(botaoGuardar(d)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botaoGuardar(d));
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("«Novo negócio»: um número inválido na Qualificação impede criar o negócio", () => {
    const aoCriar = vi.fn();
    render(envolver(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} pessoaInicialId="p-rui" />, valor()));
    fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
    const d = screen.getByRole("dialog", { name: "Novo negócio" });
    fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Qualificação/ }));
    fireEvent.change(within(d).getByRole("textbox", { name: /Orçamento do cliente/ }), { target: { value: "abc" } });
    const criar = within(d).getByRole("button", { name: "Criar negócio" });
    expect(criar).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(criar);
    fireEvent.submit(criar.closest("form")!);
    expect(aoCriar).not.toHaveBeenCalled();
    fireEvent.change(within(d).getByRole("textbox", { name: /Orçamento do cliente/ }), { target: { value: "10" } });
    expect(criar).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(criar);
    expect(aoCriar).toHaveBeenCalledTimes(1);
  });
});

describe("estado do questionário na aba Visita", () => {
  const VAZIO: QuestionarioForm = { versao: null, semBase: false, seccoes: [] };

  it("a carregar: diz-o, sem secções nem perguntas do código", () => {
    const { d } = abrirRegistos({ v: valor({ estado: "a-carregar", podeGuardar: false, questionario: VAZIO }) });
    expect(within(d).getByRole("status")).toHaveTextContent("A carregar as perguntas do levantamento");
    expect(within(d).queryByRole("navigation", { name: "Secções da visita" })).not.toBeInTheDocument();
  });

  it("erro: aviso com «Repetir», que pede de novo", () => {
    const repetir = vi.fn();
    const { d } = abrirRegistos({ v: valor({ estado: "erro", podeGuardar: false, repetir, questionario: VAZIO }) });
    expect(within(d).getByRole("alert")).toHaveTextContent("Não foi possível carregar as perguntas do levantamento");
    fireEvent.click(within(d).getByRole("button", { name: "Repetir" }));
    expect(repetir).toHaveBeenCalledTimes(1);
  });

  it("o contentor aria-live existe sempre (vazio quando está pronto) e é nele que o estado aparece e desaparece", () => {
    const { d, reabrir } = abrirRegistos({ v: valor() });
    const caixa = within(d).getByTestId("estado-questionario");
    expect(caixa).toHaveAttribute("aria-live", "polite");
    expect(caixa).toBeEmptyDOMElement();
    reabrir(valor({ estado: "a-carregar", podeGuardar: false, questionario: VAZIO }));
    expect(within(d).getByTestId("estado-questionario")).toBe(caixa);
    expect(caixa).toHaveTextContent("A carregar as perguntas do levantamento");
  });

  it("depois de «Repetir» dar certo o foco não cai no corpo: vai para o contentor, que diz que as perguntas carregaram", () => {
    const erro = valor({ estado: "erro", podeGuardar: false, questionario: VAZIO });
    const { d, reabrir } = abrirRegistos({ v: erro });
    fireEvent.click(within(d).getByRole("button", { name: "Repetir" }));
    reabrir(valor({ estado: "a-carregar", podeGuardar: false, questionario: VAZIO }));
    reabrir(valor());
    const caixa = within(d).getByTestId("estado-questionario");
    expect(caixa).toHaveFocus();
    expect(caixa).toHaveTextContent("As perguntas do levantamento foram carregadas");
  });
});

describe("aba Qualificação sem perguntas ativas", () => {
  it("pronto mas sem nenhuma pergunta de qualificação: diz-o em vez de ficar só a morada", () => {
    const sem = valor({ questionario: questionario((b) => { b.seccoes = b.seccoes.filter((s) => s.chave !== "qualificacao"); }) });
    const { d } = abrirRegistos({ v: sem, aba: "Qualificação" });
    expect(within(d).getByText("Não há perguntas de qualificação ativas.")).toBeInTheDocument();
    expect(within(d).getByLabelText("Código postal")).toBeInTheDocument();
  });

  it("com perguntas, o aviso não aparece", () => {
    const { d } = abrirRegistos({ v: valor(), aba: "Qualificação" });
    expect(within(d).queryByText("Não há perguntas de qualificação ativas.")).not.toBeInTheDocument();
  });
});

describe("o texto da organização é só texto no formulário (XSS armazenado)", () => {
  const maldoso = (b: Bruto): void => {
    const exterior = b.seccoes.find((s) => s.chave === "exterior")!;
    exterior.titulo = XSS;
    exterior.perguntas[0].texto = XSS;
    exterior.perguntas[0].bloco = XSS;
    exterior.perguntas[0].opcoes[0].texto = XSS;
    const qual = b.seccoes.find((s) => s.chave === "qualificacao")!;
    qual.titulo = XSS;
    qual.perguntas[0].texto = XSS;
    qual.perguntas[0].opcoes[0].texto = XSS;
  };

  it("secção, bloco, pergunta e opção da aba Visita aparecem como texto, sem criar elementos", () => {
    const { d } = abrirRegistos({ v: valor({ questionario: questionario(maldoso) }) });
    fireEvent.click(within(d).getByRole("button", { name: new RegExp(XSS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
    expect(document.body.querySelector("img")).toBeNull();
    expect(within(d).getAllByText(XSS, { exact: false }).length).toBeGreaterThanOrEqual(3);
  });

  it("título da secção, pergunta e opção da aba Qualificação também", () => {
    const { d } = abrirRegistos({ v: valor({ questionario: questionario(maldoso) }), aba: "Qualificação" });
    expect(document.body.querySelector("img")).toBeNull();
    expect(within(d).getByRole("heading", { level: 3, name: XSS })).toBeInTheDocument();
  });
});
