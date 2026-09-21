/**
 * `ConfiguracaoAdmissao`: gating por `hr.admissao.obrigatorios.gerir`, e a
 * lista de campos aparece populada dentro do cartao "Os seus dados" -- o bug
 * reportado era essa lista ficar sempre vazia (RPC so-service_role chamada
 * do lado do cliente; ver `useConfiguracaoObrigatoriosAdmissao.test.tsx` para
 * o teste da causa raiz). `useConfiguracaoObrigatoriosAdmissao` e mockado
 * aqui -- este teste cobre so a renderizacao.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

const CAMPOS = [
  { codigo: "nif", origem: "pessoa" as const, condicional: false, obrigatorio: true },
  { codigo: "niss", origem: "pessoa" as const, condicional: false, obrigatorio: false },
  { codigo: "conta_numero", origem: "rh" as const, condicional: false, obrigatorio: true },
];

let campos: typeof CAMPOS = [];
let erro: string | null = null;
const definirObrigatorio = vi.fn(async () => {});
vi.mock("@/hooks/useConfiguracaoObrigatoriosAdmissao", () => ({
  useConfiguracaoObrigatoriosAdmissao: () => ({
    campos,
    isLoading: false,
    isSaving: false,
    definirObrigatorio,
    erro,
  }),
}));

import ConfiguracaoAdmissao from "../ConfiguracaoAdmissao";

function renderPagina() {
  render(<ConfiguracaoAdmissao />);
}

describe("ConfiguracaoAdmissao", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockReturnValue(false);
    definirObrigatorio.mockClear();
    campos = CAMPOS;
    erro = null;
  });

  it("sem hr.admissao.obrigatorios.gerir mostra o cartao de sem acesso", async () => {
    renderPagina();

    expect(screen.getByText("Não tem permissão para ver esta informação")).toBeTruthy();
    expect(screen.queryByText("NIF")).toBeNull();
  });

  it("com permissao, a lista de campos aparece populada -- nao fica vazia", async () => {
    hasPermission.mockImplementation((perm: string) => perm === "hr.admissao.obrigatorios.gerir");

    renderPagina();

    expect(screen.getByText("NIF")).toBeTruthy();
    expect(screen.getByText("NISS")).toBeTruthy();
    expect(screen.getAllByRole("switch")).toHaveLength(3);
  });

  it("um erro ao carregar fica visivel, em vez de so mostrar a lista vazia", async () => {
    hasPermission.mockReturnValue(true);
    campos = [];
    erro = "permission denied for function";

    renderPagina();

    expect(screen.getByText(/permission denied for function/)).toBeTruthy();
  });

  it("separa os campos em duas seccoes -- preenchido pela pessoa vs. pelo RH", async () => {
    hasPermission.mockImplementation((perm: string) => perm === "hr.admissao.obrigatorios.gerir");

    renderPagina();

    expect(screen.getByText("Preenchido pela pessoa")).toBeTruthy();
    expect(screen.getByText("Preenchido pelo RH")).toBeTruthy();

    // NIF/NISS (origem "pessoa") tem de aparecer ANTES do titulo da seccao
    // do RH; "Número de conta" (origem "rh") ANTES do titulo da seccao do
    // RH nao deve aparecer -- confirma que a separacao e por `origem`, nao
    // so um titulo decorativo por cima da mesma lista.
    const corpo = document.body.textContent ?? "";
    const indiceSeccaoRh = corpo.indexOf("Preenchido pelo RH");
    const indiceNif = corpo.indexOf("NIF");
    const indiceConta = corpo.indexOf("Número de conta");

    expect(indiceNif).toBeGreaterThanOrEqual(0);
    expect(indiceNif).toBeLessThan(indiceSeccaoRh);
    expect(indiceConta).toBeGreaterThan(indiceSeccaoRh);
  });
});
