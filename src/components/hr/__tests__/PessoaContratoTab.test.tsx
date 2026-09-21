/**
 * O separador Contratos: so o novo atalho "Anexar contrato ja assinado"
 * (20261215) -- gated pela MESMA permissao que o abre em Documentos, e a
 * abrir o MESMO dialogo partilhado (`AnexarContratoAssinadoDialog`). O resto
 * do separador (validacao de numeros, horas derivadas, historico) ja e
 * grande de mais para replicar aqui -- fica coberto pelos testes de
 * `lib/hr/contrato` e pela verificacao ao vivo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const { criarPorUploadMock, anexarFicheiroMock, useDocumentosMock, useHorasMock } = vi.hoisted(
  () => ({
    criarPorUploadMock: vi.fn(),
    anexarFicheiroMock: vi.fn(),
    useDocumentosMock: vi.fn(),
    useHorasMock: vi.fn(),
  }),
);

// Um so mock cobre as duas chamadas a usePessoaDocumentos nesta arvore:
// a do proprio PessoaContratoTab (para o atalho novo) e a de
// PessoaVinculoHorasCard (para o selector de documento de apoio).
vi.mock("@/hooks/usePessoaDocumentos", () => ({
  usePessoaDocumentos: useDocumentosMock,
}));

vi.mock("@/hooks/usePessoaVinculoHoras", () => ({
  usePessoaVinculoHoras: useHorasMock,
}));

import { PessoaContratoTab } from "@/components/hr/PessoaContratoTab";

const PROPS_BASE = {
  pessoaId: "p1",
  organizationId: "org",
  vinculos: [],
  retribuicao: null,
  podeEditar: false,
  podeVerRetribuicao: false,
  podeEditarRetribuicao: false,
  podeCorrigirRetribuicao: false,
  cargo: null,
  podeCorrigirHoras: false,
  vinculosOpcoesDocumento: [],
  saving: false,
  onGuardarVinculo: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  useDocumentosMock.mockReturnValue({
    documentos: [],
    modelos: [],
    loading: false,
    saving: false,
    recusado: false,
    recarregar: vi.fn(),
    emitir: vi.fn(),
    criarPorUpload: criarPorUploadMock,
    registarAssinaturaExterna: vi.fn(),
    verConteudo: vi.fn(),
    assinar: vi.fn(),
    anexarFicheiro: anexarFicheiroMock,
    obterUrlFicheiro: vi.fn(),
  });
  useHorasMock.mockReturnValue({
    versoes: [],
    aberta: null,
    loading: false,
    saving: false,
    recusado: false,
    recarregar: vi.fn(),
    alterar: vi.fn(),
    corrigir: vi.fn(),
  });
});

describe("PessoaContratoTab -- atalho 'Anexar contrato ja assinado'", () => {
  it("mostra o botao so com podeAnexarContratoAssinado", () => {
    render(<PessoaContratoTab {...PROPS_BASE} podeAnexarContratoAssinado={false} />);

    expect(
      screen.queryByRole("button", { name: "hr.documentos.anexarContratoAssinado" }),
    ).not.toBeInTheDocument();
  });

  it("com a permissao, o botao abre o dialogo partilhado (o mesmo de Documentos)", () => {
    render(<PessoaContratoTab {...PROPS_BASE} podeAnexarContratoAssinado />);

    const botao = screen.getByRole("button", { name: "hr.documentos.anexarContratoAssinado" });
    fireEvent.click(botao);

    expect(screen.getByText("hr.documentos.anexarContratoAssinadoTitulo")).toBeInTheDocument();
  });

  it("cria o documento a partir do separador Contratos, sem sair dele", async () => {
    criarPorUploadMock.mockResolvedValue({ documentoId: "docNovo", erro: null });

    render(<PessoaContratoTab {...PROPS_BASE} podeAnexarContratoAssinado />);

    fireEvent.click(
      screen.getByRole("button", { name: "hr.documentos.anexarContratoAssinado" }),
    );

    const dialogoCriar = screen.getByRole("dialog");
    fireEvent.change(within(dialogoCriar).getByLabelText("hr.documentos.coluna.titulo"), {
      target: { value: "Contrato assinado em papel" },
    });
    fireEvent.click(
      within(dialogoCriar).getByRole("button", {
        name: "hr.documentos.anexarContratoAssinado",
      }),
    );

    await waitFor(() =>
      expect(criarPorUploadMock).toHaveBeenCalledWith({
        tipo: "contrato",
        titulo: "Contrato assinado em papel",
        vinculoId: null,
      }),
    );
    // O passo 2 (anexar o ficheiro) abre logo a seguir, sem navegar para
    // Documentos -- e o proprio ponto do atalho.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "hr.documentos.anexar" })).toBeInTheDocument(),
    );

    // O ecra continua a ser o separador Contratos -- nao ha listagem de
    // documentos aqui, so o atalho.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
