/**
 * `ConfiguracaoVencimento`: gating por permissao (as duas leituras sao
 * independentes -- so uma delas ja chega para ver o ecra, so a sua propria
 * aba), a lista de codigos aparece separada em transversais/proprios, criar
 * um codigo novo, desactivar, e o formulario do subsidio grava. Os hooks
 * (`useCodigosProcessamento`, `useRegrasSubsidioAlimentacao`) sao mockados --
 * a logica de escrita ja tem os proprios testes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

const CODIGO_TRANSVERSAL = {
  id: "c-100",
  organization_id: null as string | null,
  codigo: "100",
  nome: "Horas extraordinarias ao valor normal",
  descricao: null as string | null,
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const CODIGO_PROPRIO = {
  id: "c-300",
  organization_id: "org-nike" as string | null,
  codigo: "300",
  nome: "Recibos verdes",
  descricao: null as string | null,
  activo: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const criarCodigo = vi.fn(async () => {});
const definirActivoCodigo = vi.fn(async () => {});
let codigos: typeof CODIGO_TRANSVERSAL[] = [];
vi.mock("@/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({
    codigos,
    isLoading: false,
    isSaving: false,
    criar: criarCodigo,
    definirActivo: definirActivoCodigo,
  }),
}));

const gravarRegra = vi.fn(async () => {});
let regra = { valorDiario: 0, modo: "dinheiro" as const, minutosMinimosDia: 1 };
vi.mock("@/hooks/useRegrasSubsidioAlimentacao", () => ({
  useRegrasSubsidioAlimentacao: () => ({
    regra,
    temRegraGravada: false,
    isLoading: false,
    isFetched: true,
    error: null,
    isSaving: false,
    gravar: gravarRegra,
  }),
}));

async function renderPagina() {
  const { default: ConfiguracaoVencimento } = await import("../ConfiguracaoVencimento");
  render(<ConfiguracaoVencimento />);
}

describe("ConfiguracaoVencimento", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockReturnValue(false);
    criarCodigo.mockClear();
    definirActivoCodigo.mockClear();
    gravarRegra.mockClear();
    codigos = [CODIGO_TRANSVERSAL, CODIGO_PROPRIO];
    regra = { valorDiario: 0, modo: "dinheiro", minutosMinimosDia: 1 };
  });

  it("sem nenhuma das duas permissoes de leitura mostra o cartao de sem acesso", async () => {
    await renderPagina();

    expect(screen.getByText("Não tem permissão para ver esta informação")).toBeTruthy();
  });

  it("so com hr.vencimento.codigos.view mostra a aba de codigos, sem a de subsidio", async () => {
    hasPermission.mockImplementation((perm: string) => perm === "hr.vencimento.codigos.view");

    await renderPagina();

    expect(screen.getByText("Horas extraordinarias ao valor normal")).toBeTruthy();
    expect(screen.queryByText("Subsídio de alimentação")).toBeNull();
  });

  it("os codigos transversais aparecem marcados, os proprios sem essa marca", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    const transversal = screen.getByText("Horas extraordinarias ao valor normal").closest("div");
    expect(transversal?.parentElement?.textContent).toContain("Partilhado por todo o grupo");

    const proprio = screen.getByText("Recibos verdes").closest("div");
    expect(proprio?.parentElement?.textContent).not.toContain("Partilhado por todo o grupo");
  });

  it("sem hr.vencimento.codigos.gerir nao mostra o botao de novo codigo nem acoes", async () => {
    hasPermission.mockImplementation((perm: string) => perm === "hr.vencimento.codigos.view");

    await renderPagina();

    expect(screen.queryByText("Novo código")).toBeNull();
  });

  it("com .gerir, criar um codigo novo chama o hook com os dados do formulario", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    fireEvent.click(screen.getByText("Novo código"));
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "400" } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Horas noturnas" } });

    const botoesGuardar = screen.getAllByText("Novo código");
    fireEvent.click(botoesGuardar[botoesGuardar.length - 1]);

    await waitFor(() =>
      expect(criarCodigo).toHaveBeenCalledWith({ codigo: "400", nome: "Horas noturnas", descricao: null }),
    );
  });

  it("desactivar um codigo proprio chama definirActivo(id, false)", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    fireEvent.click(screen.getByTitle("Desactivar código"));

    await waitFor(() => expect(definirActivoCodigo).toHaveBeenCalledWith("c-300", false));
  });

  it("o formulario do subsidio grava com os valores editados", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Subsídio de alimentação" }), { button: 0 });
    await waitFor(() => expect(screen.getByLabelText("Valor diário")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Valor diário"), { target: { value: "7.63" } });
    fireEvent.change(screen.getByLabelText("Minutos mínimos por dia"), { target: { value: "60" } });
    fireEvent.click(screen.getByText("Guardar"));

    await waitFor(() =>
      expect(gravarRegra).toHaveBeenCalledWith({ valorDiario: 7.63, modo: "dinheiro", minutosMinimosDia: 60 }),
    );
  });
});
