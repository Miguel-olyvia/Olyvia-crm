// Arranque das abas Qualificação e Visita do painel "Novo negócio": perguntas de escolha rápida acessíveis, morada da
// obra, contadores, passo da visita e o que se devolve ao criar.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import type { PessoaOpcao } from "./novoNegocio";
import { contarTotal } from "./respostasVisita";
import { SECCOES_VISITA } from "./visitaExemplo";

const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info, error: vi.fn(), success: vi.fn() } }));

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
beforeEach(() => info.mockClear());

const PESSOAS: PessoaOpcao[] = [
  { id: "p-marta", nome: "Marta Silveira", morada: "Rua A, 1000-001 Lisboa" },
  { id: "p-rui", nome: "Rui Figueiredo" },
];
const TOTAL_PERGUNTAS = contarTotal(SECCOES_VISITA, {}).total;

const abrir = () => {
  const aoCriar = vi.fn();
  render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} />);
  fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
  return { aoCriar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
};
type Dialogo = HTMLElement;
const aba = (d: Dialogo, nome: RegExp) => fireEvent.mouseDown(within(d).getByRole("tab", { name: nome }));
const seccao = (d: Dialogo, nome: RegExp) => fireEvent.click(within(d).getByRole("button", { name: nome }));
const grupo = (d: Dialogo, nome: string) => within(d).getByRole("radiogroup", { name: nome });
const opcao = (d: Dialogo, pergunta: string, texto: string) => within(grupo(d, pergunta)).getByRole("radio", { name: texto });
const criar = (d: Dialogo) => fireEvent.click(within(d).getByRole("button", { name: "Criar negócio" }));
const escolherPessoa = async (d: Dialogo, nome: string) => {
  fireEvent.keyDown(within(d).getByRole("combobox", { name: /^Pessoa/ }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: nome }));
};

describe("aba Qualificação", () => {
  it("tem as seis perguntas (todas opcionais, sem 'obrigatório') e a morada da obra, com 0 de 6", () => {
    const { dialogo } = abrir();
    aba(dialogo, /^Qualificação/);
    for (const p of ["Tipo de imóvel", "O cliente é", "Quem decide", "Orçamento do cliente", "Para quando", "Pediu outros orçamentos"]) {
      expect(grupo(dialogo, p)).toBeInTheDocument();
    }
    expect(within(grupo(dialogo, "Orçamento do cliente")).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "Até 3.000 €", "3.000 a 6.000 €", "6.000 a 10.000 €", "Mais de 10.000 €", "Não sabe",
    ]);
    expect(within(dialogo).getByText("0 de 6 respondidas")).toBeInTheDocument();
    expect(within(dialogo).queryByText(/obrigatório/)).not.toBeInTheDocument();
    for (const c of ["Rua e número", "Código postal", "Localidade", "Andar / fração"]) expect(within(dialogo).getByLabelText(c)).toHaveValue("");
    expect(within(dialogo).getByLabelText("Código postal")).toHaveAttribute("placeholder", "0000-000");
  });

  it("escolher marca a opção (aria-checked), conta na aba, e tocar de novo desseleciona", () => {
    const { dialogo } = abrir();
    aba(dialogo, /^Qualificação/);
    fireEvent.click(opcao(dialogo, "Tipo de imóvel", "Moradia"));
    expect(opcao(dialogo, "Tipo de imóvel", "Moradia")).toHaveAttribute("aria-checked", "true");
    expect(opcao(dialogo, "Tipo de imóvel", "Loja")).toHaveAttribute("aria-checked", "false");
    expect(within(dialogo).getByText("1 de 6 respondidas")).toBeInTheDocument();
    expect(within(dialogo).getByRole("tab", { name: /^Qualificação.*1 resposta/ })).toBeInTheDocument();
    fireEvent.click(opcao(dialogo, "Tipo de imóvel", "Moradia"));
    expect(opcao(dialogo, "Tipo de imóvel", "Moradia")).toHaveAttribute("aria-checked", "false");
    expect(within(dialogo).getByText("0 de 6 respondidas")).toBeInTheDocument();
  });

  it("as setas movem o foco e escolhem; só uma opção por grupo está no Tab", () => {
    const { dialogo } = abrir();
    aba(dialogo, /^Qualificação/);
    const radios = within(grupo(dialogo, "O cliente é")).getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(radios[1]).toHaveFocus();
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(radios[1], { key: "ArrowLeft" });
    fireEvent.keyDown(radios[0], { key: "ArrowLeft" });
    expect(radios[2]).toHaveFocus();
    expect(radios[2]).toHaveAttribute("aria-checked", "true");
  });

  it("um código postal fora do formato avisa só a morada, na aba, e põe o foco no campo, sem criar", async () => {
    const { aoCriar, dialogo } = abrir();
    await escolherPessoa(dialogo, "Rui Figueiredo");
    aba(dialogo, /^Qualificação/);
    fireEvent.change(within(dialogo).getByLabelText("Código postal"), { target: { value: "1000" } });
    expect(within(dialogo).queryByText(/0000-000, por exemplo/)).not.toBeInTheDocument();
    criar(dialogo);
    const cp = within(dialogo).getByLabelText("Código postal");
    expect(cp).toHaveAttribute("aria-invalid", "true");
    expect(cp).toHaveAccessibleDescription("O código postal tem o formato 0000-000, por exemplo 1000-001.");
    expect(within(dialogo).getByRole("tab", { name: /^Qualificação.*com erros/ })).toBeInTheDocument();
    await waitFor(() => expect(cp).toHaveFocus());
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("Usar a morada do contacto copia a morada da aba Geral; sem morada só avisa; não há botão de localização (só a morada do contacto)", async () => {
    const { dialogo } = abrir();
    aba(dialogo, /^Qualificação/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Usar a morada do contacto" }));
    expect(info).toHaveBeenLastCalledWith("A aba Geral ainda não tem morada.");
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("");
    aba(dialogo, /^Geral/);
    await escolherPessoa(dialogo, "Marta Silveira");
    aba(dialogo, /^Qualificação/);
    fireEvent.change(within(dialogo).getByLabelText("Andar / fração"), { target: { value: "3.º Esq." } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Usar a morada do contacto" }));
    expect(within(dialogo).getByLabelText("Rua e número")).toHaveValue("Rua A");
    expect(within(dialogo).getByLabelText("Código postal")).toHaveValue("1000-001");
    expect(within(dialogo).getByLabelText("Localidade")).toHaveValue("Lisboa");
    expect(within(dialogo).getByLabelText("Andar / fração")).toHaveValue("3.º Esq.");
    expect(within(dialogo).queryByRole("button", { name: /Estou no local/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("button", { name: /copiar/i })).not.toBeInTheDocument();
  });
});

describe("aba Visita", () => {
  it("mostra as sete secções, o passo 1 de 7 com as respostas em falta e a primeira secção aberta", () => {
    const { dialogo } = abrir();
    aba(dialogo, /^Visita/);
    const lista = within(dialogo).getByRole("navigation", { name: "Secções da visita" });
    expect(within(lista).getAllByRole("button").map((b) => b.textContent?.replace(/(\d+ (de \d+ respondidas|linhas?|visitas?)).*/, "").trim())).toEqual([
      "Visitas", "Exterior do edifício", "Interior do espaço", "Área de intervenção", "Medidas da área", "Necessidades do cliente", "Escolhas do cliente",
    ]);
    expect(within(lista).getByRole("button", { name: /^Visitas/ })).toHaveAttribute("aria-current", "step");
    expect(within(dialogo).getByText(`Passo 1 de 7 · faltam ${TOTAL_PERGUNTAS} respostas`)).toBeInTheDocument();
    expect(within(dialogo).getByRole("heading", { level: 3, name: "Visitas" })).toBeInTheDocument();
    // A secção Visitas é a lista de visitas: começa vazia, com o contador «0 visitas · 0 feitas».
    expect(within(dialogo).getByText("Ainda sem visitas. Acrescenta a primeira.")).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: /^Visitas.*0 visitas · 0 feitas/ })).toBeInTheDocument();
  });

  it("Exterior do edifício: 0 de 4; Acesso Difícil abre o Impacto no preço, a secção passa a 1 de 5 e o passo é o 2", () => {
    const { dialogo } = abrir();
    aba(dialogo, /^Visita/);
    seccao(dialogo, /^Exterior do edifício/);
    expect(within(dialogo).getByRole("heading", { level: 3, name: "Exterior do edifício" })).toBeInTheDocument();
    expect(within(dialogo).getAllByText("0 de 4 respondidas").length).toBeGreaterThan(0);
    expect(within(dialogo).getByRole("heading", { level: 4, name: "Acesso e estacionamento" })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("radiogroup", { name: "Impacto no preço" })).not.toBeInTheDocument();
    fireEvent.click(opcao(dialogo, "Acesso", "Difícil"));
    expect(grupo(dialogo, "Impacto no preço")).toBeInTheDocument();
    expect(within(dialogo).getAllByText("1 de 5 respondidas").length).toBeGreaterThan(0);
    expect(within(dialogo).getByText(`Passo 2 de 7 · faltam ${TOTAL_PERGUNTAS} respostas`)).toBeInTheDocument();
    expect(within(dialogo).getByRole("tab", { name: /^Visita.*1 resposta/ })).toBeInTheDocument();
    // Mudar o acesso para Fácil tira a pergunta condicional.
    fireEvent.click(opcao(dialogo, "Acesso", "Fácil"));
    expect(within(dialogo).queryByRole("radiogroup", { name: "Impacto no preço" })).not.toBeInTheDocument();
  });

  it("a secção completa leva o visto (dito em texto) e as perguntas trazem as opções do protótipo", () => {
    const { dialogo } = abrir();
    aba(dialogo, /^Visita/);
    seccao(dialogo, /^Escolhas do cliente/);
    fireEvent.click(opcao(dialogo, "O cliente fornece materiais", "Sim"));
    fireEvent.click(opcao(dialogo, "Mobilidade reduzida", "Não"));
    expect(within(dialogo).getByRole("button", { name: /^Escolhas do cliente.*feita/ })).toBeInTheDocument();
    seccao(dialogo, /^Necessidades do cliente/);
    expect(within(grupo(dialogo, "O cliente mantém a banheira?")).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Sim, mantém", "Não, vai trocar"]);
  });

  it("as Medidas da área levam as linhas do levantamento e o contador mostra as linhas", () => {
    const { dialogo } = abrir();
    aba(dialogo, /^Visita/);
    seccao(dialogo, /^Medidas da área/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    expect(within(dialogo).getByRole("button", { name: /^Medidas da área.*1 linha/ })).toBeInTheDocument();
    expect(within(dialogo).getByRole("tab", { name: /^Visita.*1 resposta/ })).toBeInTheDocument();
    expect(within(dialogo).getByText("Total: 1 linha")).toBeInTheDocument();
  });

  it("ao criar leva a qualificação, a morada e a visita em texto, só do que foi respondido", async () => {
    const { aoCriar, dialogo } = abrir();
    await escolherPessoa(dialogo, "Rui Figueiredo");
    aba(dialogo, /^Qualificação/);
    fireEvent.click(opcao(dialogo, "Tipo de imóvel", "Apartamento"));
    fireEvent.click(opcao(dialogo, "Para quando", "1 a 3 meses"));
    fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: " Rua B 2 " } });
    fireEvent.change(within(dialogo).getByLabelText("Código postal"), { target: { value: "4000-123" } });
    aba(dialogo, /^Visita/);
    seccao(dialogo, /^Exterior do edifício/);
    fireEvent.click(opcao(dialogo, "Estacionamento", "Pago"));
    fireEvent.click(opcao(dialogo, "Zona de estacionamento", "Verde"));
    criar(dialogo);
    expect(aoCriar).toHaveBeenCalledTimes(1);
    const dados = aoCriar.mock.calls[0][0];
    expect(dados.qualificacao).toEqual([
      { pergunta: "Tipo de imóvel", resposta: "Apartamento" }, { pergunta: "Para quando", resposta: "1 a 3 meses" },
    ]);
    expect(dados.moradaObra).toEqual({ rua: " Rua B 2 ", codigoPostal: "4000-123", localidade: "", andar: "" });
    expect(dados.visita).toEqual([{
      titulo: "Exterior do edifício",
      respostas: [{ pergunta: "Estacionamento", resposta: "Pago" }, { pergunta: "Zona de estacionamento", resposta: "Verde" }],
    }]);
    expect(dados.pessoa).toBe(PESSOAS[1]);
    expect(dados.pessoa).not.toHaveProperty("moradaObra");
  });
});
