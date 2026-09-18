/**
 * `ConfiguracaoClausulasDocumentos`: gating por permissao (view/edit
 * partilhadas com os modelos), a lista renderiza, e o formulario abre para
 * criar/editar. `useClausulasDocumentosRH` e mockado -- a logica de escrita
 * ja tem o proprio teste em `useClausulasDocumentosRH.test.tsx`. Mesmo padrao
 * de `ConfiguracaoModelosDocumentos.test.tsx`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

const hasPermission = vi.fn((_perm: string) => false);
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission, loading: false }),
}));

const CLAUSULA = {
  id: "c1",
  organization_id: "org-nike",
  nome: "Confidencialidade",
  categoria: "confidencialidade",
  corpo_html: "<p>Ola</p>",
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const criar = vi.fn(async () => {});
const editar = vi.fn(async () => {});
const definirActivo = vi.fn(async () => {});
let clausulas: typeof CLAUSULA[] = [];
vi.mock("@/hooks/useClausulasDocumentosRH", () => ({
  useClausulasDocumentosRH: () => ({
    clausulas,
    isLoading: false,
    isSaving: false,
    criar,
    editar,
    definirActivo,
  }),
}));

async function renderPagina() {
  const { default: ConfiguracaoClausulasDocumentos } = await import("../ConfiguracaoClausulasDocumentos");
  render(<ConfiguracaoClausulasDocumentos />);
}

describe("ConfiguracaoClausulasDocumentos", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockReturnValue(false);
    criar.mockClear();
    editar.mockClear();
    definirActivo.mockClear();
    clausulas = [CLAUSULA];
  });

  it("sem hr.pessoas.documentos.modelos.view mostra o cartao de sem acesso", async () => {
    await renderPagina();

    expect(screen.getByText("Não tem permissão para ver esta informação")).toBeTruthy();
    expect(screen.queryByText("Confidencialidade")).toBeNull();
  });

  it("com .view mas sem .edit mostra a lista sem botao de nova clausula nem acoes", async () => {
    hasPermission.mockImplementation((perm: string) => perm === "hr.pessoas.documentos.modelos.view");

    await renderPagina();

    expect(screen.getByText("Confidencialidade")).toBeTruthy();
    expect(screen.queryByText("Nova cláusula")).toBeNull();
  });

  it("com .edit mostra o botao de nova clausula, e abre o formulario", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    const botaoNovo = screen.getByText("Nova cláusula");
    fireEvent.click(botaoNovo);

    expect(screen.getByText("Texto da cláusula")).toBeTruthy();
  });

  it("por omissao esconde clausulas inactivas, e o interruptor mostra-as", async () => {
    hasPermission.mockReturnValue(true);
    clausulas = [CLAUSULA, { ...CLAUSULA, id: "c2", nome: "RGPD antigo", activo: false }];

    await renderPagina();

    expect(screen.getByText("Confidencialidade")).toBeTruthy();
    expect(screen.queryByText("RGPD antigo")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Mostrar inactivas" }));

    expect(screen.getByText("RGPD antigo")).toBeTruthy();
  });

  it("submeter cria com categoria null quando o campo fica vazio", async () => {
    hasPermission.mockReturnValue(true);
    clausulas = [];

    await renderPagina();
    fireEvent.click(screen.getByText("Nova cláusula"));

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nova clausula" } });

    // O RichTextEditor e um contentEditable, nao um <textarea> -- simular
    // digitar via evento de input diretamente no editor.
    const editor = document.querySelector('[contenteditable="true"]') as HTMLElement;
    fireEvent.input(editor, { target: { innerHTML: "<p>Texto</p>" } });

    const botoes = screen.getAllByRole("button", { name: "Nova cláusula" });
    fireEvent.click(botoes[botoes.length - 1]);

    expect(criar).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "Nova clausula", categoria: null }),
    );
  });
});
