/**
 * `ConfiguracaoModelosDocumentos`: gating por permissao (view/edit
 * separados), a lista renderiza, e o formulario abre para criar/editar.
 * `useModelosDocumentosRH` e mockado -- a logica de escrita ja tem o proprio
 * teste em `useModelosDocumentosRH.test.tsx`.
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

const MODELO = {
  id: "m1",
  organization_id: "org-nike",
  nome: "Contrato-tipo",
  tipo: "contrato" as const,
  corpo_html: "<p>Ola</p>",
  variaveis: ["nome_completo"],
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const criar = vi.fn(async () => {});
const editar = vi.fn(async () => {});
const definirActivo = vi.fn(async () => {});
let modelos: typeof MODELO[] = [];
vi.mock("@/hooks/useModelosDocumentosRH", () => ({
  useModelosDocumentosRH: () => ({
    modelos,
    isLoading: false,
    isSaving: false,
    criar,
    editar,
    definirActivo,
  }),
}));

async function renderPagina() {
  const { default: ConfiguracaoModelosDocumentos } = await import("../ConfiguracaoModelosDocumentos");
  render(<ConfiguracaoModelosDocumentos />);
}

describe("ConfiguracaoModelosDocumentos", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockReturnValue(false);
    criar.mockClear();
    editar.mockClear();
    definirActivo.mockClear();
    modelos = [MODELO];
  });

  it("sem hr.pessoas.documentos.modelos.view mostra o cartao de sem acesso", async () => {
    await renderPagina();

    expect(screen.getByText("Não tem permissão para ver esta informação")).toBeTruthy();
    expect(screen.queryByText("Contrato-tipo")).toBeNull();
  });

  it("com .view mas sem .edit mostra a lista sem botao de novo modelo nem acoes", async () => {
    hasPermission.mockImplementation((perm: string) => perm === "hr.pessoas.documentos.modelos.view");

    await renderPagina();

    expect(screen.getByText("Contrato-tipo")).toBeTruthy();
    expect(screen.queryByText("Novo modelo")).toBeNull();
  });

  it("com .edit mostra o botao de novo modelo, e abre o formulario", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    const botaoNovo = screen.getByText("Novo modelo");
    fireEvent.click(botaoNovo);

    expect(screen.getByText("Corpo do documento")).toBeTruthy();
  });

  it("por omissao esconde modelos inactivos, e o interruptor mostra-os", async () => {
    hasPermission.mockReturnValue(true);
    modelos = [MODELO, { ...MODELO, id: "m2", nome: "Adenda antiga", activo: false }];

    await renderPagina();

    expect(screen.getByText("Contrato-tipo")).toBeTruthy();
    expect(screen.queryByText("Adenda antiga")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Mostrar inactivos" }));

    expect(screen.getByText("Adenda antiga")).toBeTruthy();
  });
});
