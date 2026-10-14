// Arranque do botão e do painel lateral "Novo negócio": abre com as duas abas, valida por campo (e aponta a aba com
// erros), deixa fazer já o levantamento e devolve os dados ao confirmar.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import { HOJE_EXEMPLO } from "./negocioMetasExemplo";
import type { PessoaOpcao } from "./novoNegocio";

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

// O jsdom não tem estas funções, que o Select do Radix usa ao abrir a lista.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const PESSOAS: PessoaOpcao[] = [
  {
    id: "p-marta", nome: "Marta Silveira", contacto: { telefone: "912 345 601", email: null }, email: "marta@exemplo.pt",
    morada: "Rua A, 1000-001 Lisboa", distrito: "Lisboa", nif: "123456789", empresa: "Marta Lda", nifEmpresa: "987654321",
  },
  { id: "p-rui", nome: "Rui Figueiredo" },
];

const abrir = () => {
  const aoCriar = vi.fn();
  render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={aoCriar} />);
  fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
  return { aoCriar, dialogo: screen.getByRole("dialog", { name: "Novo negócio" }) };
};

type Dialogo = HTMLElement;
const escolher = async (dialogo: Dialogo, campo: RegExp | string, opcao: string) => {
  fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: campo }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcao }));
};
const irParaLevantamento = (dialogo: Dialogo) => fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Levantamento/ }));
const irParaGeral = (dialogo: Dialogo) => fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Geral/ }));
const criar = (dialogo: Dialogo) => fireEvent.click(within(dialogo).getByRole("button", { name: "Criar negócio" }));
const preencherGeral = async (dialogo: Dialogo) => {
  await escolher(dialogo, /^Pessoa/, "Marta Silveira");
};

describe("NovoNegocioDialogo: painel e aba Geral", () => {
  it("fechado só tem o botão; abre num painel com cabeçalho, selo, duas abas e rodapé com Cancelar e Criar", () => {
    render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
    const dialogo = screen.getByRole("dialog", { name: "Novo negócio" });
    expect(within(dialogo).getByRole("heading", { name: "Novo negócio" })).toBeInTheDocument();
    expect(within(dialogo).getByText("Negócio e metas")).toBeInTheDocument();
    expect(within(dialogo).getByText("Novo · por gravar")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    const abas = within(dialogo).getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual(["Geral", "Levantamento0, 0 linhas"]);
    expect(within(dialogo).getByRole("tab", { name: /^Geral/ })).toHaveAttribute("aria-selected", "true");
    expect(within(dialogo).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Criar negócio" })).toHaveAttribute("type", "submit");
  });

  it("a aba Geral tem pessoa, comercial, contacto e o primeiro passo, e não tem serviço", () => {
    const { dialogo } = abrir();
    expect(within(dialogo).getByRole("combobox", { name: /^Pessoa/ })).toBeInTheDocument();
    expect(within(dialogo).queryByRole("combobox", { name: /Serviço/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole("textbox", { name: /Serviço|Qual\?/ })).not.toBeInTheDocument();
    expect(within(dialogo).queryByText(/Serviço/)).not.toBeInTheDocument();
    expect(within(dialogo).getByRole("combobox", { name: "Comercial" })).toHaveTextContent("Ana Ribeiro");
    const contacto = within(dialogo).getByRole("group", { name: "Contacto" });
    ["Email", "Morada", "Distrito", "NIF", "Empresa", "NIF da empresa"].forEach((r) => {
      expect(within(contacto).getByLabelText(r)).toHaveValue("");
    });
    expect(within(dialogo).getByText("O negócio começa em Orçamento: o primeiro passo é fazer o levantamento.")).toBeInTheDocument();
  });

  it("ao escolher a pessoa pré-preenche o contacto; o campo editado resiste a uma nova escolha", async () => {
    const { dialogo } = abrir();
    await escolher(dialogo, /^Pessoa/, "Marta Silveira");
    expect(within(dialogo).getByLabelText("Email")).toHaveValue("marta@exemplo.pt");
    expect(within(dialogo).getByLabelText("NIF da empresa")).toHaveValue("987654321");
    fireEvent.change(within(dialogo).getByLabelText("Distrito"), { target: { value: "Porto" } });
    await escolher(dialogo, /^Pessoa/, "Rui Figueiredo");
    expect(within(dialogo).getByLabelText("Email")).toHaveValue("");
    expect(within(dialogo).getByLabelText("Distrito")).toHaveValue("Porto");
  });

  it("email e NIF inválidos mostram erro ligado ao campo e não criam", async () => {
    const { aoCriar, dialogo } = abrir();
    await preencherGeral(dialogo);
    fireEvent.change(within(dialogo).getByLabelText("Email"), { target: { value: "marta@" } });
    fireEvent.change(within(dialogo).getByLabelText("NIF"), { target: { value: "123" } });
    criar(dialogo);
    expect(within(dialogo).getByLabelText("Email")).toHaveAccessibleDescription(/email válido/);
    expect(within(dialogo).getByLabelText("NIF")).toHaveAccessibleDescription("O NIF tem 9 dígitos.");
    await waitFor(() => expect(within(dialogo).getByLabelText("Email")).toHaveFocus());
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("o foco inicial vai para o primeiro campo e Cancelar devolve-o ao botão", async () => {
    const { dialogo } = abrir();
    await waitFor(() => expect(within(dialogo).getByRole("combobox", { name: /^Pessoa/ })).toHaveFocus());
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo negócio" })).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Esc fecha o painel e devolve o foco ao botão, mesmo com alterações", async () => {
    const { dialogo } = abrir();
    fireEvent.change(within(dialogo).getByLabelText("Distrito"), { target: { value: "Porto" } });
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo negócio" })).toHaveFocus());
  });

  it("sem nada preenchido mostra o erro da pessoa, ligado ao campo, avisa na aba Geral e não cria", async () => {
    const { aoCriar, dialogo } = abrir();
    criar(dialogo);
    const pessoa = within(dialogo).getByRole("combobox", { name: /^Pessoa/ });
    expect(pessoa).toHaveAttribute("aria-invalid", "true");
    expect(pessoa).toHaveAccessibleDescription("Escolhe a pessoa do negócio.");
    expect(within(dialogo).queryByText(/serviço/i)).not.toBeInTheDocument();
    await waitFor(() => expect(pessoa).toHaveFocus());
    expect(within(dialogo).getByRole("tab", { name: /^Geral.*com erros/ })).toBeInTheDocument();
    expect(within(dialogo).getByRole("tab", { name: /^Levantamento(?!.*com erros)/ })).toBeInTheDocument();
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("só com a pessoa, sem levantamento, devolve os dados (sem serviço) (pessoa da lista, comercial por omissão) e fecha", async () => {
    const { aoCriar, dialogo } = abrir();
    await preencherGeral(dialogo);
    criar(dialogo);
    expect(aoCriar).toHaveBeenCalledWith({
      pessoa: PESSOAS[0], comercial: "Ana Ribeiro",
      contacto: {
        email: "marta@exemplo.pt", morada: "Rua A, 1000-001 Lisboa", distrito: "Lisboa", nif: "123456789",
        empresa: "Marta Lda", nifEmpresa: "987654321",
      },
      levantamento: {
        data: HOJE_EXEMPLO, feitoPor: "Ana Ribeiro", estado: "porFazer", linhas: [], observacoes: "",
      },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("NovoNegocioDialogo: aba Levantamento", () => {
  it("mostra o aviso de ajuda, a data de hoje de exemplo, Por fazer, o total e nenhuma linha", () => {
    const { dialogo } = abrir();
    irParaLevantamento(dialogo);
    expect(within(dialogo).getByText("O levantamento alimenta o primeiro orçamento.")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Data da visita")).toHaveValue(HOJE_EXEMPLO);
    expect(within(dialogo).getByRole("combobox", { name: "Feito por" })).toHaveTextContent("Ana Ribeiro");
    expect(within(dialogo).getByRole("combobox", { name: "Estado" })).toHaveTextContent("Por fazer");
    expect(within(dialogo).getByText("Total: 0 linhas")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("Observações gerais")).toHaveValue("");
    expect(within(dialogo).getByRole("button", { name: "Adicionar linha" })).toBeInTheDocument();
  });

  it("Adicionar linha acrescenta uma linha e o contador da aba; Remover tira-a e devolve o foco a Adicionar", async () => {
    const { dialogo } = abrir();
    irParaLevantamento(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    expect(within(dialogo).getByText("Total: 2 linhas")).toBeInTheDocument();
    expect(within(dialogo).getByRole("tab", { name: /^Levantamento.*2 linhas/ })).toHaveTextContent("2");
    expect(within(dialogo).getAllByRole("group", { name: /^Linha \d/ })).toHaveLength(2);
    const remover = within(dialogo).getByRole("button", { name: "Remover a linha 2" });
    expect(remover).toHaveTextContent("Remover");
    fireEvent.click(remover);
    expect(within(dialogo).getByText("Total: 1 linha")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Adicionar linha" })).toHaveFocus();
  });

  it("os trabalhos sugeridos dependem só da divisão da linha", async () => {
    const { dialogo } = abrir();
    irParaLevantamento(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    expect(within(dialogo).getByRole("combobox", { name: /^Divisão ou zona/ })).toHaveTextContent("Escolhe a divisão");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ }), { key: "Enter" });
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Outro (escrever)"]);
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    await escolher(dialogo, /^Divisão ou zona/, "Casa de banho");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ }), { key: "Enter" });
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "Substituir banheira por base de duche", "Trocar sanita", "Mudar azulejos", "Trocar canalização", "Outro (escrever)",
    ]);
    fireEvent.click(screen.getByRole("option", { name: "Trocar sanita" }));
    // Mudar a divisão limpa o trabalho que já não faz parte das sugestões.
    await escolher(dialogo, /^Divisão ou zona/, "Exterior");
    expect(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ })).toHaveTextContent("Escolhe o trabalho");
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ }), { key: "Enter" });
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Trocar caixilharia", "Estores", "Paredes", "Teto", "Outro (escrever)"]);
  });

  it("Feito sem linhas: leva para a aba Levantamento, avisa a aba, mostra o erro e põe o foco em Adicionar linha", async () => {
    const { aoCriar, dialogo } = abrir();
    await preencherGeral(dialogo);
    irParaLevantamento(dialogo);
    await escolher(dialogo, "Estado", "Feito");
    irParaGeral(dialogo);
    criar(dialogo);
    await waitFor(() => expect(within(dialogo).getByRole("tab", { name: /^Levantamento/ })).toHaveAttribute("aria-selected", "true"));
    expect(within(dialogo).getByText("Com o estado Feito, acrescenta pelo menos uma linha.")).toBeInTheDocument();
    expect(within(dialogo).getByRole("tab", { name: /^Levantamento.*com erros/ })).toBeInTheDocument();
    await waitFor(() => expect(within(dialogo).getByRole("button", { name: "Adicionar linha" })).toHaveFocus());
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("uma linha incompleta mostra erros por campo; medida 0 é recusada", async () => {
    const { aoCriar, dialogo } = abrir();
    await preencherGeral(dialogo);
    irParaLevantamento(dialogo);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    fireEvent.change(within(dialogo).getByLabelText(/^Medida/), { target: { value: "0" } });
    criar(dialogo);
    expect(within(dialogo).getByRole("combobox", { name: /^Divisão ou zona/ })).toHaveAccessibleDescription("Escolhe a divisão.");
    expect(within(dialogo).getByRole("combobox", { name: /^Trabalho a fazer/ })).toHaveAccessibleDescription("Escolhe o trabalho.");
    expect(within(dialogo).getByLabelText(/^Medida/)).toHaveAccessibleDescription("A medida tem de ser um número maior que 0.");
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("cria com o levantamento: linhas em texto, medida em número e observações", async () => {
    const { aoCriar, dialogo } = abrir();
    await preencherGeral(dialogo);
    irParaLevantamento(dialogo);
    await escolher(dialogo, "Estado", "Feito");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar linha" }));
    await escolher(dialogo, /^Divisão ou zona/, "Cozinha");
    await escolher(dialogo, /^Trabalho a fazer/, "Bancada nova");
    fireEvent.change(within(dialogo).getByLabelText(/^Medida/), { target: { value: "3.5" } });
    await escolher(dialogo, /^Unidade/, "m");
    fireEvent.change(within(dialogo).getByLabelText("Observações"), { target: { value: "Ver canos" } });
    fireEvent.change(within(dialogo).getByLabelText("Observações gerais"), { target: { value: "Cliente em casa de manhã" } });
    criar(dialogo);
    expect(aoCriar).toHaveBeenCalledTimes(1);
    expect(aoCriar.mock.calls[0][0].levantamento).toEqual({
      data: HOJE_EXEMPLO, feitoPor: "Ana Ribeiro", estado: "feito", observacoes: "Cliente em casa de manhã",
      linhas: [{ divisao: "Cozinha", trabalho: "Bancada nova", medida: 3.5, unidade: "m", observacoes: "Ver canos" }],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
