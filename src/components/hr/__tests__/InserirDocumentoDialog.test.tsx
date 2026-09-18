/**
 * "Inserir documento" -- ponto de entrada unico com dois modos (a partir de
 * um modelo, com pre-visualizacao por dados de amostra; ou anexar ficheiro).
 * Ver o cabecalho de `InserirDocumentoDialog.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { InserirDocumentoDialog } from "@/components/hr/InserirDocumentoDialog";
import type { PessoaDocumentoModelo } from "@/types/hr";

const MODELO: PessoaDocumentoModelo = {
  id: "m1",
  organization_id: "org",
  nome: "Contrato padrao",
  tipo: "contrato",
  corpo_html: "<p>Ola {{pessoa_nome_completo}}, falta {{token_inexistente}}</p>",
  variaveis: ["pessoa_nome_completo", "token_inexistente"],
  activo: true,
};

function propsBase(overrides: Partial<Parameters<typeof InserirDocumentoDialog>[0]> = {}) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    pessoaId: "p1",
    organizationId: "org",
    vinculosOpcoes: [],
    modelos: [MODELO],
    podeEmitir: true,
    podeCriarPorUpload: true,
    emitir: vi.fn(),
    criarPorUpload: vi.fn(),
    anexarFicheiro: vi.fn(),
    saving: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Radix Select nao funciona em jsdom sem estes dois -- o mesmo padrao ja
  // usado em HorarioEditor.test.tsx e PessoaRetribuicaoCard.test.tsx.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});

function abrirSelectorDeModelo() {
  const combobox = screen.getByRole("combobox");
  fireEvent.keyDown(combobox, { key: "Enter" });
  return screen.findByRole("listbox");
}

describe("InserirDocumentoDialog", () => {
  it("mostra as duas tabs quando as duas permissoes estao activas", () => {
    render(<InserirDocumentoDialog {...propsBase()} />);
    expect(screen.getByRole("tab", { name: "hr.documentos.modoModelo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "hr.documentos.modoAnexar" })).toBeInTheDocument();
  });

  it("sem podeEmitir, mostra so o formulario de anexar, sem tabs", () => {
    render(<InserirDocumentoDialog {...propsBase({ podeEmitir: false })} />);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByLabelText("hr.documentos.coluna.titulo")).toBeInTheDocument();
  });

  it("sem podeCriarPorUpload, mostra so o formulario de modelo, sem tabs", () => {
    render(<InserirDocumentoDialog {...propsBase({ podeCriarPorUpload: false })} />);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("hr.documentos.modelo")).toBeInTheDocument();
  });

  it("a pre-visualizacao mostra o texto substituido por dados de amostra, com o token desconhecido realcado", async () => {
    render(<InserirDocumentoDialog {...propsBase()} />);

    const listbox = await abrirSelectorDeModelo();
    fireEvent.click(within(listbox).getByText("Contrato padrao"));

    fireEvent.click(screen.getByRole("button", { name: "hr.modelos.verPreview" }));

    // "pessoa_nome_completo" e um token real do catalogo -- substituido por
    // um nome de amostra, nunca a pessoa verdadeira (essa substituicao so
    // existe no servidor). "token_inexistente" nao esta no catalogo, por
    // isso continua realcado como em falta.
    await waitFor(() => {
      expect(screen.getByText(/Ola/)).toBeInTheDocument();
    });
    expect(screen.getByText("hr.modelos.previewAjuda")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "hr.modelos.ocultarPreview" }),
    ).toBeInTheDocument();
  });

  it("emitir chama emitir(modeloId) com o modelo escolhido", async () => {
    const emitir = vi.fn().mockResolvedValue(null);
    render(<InserirDocumentoDialog {...propsBase({ emitir })} />);

    const listbox = await abrirSelectorDeModelo();
    fireEvent.click(within(listbox).getByText("Contrato padrao"));

    fireEvent.click(screen.getByRole("button", { name: "hr.documentos.emitir" }));

    await waitFor(() => expect(emitir).toHaveBeenCalledWith("m1"));
  });

  it("anexar ficheiro: submeter chama criarPorUpload com o tipo, titulo e vinculo escolhidos", async () => {
    const criarPorUpload = vi.fn().mockResolvedValue({ documentoId: "docNovo", erro: null });
    render(
      <InserirDocumentoDialog
        {...propsBase({ criarPorUpload, podeEmitir: false })}
      />,
    );

    fireEvent.change(screen.getByLabelText("hr.documentos.coluna.titulo"), {
      target: { value: "Contrato assinado em papel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "hr.documentos.modoAnexar" }));

    await waitFor(() =>
      expect(criarPorUpload).toHaveBeenCalledWith({
        tipo: "contrato",
        titulo: "Contrato assinado em papel",
        vinculoId: null,
      }),
    );
  });
});
