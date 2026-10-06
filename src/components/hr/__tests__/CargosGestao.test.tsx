/**
 * `CargosGestao` e o unico sitio onde os cargos de RH se gerem (separador
 * Funcoes de Pessoas). Fecha: contagem por `cargo_id` (nao pelo texto livre),
 * linha "Sem cargo" ao fim, coluna "Em curso" so com `hr.pessoas.vinculos.view`,
 * e botoes de edicao so com `hr.pessoas.laborais.edit`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

const permissoes = vi.hoisted(() => ({ activas: new Set<string>() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => permissoes.activas.has(p),
    loading: false,
  }),
}));

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const CARGOS = [
  { id: "c1", organization_id: "o", nome: "Comercial", salario_base: 1000, periodicidade: "mensal", horas_referencia: null, activo: true, created_at: "", updated_at: "" },
  { id: "c2", organization_id: "o", nome: "Gestor", salario_base: 2000, periodicidade: "mensal", horas_referencia: null, activo: true, created_at: "", updated_at: "" },
  { id: "c3", organization_id: "o", nome: "Antigo", salario_base: 900, periodicidade: "mensal", horas_referencia: null, activo: false, created_at: "", updated_at: "" },
];

vi.mock("@/hooks/useCargos", () => ({
  useCargos: () => ({
    cargos: CARGOS,
    isLoading: false,
    isSaving: false,
    criar: vi.fn(),
    editar: vi.fn(),
    definirActivo: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCargosSalariosDivergentes", () => ({
  useCargosSalariosDivergentes: () => ({ divergencias: [], isLoading: false }),
}));

import { CargosGestao } from "@/components/hr/CargosGestao";
import type { PessoaListItem } from "@/types/hr";

function pessoa(
  id: string,
  cargo_id: string | null,
  estado: "em_curso" | "terminado" | null,
  cargo: string | null = null,
) {
  return { id, cargo_id, cargo, estado_contrato_derivado: estado } as unknown as PessoaListItem;
}

const PESSOAS = [
  pessoa("1", "c1", "em_curso"),
  pessoa("2", "c1", "terminado"),
  pessoa("3", "c2", "em_curso"),
  // texto livre antigo nao conta para nenhum cargo do catalogo
  pessoa("4", null, null, "Comercial"),
  pessoa("5", null, "em_curso"),
];

function celulasDe(linha: HTMLElement) {
  return within(linha).getAllByRole("cell").map((c) => c.textContent);
}

function linhaDe(texto: string): HTMLElement {
  const linha = screen.getByText(texto).closest("tr");
  expect(linha).not.toBeNull();
  return linha as HTMLElement;
}

describe("CargosGestao", () => {
  it("conta pessoas e contratos em curso por cargo_id", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.vinculos.view"]);
    render(<CargosGestao pessoas={PESSOAS} loading={false} />);

    const comercial = celulasDe(linhaDe("Comercial"));
    expect(comercial.slice(-2)).toEqual(["2", "1"]);
    expect(celulasDe(linhaDe("Gestor")).slice(-2)).toEqual(["1", "1"]);
  });

  it("pessoas sem cargo_id vao para a linha Sem cargo, a ultima, sem somar o texto livre", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.vinculos.view"]);
    render(<CargosGestao pessoas={PESSOAS} loading={false} />);

    const linhas = screen.getAllByRole("row");
    const ultima = linhas[linhas.length - 1];
    expect(within(ultima).getByText("hr.funcoes.semCargo")).toBeInTheDocument();
    expect(celulasDe(ultima).slice(-2)).toEqual(["2", "1"]);
  });

  it("esconde a coluna Em curso sem hr.pessoas.vinculos.view", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    render(<CargosGestao pessoas={PESSOAS} loading={false} />);

    expect(screen.queryByText("hr.estadoContrato.em_curso")).not.toBeInTheDocument();
  });

  it("so mostra criar e editar com hr.pessoas.laborais.edit", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    const { unmount } = render(<CargosGestao pessoas={PESSOAS} loading={false} />);
    expect(screen.queryByText("hr.cargos.novoCargo")).not.toBeInTheDocument();
    expect(screen.queryAllByTitle("hr.cargos.editarCargo")).toHaveLength(0);
    unmount();

    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.laborais.edit"]);
    render(<CargosGestao pessoas={PESSOAS} loading={false} />);
    expect(screen.getByText("hr.cargos.novoCargo")).toBeInTheDocument();
    expect(screen.getAllByTitle("hr.cargos.editarCargo").length).toBeGreaterThan(0);
  });

  it("sem hr.pessoas.laborais.view nao mostra a lista", () => {
    permissoes.activas = new Set();
    render(<CargosGestao pessoas={PESSOAS} loading={false} />);
    expect(screen.queryByText("Comercial")).not.toBeInTheDocument();
  });

  it("cargos inactivos so aparecem a pedido", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    render(<CargosGestao pessoas={PESSOAS} loading={false} />);
    expect(screen.queryByText("Antigo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("hr.cargos.mostrarInactivos"));
    expect(screen.getByText("Antigo")).toBeInTheDocument();
  });
});
