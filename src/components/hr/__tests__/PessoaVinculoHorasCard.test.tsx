/**
 * O motivo da alteracao/correccao de horas passa a ser obrigatorio (antes
 * era so uma etiqueta trocada com a do motivo de termo de contrato, nunca
 * validada), e o dialogo ganha "Anexar ficheiro novo" -- cria um documento
 * tipo 'outro' e anexa-lhe o ficheiro escolhido, sem obrigar a ir primeiro
 * ao separador Documentos. O anexo real so corre depois de o documento novo
 * aparecer na lista de `usePessoaDocumentos` (ver o cabecalho do
 * componente) -- por isso o terceiro teste faz um re-render a simular essa
 * lista a actualizar-se, como o proprio hook faria depois de `criarPorUpload`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

const { errorMock, successMock } = vi.hoisted(() => ({
  errorMock: vi.fn(),
  successMock: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: errorMock, success: successMock },
}));

const { alterarMock, criarPorUploadMock, anexarFicheiroMock, useDocumentosMock } = vi.hoisted(
  () => ({
    alterarMock: vi.fn(),
    criarPorUploadMock: vi.fn(),
    anexarFicheiroMock: vi.fn(),
    useDocumentosMock: vi.fn(),
  }),
);

vi.mock("@/hooks/usePessoaVinculoHoras", () => ({
  usePessoaVinculoHoras: () => ({
    versoes: [],
    aberta: null,
    loading: false,
    saving: false,
    recusado: false,
    recarregar: vi.fn(),
    alterar: alterarMock,
    corrigir: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePessoaDocumentos", () => ({
  usePessoaDocumentos: useDocumentosMock,
}));

import { PessoaVinculoHorasCard } from "@/components/hr/PessoaVinculoHorasCard";

const PROPS = {
  pessoaId: "p1",
  organizationId: "org1",
  vinculoActivoId: "v1",
  podeAlterar: true,
  podeCorrigir: false,
};

function mockDocumentos(documentos: Array<{ id: string; titulo: string; tipo: string; estado: string }> = []) {
  useDocumentosMock.mockReturnValue({
    documentos,
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
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDocumentos();
  alterarMock.mockResolvedValue(null);
});

describe("PessoaVinculoHorasCard -- motivo obrigatorio", () => {
  it("bloqueia o submit de 'Alterar' sem motivo preenchido", async () => {
    render(<PessoaVinculoHorasCard {...PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "hr.horasContratadas.alterar" }));
    fireEvent.change(screen.getByLabelText("hr.contrato.horasTrabalho"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByLabelText("hr.horasContratadas.dataEfeito"), {
      target: { value: "2026-10-01" },
    });
    // motivo deliberadamente vazio
    fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith("hr.horasContratadas.erroSemMotivo");
    });
    expect(alterarMock).not.toHaveBeenCalled();
  });

  it("com motivo preenchido, chama alterar() com o motivo", async () => {
    render(<PessoaVinculoHorasCard {...PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "hr.horasContratadas.alterar" }));
    fireEvent.change(screen.getByLabelText("hr.contrato.horasTrabalho"), {
      target: { value: "40" },
    });
    fireEvent.change(screen.getByLabelText("hr.horasContratadas.dataEfeito"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.change(screen.getByLabelText("hr.horasContratadas.motivo"), {
      target: { value: "Passou a full-time" },
    });
    fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));

    await waitFor(() => {
      expect(alterarMock).toHaveBeenCalledWith(
        expect.objectContaining({ motivo: "Passou a full-time" }),
      );
    });
    expect(errorMock).not.toHaveBeenCalledWith("hr.horasContratadas.erroSemMotivo");
  });
});

describe("PessoaVinculoHorasCard -- anexar ficheiro novo", () => {
  it("cria o documento e, quando a lista o inclui, anexa-lhe o ficheiro", async () => {
    criarPorUploadMock.mockResolvedValue({ documentoId: "doc-novo", erro: null });
    anexarFicheiroMock.mockResolvedValue(null);

    const { rerender } = render(<PessoaVinculoHorasCard {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "hr.horasContratadas.alterar" }));

    const ficheiro = new File(["conteudo"], "anexo.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [ficheiro] } });

    await waitFor(() => {
      expect(criarPorUploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: "outro", vinculoId: "v1" }),
      );
    });

    // So depois de o documento novo aparecer na lista e que o anexo real
    // corre -- e exactamente o que o efeito do componente espera.
    mockDocumentos([{ id: "doc-novo", titulo: "Anexo", tipo: "outro", estado: "a_aguardar_assinatura" }]);
    rerender(<PessoaVinculoHorasCard {...PROPS} />);

    await waitFor(() => {
      expect(anexarFicheiroMock).toHaveBeenCalledWith("doc-novo", ficheiro);
    });
  });
});
