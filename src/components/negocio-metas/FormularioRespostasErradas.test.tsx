// Guardar (ou Criar negócio) recusado por uma resposta errada tem de LEVAR ao erro: abre a aba e a secção da primeira resposta errada e põe o foco no
// campo, marca a aba e a secção com erros, e o aviso do rodapé é uma região live que já existia (para ser lido quando aparece). «Criar negócio» não cria
// com as perguntas por carregar. Tradução simulada com as do painel.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { copiarBruto } from "@/hooks/pessoas/workflow/questionarioTestUtil";
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

type Bruto = ReturnType<typeof copiarBruto>;
const comNumeroNoExterior = (b: Bruto): void => {
  const exterior = b.seccoes.find((s) => s.chave === "exterior")!;
  exterior.perguntas.push({
    id: "a0000000-0000-4000-8000-000000000030", chave: "distancia", texto: "Distância ao contentor", tipo: "numero", bloco: null, ordem: 9, activa: true,
    numero: { min: 0, max: 100, casas: 1, unidade: "m" }, texto_max: null, depende: null, opcoes: [],
  } as never);
};
const questionario = (): QuestionarioForm => {
  const b = copiarBruto();
  comNumeroNoExterior(b);
  return lerQuestionarioForm(b)!;
};
const valor = (extra: Partial<ValorQuestionario> = {}): ValorQuestionario => ({
  questionario: questionario(), estado: "pronto", erro: null, podeGuardar: true, repetir: () => {}, recarregar: async () => null, ...extra,
});

function abrirRegistos(v: ValorQuestionario = valor()) {
  const aoGuardar = vi.fn(() => true);
  render(
    <QuestionarioContext.Provider value={v}>
      <NovoNegocioDialogo
        pessoas={PESSOAS} modo="registos" aberto semBotao pessoaInicialId="p-rui" guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar }}
      />
    </QuestionarioContext.Provider>,
  );
  const d = screen.getByRole("dialog", { name: "Novo negócio" });
  return { aoGuardar, d };
}
const aba = (d: HTMLElement, nome: RegExp) => within(d).getByRole("tab", { name: nome });
const irParaAba = (d: HTMLElement, nome: RegExp) => fireEvent.mouseDown(aba(d, nome));
const botaoGuardar = (d: HTMLElement) => within(d).getByRole("button", { name: "Guardar o levantamento" });

/** Escreve um número fora dos limites na Distância (secção Exterior da aba Visita). */
function errarDistancia(d: HTMLElement): void {
  irParaAba(d, /^Visita/);
  fireEvent.click(within(d).getByRole("button", { name: /^Exterior do edifício/ }));
  fireEvent.change(within(d).getByRole("textbox", { name: "Distância ao contentor" }), { target: { value: "500" } });
}
function errarOrcamento(d: HTMLElement): void {
  irParaAba(d, /^Qualificação/);
  fireEvent.change(within(d).getByRole("textbox", { name: /Orçamento do cliente/ }), { target: { value: "abc" } });
}

describe("Guardar recusado leva ao primeiro erro (painel «Visita e levantamento»)", () => {
  it("o erro está noutra aba e secção: abre a aba Visita, a secção Exterior e foca o campo", async () => {
    const { aoGuardar, d } = abrirRegistos();
    errarDistancia(d);
    irParaAba(d, /^Geral/);
    fireEvent.click(within(d).getByRole("button", { name: "Guardar o levantamento" }));
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(aba(d, /^Visita/)).toHaveAttribute("aria-selected", "true");
    expect(within(d).getByRole("heading", { level: 3, name: "Exterior do edifício" })).toBeInTheDocument();
    await waitFor(() => expect(within(d).getByRole("textbox", { name: "Distância ao contentor" })).toHaveFocus());
  });

  it("a secção das Visitas aberta e o erro no Exterior: muda de secção", async () => {
    const { d } = abrirRegistos();
    errarDistancia(d);
    fireEvent.click(within(d).getByRole("button", { name: /^Visitas/ }));
    fireEvent.click(botaoGuardar(d));
    await waitFor(() => expect(within(d).getByRole("textbox", { name: "Distância ao contentor" })).toHaveFocus());
  });

  it("o erro está na Qualificação: abre essa aba e foca o campo (Enter a enviar o formulário faz o mesmo)", async () => {
    const { aoGuardar, d } = abrirRegistos();
    errarOrcamento(d);
    irParaAba(d, /^Visita/);
    fireEvent.submit(botaoGuardar(d).closest("form")!);
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(aba(d, /^Qualificação/)).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(within(d).getByRole("textbox", { name: /Orçamento do cliente/ })).toHaveFocus());
  });

  it("a aba e a secção com a resposta errada ficam marcadas «com erros»", () => {
    const { d } = abrirRegistos();
    errarDistancia(d);
    expect(aba(d, /^Visita/)).toHaveAccessibleName(/com erros/);
    expect(aba(d, /^Qualificação/)).not.toHaveAccessibleName(/com erros/);
    const lista = within(within(d).getByRole("navigation", { name: "Secções da visita" }));
    expect(lista.getByRole("button", { name: /^Exterior do edifício/ })).toHaveAccessibleName(/com erros/);
    expect(lista.getByRole("button", { name: /^Visitas/ })).not.toHaveAccessibleName(/com erros/);
    fireEvent.change(within(d).getByRole("textbox", { name: "Distância ao contentor" }), { target: { value: "5" } });
    expect(aba(d, /^Visita/)).not.toHaveAccessibleName(/com erros/);
  });

  it("a aba Qualificação marca-se quando é nela que a resposta está errada", () => {
    const { d } = abrirRegistos();
    errarOrcamento(d);
    expect(aba(d, /^Qualificação/)).toHaveAccessibleName(/com erros/);
  });

  it("o aviso do rodapé está numa região live que já existia antes do erro", () => {
    const { d } = abrirRegistos();
    const regiao = within(d).getByTestId("aviso-guardar");
    expect(regiao).toHaveAttribute("aria-live", "polite");
    expect(regiao).toBeEmptyDOMElement();
    errarOrcamento(d);
    expect(within(d).getByTestId("aviso-guardar")).toBe(regiao);
    expect(regiao).toHaveTextContent("Corrija as respostas assinaladas");
  });

  it("sem perguntas carregadas, recusar não vai a lado nenhum e o aviso diz porquê", () => {
    const { aoGuardar, d } = abrirRegistos(valor({ estado: "erro", podeGuardar: false }));
    fireEvent.click(botaoGuardar(d));
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(aba(d, /^Geral/)).toHaveAttribute("aria-selected", "true");
    expect(within(d).getByTestId("aviso-guardar")).toHaveTextContent("Não é possível guardar");
  });
});

describe("«Novo negócio»", () => {
  function abrirNovo(v: ValorQuestionario | null = valor()) {
    const aoCriar = vi.fn();
    const dialogo = <NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} pessoaInicialId="p-rui" />;
    render(v ? <QuestionarioContext.Provider value={v}>{dialogo}</QuestionarioContext.Provider> : dialogo);
    fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
    return { aoCriar, d: screen.getByRole("dialog", { name: "Novo negócio" }) };
  }

  it("Criar recusado com uma resposta errada abre a aba Qualificação, foca o campo e marca a aba", async () => {
    const { aoCriar, d } = abrirNovo();
    irParaAba(d, /^Qualificação/);
    fireEvent.change(within(d).getByRole("textbox", { name: /Orçamento do cliente/ }), { target: { value: "abc" } });
    irParaAba(d, /^Geral/);
    expect(aba(d, /^Qualificação/)).toHaveAccessibleName(/com erros/);
    fireEvent.click(within(d).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriar).not.toHaveBeenCalled();
    expect(aba(d, /^Qualificação/)).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(within(d).getByRole("textbox", { name: /Orçamento do cliente/ })).toHaveFocus());
  });

  it("com as perguntas a carregar não cria: Criar fica aria-disabled, diz porquê e o envio não cria", () => {
    const { aoCriar, d } = abrirNovo(valor({ estado: "a-carregar", podeGuardar: false, questionario: { versao: null, semBase: false, seccoes: [] } }));
    const criar = within(d).getByRole("button", { name: "Criar negócio" });
    expect(criar).toHaveAttribute("aria-disabled", "true");
    expect(document.getElementById(criar.getAttribute("aria-describedby")!)).toHaveTextContent("Não é possível guardar enquanto não carregarem");
    fireEvent.click(criar);
    fireEvent.submit(criar.closest("form")!);
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("com a leitura das perguntas falhada também não cria", () => {
    const { aoCriar, d } = abrirNovo(valor({ estado: "erro", podeGuardar: false, questionario: { versao: null, semBase: false, seccoes: [] } }));
    fireEvent.click(within(d).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("sem base (o protótipo) continua a criar", () => {
    const { aoCriar, d } = abrirNovo(null);
    fireEvent.click(within(d).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriar).toHaveBeenCalledTimes(1);
  });
});

describe("«Repetir» que falha não deixa a recarga seguinte roubar o foco", () => {
  const VAZIO: QuestionarioForm = { versao: null, semBase: false, seccoes: [] };
  const ecra = (v: ValorQuestionario) => (
    <QuestionarioContext.Provider value={v}>
      <NovoNegocioDialogo pessoas={PESSOAS} modo="registos" aberto semBotao pessoaInicialId="p-rui" guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar: () => true }} />
    </QuestionarioContext.Provider>
  );

  it("depois de uma repetição falhada, uma recarga que dá certo (sem ninguém a pedir) não foca nem anuncia", () => {
    const { rerender } = render(ecra(valor({ estado: "erro", podeGuardar: false, questionario: VAZIO })));
    const d = screen.getByRole("dialog", { name: "Novo negócio" });
    fireEvent.mouseDown(within(d).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(d).getByRole("button", { name: "Repetir" }));
    rerender(ecra(valor({ estado: "a-carregar", podeGuardar: false, questionario: VAZIO })));
    rerender(ecra(valor({ estado: "erro", podeGuardar: false, questionario: VAZIO })));
    rerender(ecra(valor()));
    const caixa = within(d).getByTestId("estado-questionario");
    expect(caixa).not.toHaveFocus();
    expect(caixa).not.toHaveTextContent("foram carregadas");
  });
});
