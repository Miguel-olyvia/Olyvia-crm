/**
 * `SelectorClausulasRH`: inserir (copia), e gerir clausulas dentro do editor
 * do modelo -- criar a partir da seleccao, editar e desactivar -- sempre
 * atras de hr.pessoas.documentos.modelos.edit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
  categoria: "rgpd",
  corpo_html: "<p>Ola</p>",
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
let clausulas: typeof CLAUSULA[] = [];
const definirActivo = vi.fn(async (_id: string, _activo: boolean) => {});
vi.mock("@/hooks/useClausulasDocumentosRH", () => ({
  useClausulasDocumentosRH: () => ({
    clausulas,
    isLoading: false,
    isSaving: false,
    criar: vi.fn(async () => {}),
    editar: vi.fn(async () => {}),
    definirActivo,
  }),
}));

vi.mock("@/components/hr/ClausulaFormDialog", () => ({
  ClausulaFormDialog: (p: { aberto: boolean; clausula: { nome: string } | null; corpoInicial?: string }) =>
    p.aberto ? (
      <div data-testid="dialogo">
        {p.clausula ? `editar:${p.clausula.nome}` : `nova:${p.corpoInicial ?? ""}`}
      </div>
    ) : null,
}));

async function renderSelector() {
  const { SelectorClausulasRH } = await import("../SelectorClausulasRH");
  const execCommand = vi.fn();
  render(<SelectorClausulasRH editorRef={{ current: { execCommand, insertVariable: vi.fn() } }} />);
  fireEvent.click(screen.getByRole("button", { name: /Cláusulas/ }));
  return { execCommand };
}

describe("SelectorClausulasRH", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockReturnValue(false);
    definirActivo.mockClear();
    clausulas = [CLAUSULA];
  });

  it("insere a clausula por copia", async () => {
    const { execCommand } = await renderSelector();
    fireEvent.click(screen.getByText("Confidencialidade"));
    expect(execCommand).toHaveBeenCalledWith("insertHTML", expect.stringContaining("Ola"));
  });

  it("sem .edit nao mostra criar, editar nem desactivar", async () => {
    await renderSelector();
    expect(screen.queryByText("Nova cláusula da selecção")).toBeNull();
    expect(screen.queryByTitle("Editar cláusula")).toBeNull();
    expect(screen.queryByTitle("Desactivar")).toBeNull();
  });

  it("sem .edit e sem clausulas activas nao mostra o botao", async () => {
    clausulas = [];
    const { SelectorClausulasRH } = await import("../SelectorClausulasRH");
    render(<SelectorClausulasRH editorRef={{ current: null }} />);
    expect(screen.queryByRole("button", { name: /Cláusulas/ })).toBeNull();
  });

  it("com .edit e sem clausulas ainda permite criar", async () => {
    hasPermission.mockReturnValue(true);
    clausulas = [];
    await renderSelector();
    expect(screen.getByText("Nova cláusula da selecção")).toBeTruthy();
  });

  it("com .edit, criar abre o dialogo (sem seleccao, corpo vazio)", async () => {
    hasPermission.mockReturnValue(true);
    await renderSelector();
    fireEvent.click(screen.getByText("Nova cláusula da selecção"));
    expect(screen.getByTestId("dialogo").textContent).toBe("nova:");
  });

  it("com .edit, editar abre o dialogo com a clausula", async () => {
    hasPermission.mockReturnValue(true);
    await renderSelector();
    fireEvent.click(screen.getByTitle("Editar cláusula"));
    expect(screen.getByTestId("dialogo").textContent).toBe("editar:Confidencialidade");
  });

  it("com .edit, desactivar chama definirActivo(id, false)", async () => {
    hasPermission.mockReturnValue(true);
    await renderSelector();
    fireEvent.click(screen.getByTitle("Desactivar"));
    expect(definirActivo).toHaveBeenCalledWith("c1", false);
  });
});
