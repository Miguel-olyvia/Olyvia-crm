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

const { verConteudoMock, assinarMock, emitirMock, anexarFicheiroMock, obterUrlFicheiroMock, useHookMock } =
  vi.hoisted(() => ({
    verConteudoMock: vi.fn(),
    assinarMock: vi.fn(),
    emitirMock: vi.fn(),
    anexarFicheiroMock: vi.fn(),
    obterUrlFicheiroMock: vi.fn(),
    useHookMock: vi.fn(),
  }));

vi.mock("@/hooks/usePessoaDocumentos", () => ({
  usePessoaDocumentos: useHookMock,
}));

import { PessoaDocumentosTab } from "@/components/hr/PessoaDocumentosTab";
import { toast } from "@/lib/toast";
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
  ficheiro_caminho: null,
  ficheiro_hash_sha256: null,
  ficheiro_anexado_em: null,
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
    anexarFicheiro: anexarFicheiroMock,
    obterUrlFicheiro: obterUrlFicheiroMock,
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

  it("mostra o botao de anexar so com hr.pessoas.documentos.edit E a_aguardar_assinatura", () => {
    useHookMock.mockReturnValue(resultadoBase({ documentos: [DOCUMENTO_A_AGUARDAR] }));

    render(
      <PessoaDocumentosTab
        pessoaId="p1"
        souAPessoa={false}
        permissoes={{
          view: true,
          viewOwn: false,
          edit: true,
          emitir: false,
          anular: false,
          conteudoView: false,
          modelosView: false,
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: /hr.documentos.anexarFicheiro/ }),
    ).toBeInTheDocument();
  });

  it("nao mostra o botao de anexar a quem tem edit mas o documento ja esta assinado", () => {
    useHookMock.mockReturnValue(
      resultadoBase({ documentos: [{ ...DOCUMENTO_A_AGUARDAR, estado: "assinado" }] }),
    );

    render(
      <PessoaDocumentosTab
        pessoaId="p1"
        souAPessoa={false}
        permissoes={{
          view: true,
          viewOwn: false,
          edit: true,
          emitir: false,
          anular: false,
          conteudoView: false,
          modelosView: false,
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /hr.documentos.anexarFicheiro/ }),
    ).not.toBeInTheDocument();
  });

  it("anexar ficheiro chama anexarFicheiro com o documento e o ficheiro escolhido", async () => {
    useHookMock.mockReturnValue(resultadoBase({ documentos: [DOCUMENTO_A_AGUARDAR] }));
    anexarFicheiroMock.mockResolvedValue(null);

    render(
      <PessoaDocumentosTab
        pessoaId="p1"
        souAPessoa={false}
        permissoes={{
          view: true,
          viewOwn: false,
          edit: true,
          emitir: false,
          anular: false,
          conteudoView: false,
          modelosView: false,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /hr.documentos.anexarFicheiro/ }));

    const ficheiro = new File(["conteudo"], "aditamento.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [ficheiro] } });

    fireEvent.click(screen.getByRole("button", { name: "hr.documentos.anexar" }));

    await waitFor(() => expect(anexarFicheiroMock).toHaveBeenCalledWith("doc1", ficheiro));
  });

  it("mostra o resumo guardado e o botao de abrir ficheiro quando ha ficheiro anexado", () => {
    useHookMock.mockReturnValue(
      resultadoBase({
        documentos: [
          {
            ...DOCUMENTO_A_AGUARDAR,
            ficheiro_caminho: "org/p1/doc1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf",
            ficheiro_hash_sha256: "a".repeat(64),
          },
        ],
      }),
    );

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

    expect(screen.getByText("hr.documentos.resumoGuardado")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /hr.documentos.abrirFicheiro/ }),
    ).toBeInTheDocument();
  });

  it("abrir ficheiro abre uma janela em branco SINCRONAMENTE e so lhe atribui o URL quando obterUrlFicheiro resolve", async () => {
    // O window.open tem de acontecer ANTES do await (dentro do gesto de
    // clique) -- por isso o mock devolve uma janela FAKE (nao null) que a
    // implementacao usa para guardar o URL assinado quando ele chega, em vez
    // de passar o URL directamente a window.open.
    const janelaFake = { opener: "algo", location: { href: "" }, close: vi.fn() };
    const abrirJanela = vi.spyOn(window, "open").mockImplementation(() => janelaFake as unknown as Window);
    obterUrlFicheiroMock.mockResolvedValue({
      url: "https://exemplo/assinado",
      hash: "a".repeat(64),
      anexadoEm: "2026-01-02T00:00:00Z",
    });

    useHookMock.mockReturnValue(
      resultadoBase({
        documentos: [
          {
            ...DOCUMENTO_A_AGUARDAR,
            ficheiro_caminho: "org/p1/doc1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf",
            ficheiro_hash_sha256: "a".repeat(64),
          },
        ],
      }),
    );

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

    fireEvent.click(screen.getByRole("button", { name: /hr.documentos.abrirFicheiro/ }));

    // A janela abre logo, antes do URL chegar -- e o proprio ponto do teste.
    expect(abrirJanela).toHaveBeenCalledWith("about:blank", "_blank");
    expect(janelaFake.opener).toBeNull();

    await waitFor(() => expect(obterUrlFicheiroMock).toHaveBeenCalledWith("doc1"));
    await waitFor(() => expect(janelaFake.location.href).toBe("https://exemplo/assinado"));
    expect(janelaFake.close).not.toHaveBeenCalled();

    abrirJanela.mockRestore();
  });

  it("abrir ficheiro fecha a janela e avisa quando obterUrlFicheiro falha", async () => {
    const janelaFake = { opener: "algo", location: { href: "" }, close: vi.fn() };
    const abrirJanela = vi.spyOn(window, "open").mockImplementation(() => janelaFake as unknown as Window);
    obterUrlFicheiroMock.mockRejectedValue(new Error("falhou"));

    useHookMock.mockReturnValue(
      resultadoBase({
        documentos: [
          {
            ...DOCUMENTO_A_AGUARDAR,
            ficheiro_caminho: "org/p1/doc1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf",
            ficheiro_hash_sha256: "a".repeat(64),
          },
        ],
      }),
    );

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

    fireEvent.click(screen.getByRole("button", { name: /hr.documentos.abrirFicheiro/ }));

    await waitFor(() => expect(janelaFake.close).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("hr.documentos.erroAbrirFicheiro");

    abrirJanela.mockRestore();
  });

  it("abrir ficheiro avisa com mensagem traduzida quando o bloqueador de popups impede a janela", async () => {
    const abrirJanela = vi.spyOn(window, "open").mockImplementation(() => null);

    useHookMock.mockReturnValue(
      resultadoBase({
        documentos: [
          {
            ...DOCUMENTO_A_AGUARDAR,
            ficheiro_caminho: "org/p1/doc1/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf",
            ficheiro_hash_sha256: "a".repeat(64),
          },
        ],
      }),
    );

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

    fireEvent.click(screen.getByRole("button", { name: /hr.documentos.abrirFicheiro/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("hr.documentos.bloqueadorPopup"));
    // Sem janela nenhuma para receber o URL, obterUrlFicheiro nunca chega a
    // ser chamado -- e o comportamento que evita o URL de 60s ser pedido em
    // vao.
    expect(obterUrlFicheiroMock).not.toHaveBeenCalled();

    abrirJanela.mockRestore();
  });
});
