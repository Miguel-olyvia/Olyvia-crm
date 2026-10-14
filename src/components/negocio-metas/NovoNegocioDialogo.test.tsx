// Arranque do botão e do diálogo "Novo negócio": abre com os campos, valida por campo e devolve os dados ao confirmar.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
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

describe("NovoNegocioDialogo", () => {
  it("só tem o botão primário fechado, e abre com os quatro campos e os dois botões", () => {
    render(<NovoNegocioDialogo pessoas={PESSOAS} aoCriar={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
    const dialogo = screen.getByRole("dialog", { name: "Novo negócio" });
    expect(within(dialogo).getByRole("combobox", { name: /^Pessoa/ })).toBeInTheDocument();
    expect(within(dialogo).getByRole("combobox", { name: /^Serviço/ })).toBeInTheDocument();
    expect(within(dialogo).getByRole("combobox", { name: "Comercial" })).toHaveTextContent("Ana Ribeiro");
    const contacto = within(dialogo).getByRole("group", { name: "Contacto" });
    ["Email", "Morada", "Distrito", "NIF", "Empresa", "NIF da empresa"].forEach((r) => {
      expect(within(contacto).getByLabelText(r)).toHaveValue("");
    });
    expect(within(dialogo).getByText("O negócio começa em Orçamento: o primeiro passo é fazer o levantamento.")).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(within(dialogo).getByRole("button", { name: "Criar negócio" })).toHaveAttribute("type", "submit");
  });

  it("ao escolher a pessoa pré-preenche o contacto; o campo editado resiste a uma nova escolha", async () => {
    const { dialogo } = abrir();
    const escolher = async (nome: string) => {
      fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Pessoa/ }), { key: "Enter" });
      fireEvent.click(await screen.findByRole("option", { name: nome }));
    };
    await escolher("Marta Silveira");
    expect(within(dialogo).getByLabelText("Email")).toHaveValue("marta@exemplo.pt");
    expect(within(dialogo).getByLabelText("NIF da empresa")).toHaveValue("987654321");
    fireEvent.change(within(dialogo).getByLabelText("Distrito"), { target: { value: "Porto" } });
    await escolher("Rui Figueiredo");
    expect(within(dialogo).getByLabelText("Email")).toHaveValue("");
    expect(within(dialogo).getByLabelText("Distrito")).toHaveValue("Porto");
  });

  it("email e NIF inválidos mostram erro ligado ao campo e não criam", async () => {
    const { aoCriar, dialogo } = abrir();
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Pessoa/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Marta Silveira" }));
    fireEvent.change(within(dialogo).getByRole("combobox", { name: /^Serviço/ }), { target: { value: "Cozinha" } });
    fireEvent.change(within(dialogo).getByLabelText("Email"), { target: { value: "marta@" } });
    fireEvent.change(within(dialogo).getByLabelText("NIF"), { target: { value: "123" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Criar negócio" }));
    expect(within(dialogo).getByLabelText("Email")).toHaveAccessibleDescription(/email válido/);
    expect(within(dialogo).getByLabelText("NIF")).toHaveAccessibleDescription("O NIF tem 9 dígitos.");
    expect(within(dialogo).getByLabelText("Email")).toHaveFocus();
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("o foco inicial vai para o primeiro campo e Cancelar devolve-o ao botão", async () => {
    const { dialogo } = abrir();
    await waitFor(() => expect(within(dialogo).getByRole("combobox", { name: /^Pessoa/ })).toHaveFocus());
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo negócio" })).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sem nada preenchido mostra um erro por campo, ligado ao campo, e não cria", () => {
    const { aoCriar, dialogo } = abrir();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Criar negócio" }));
    const pessoa = within(dialogo).getByRole("combobox", { name: /^Pessoa/ });
    const servico = within(dialogo).getByRole("combobox", { name: /^Serviço/ });
    expect(pessoa).toHaveAttribute("aria-invalid", "true");
    expect(servico).toHaveAttribute("aria-invalid", "true");
    expect(pessoa).toHaveAccessibleDescription("Escolhe a pessoa do negócio.");
    expect(servico).toHaveAccessibleDescription(/Indica o serviço do negócio\./);
    expect(pessoa).toHaveFocus();
    expect(aoCriar).not.toHaveBeenCalled();
  });

  it("escrever no serviço limpa o erro desse campo, e o da pessoa continua", () => {
    const { dialogo } = abrir();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Criar negócio" }));
    fireEvent.change(within(dialogo).getByRole("combobox", { name: /^Serviço/ }), { target: { value: "Cozinha" } });
    expect(within(dialogo).queryByText("Indica o serviço do negócio.")).not.toBeInTheDocument();
    expect(within(dialogo).getByText("Escolhe a pessoa do negócio.")).toBeInTheDocument();
  });

  it("com pessoa e serviço devolve os dados (pessoa da lista, comercial por omissão) e fecha", async () => {
    const { aoCriar, dialogo } = abrir();
    fireEvent.keyDown(within(dialogo).getByRole("combobox", { name: /^Pessoa/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Marta Silveira" }));
    fireEvent.change(within(dialogo).getByRole("combobox", { name: /^Serviço/ }), { target: { value: "Cozinha" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Criar negócio" }));
    expect(aoCriar).toHaveBeenCalledWith({
      pessoa: PESSOAS[0], servico: "Cozinha", comercial: "Ana Ribeiro",
      contacto: {
        email: "marta@exemplo.pt", morada: "Rua A, 1000-001 Lisboa", distrito: "Lisboa", nif: "123456789",
        empresa: "Marta Lda", nifEmpresa: "987654321",
      },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
