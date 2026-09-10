/**
 * O separador Documentos: quem nao tem permissao nenhuma nao ve a tabela;
 * quem e a propria pessoa ve e assina os SEUS documentos mesmo sem
 * `hr.pessoas.documentos.view`; e o conteudo so e pedido (e sanitizado)
 * quando o dialogo abre.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const { verConteudoMock, assinarMock, emitirMock, useHookMock } = vi.hoisted(() => ({
  verConteudoMock: vi.fn(),
  assinarMock: vi.fn(),
  emitirMock: vi.fn(),
  useHookMock: vi.fn(),
}));

vi.mock("@/hooks/usePessoaDocumentos", () => ({
  usePessoaDocumentos: useHookMock,
}));

import { PessoaDocumentosTab } from "@/components/hr/PessoaDocumentosTab";
import type { UsePessoaDocumentosResult } from "@/hooks/usePessoaDocumentos";
import type { PessoaDocumento } from "@/types/hr";

const DOCUMENTO_A_AGUARDAR: PessoaDocumento = {
  id: "doc1",
  pessoa_id: "p1",
  organization_id: "org",
  vinculo_id: null,
  modelo_id: "m1",
  tipo: "contrato",
  titulo: "Contrato de trabalho",
  estado: "a_aguardar_assinatura",
  emitido_em: "2026-01-01T00:00:00Z",
  emitido_por: "rh1",
  assinado_em: null,
  anulado_em: null,
  anulado_motivo: null,
};

function resultadoBase(
  overrides: Partial<UsePessoaDocumentosResult> = {},
): UsePessoaDocumentosResult {
  return {
    documentos: [],
    modelos: [],
    loading: false,
    saving: false,
    recusado: false,
    recarregar: vi.fn(),
    emitir: emitirMock,
    verConteudo: verConteudoMock,
    assinar: assinarMock,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PessoaDocumentosTab", () => {
  it("sem permissao nenhuma mostra o cartao de sem acesso, e nao carrega a tabela", () => {
    useHookMock.mockReturnValue(resultadoBase());
    render(
      <PessoaDocumentosTab
        pessoaId="p1"
        souAPessoa={false}
        permissoes={{
          view: false,
          viewOwn: false,
          edit: false,
          emitir: false,
          anular: false,
          conteudoView: false,
          modelosView: false,
        }}
      />,
    );
    expect(screen.getByText("hr.semAcesso")).toBeInTheDocument();
    expect(screen.queryByText("hr.documentos.titulo")).not.toBeInTheDocument();
  });

  it("a propria pessoa ve e assina o seu documento mesmo sem hr.pessoas.documentos.view", async () => {
    useHookMock.mockReturnValue(resultadoBase({ documentos: [DOCUMENTO_A_AGUARDAR] }));
    assinarMock.mockResolvedValue(null);

    render(
      <PessoaDocumentosTab
        pessoaId="p1"
        souAPessoa
        permissoes={{
          view: false,
          viewOwn: true,
          edit: false,
          emitir: false,
          anular: false,
          conteudoView: false,
          modelosView: false,
        }}
      />,
    );

    expect(screen.getByText("Contrato de trabalho")).toBeInTheDocument();
    const botaoAssinar = screen.getByRole("button", { name: /hr.documentos.assinar/ });
    fireEvent.click(botaoAssinar);

    // O dialogo de confirmacao abre -- ainda nao chamou a RPC.
    expect(assinarMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "hr.documentos.confirmarAssinatura" }));

    await waitFor(() => expect(assinarMock).toHaveBeenCalledWith("doc1"));
  });

  it("nao mostra o botao de assinar a quem nao e a propria pessoa", () => {
    useHookMock.mockReturnValue(resultadoBase({ documentos: [DOCUMENTO_A_AGUARDAR] }));

    render(
      <PessoaDocumentosTab
        pessoaId="p1"
        souAPessoa={false}
        permissoes={{
          view: true,
          viewOwn: false,
          edit: false,
          emitir: false,
          anular: false,
          conteudoView: true,
          modelosView: false,
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /hr.documentos.assinar/ }),
    ).not.toBeInTheDocument();
    // Mas ve o conteudo, por ter a permissao de RH.
    expect(screen.getByRole("button", { name: "hr.documentos.verConteudo" })).toBeInTheDocument();
  });

  it("pede e sanitiza o conteudo so quando o dialogo abre, e limpa-o ao fechar", async () => {
    useHookMock.mockReturnValue(resultadoBase({ documentos: [DOCUMENTO_A_AGUARDAR] }));
    verConteudoMock.mockResolvedValue('<p>Ola</p><script>alert(1)</script>');

    render(
      <PessoaDocumentosTab
        pessoaId="p1"
        souAPessoa={false}
        permissoes={{
          view: true,
          viewOwn: false,
          edit: false,
          emitir: false,
          anular: false,
          conteudoView: true,
          modelosView: false,
        }}
      />,
    );

    expect(verConteudoMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "hr.documentos.verConteudo" }));

    await waitFor(() => expect(screen.getByText("Ola")).toBeInTheDocument());
    expect(verConteudoMock).toHaveBeenCalledWith("doc1");
    // O <script> foi sanitizado -- nunca chega ao DOM.
    expect(document.querySelector("script")).not.toBeInTheDocument();
  });
});
