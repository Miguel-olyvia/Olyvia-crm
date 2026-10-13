/**
 * A página "Dados em falta" (/dados-em-falta): mostra o relatório das
 * encomendas pós-contrato a quem planeia; o resto da equipa não o vê.
 * O relatório em si está testado em components/__tests__/ArranqueEncomendas.test.tsx.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const auth = vi.hoisted(() => ({ activeOrgId: "org" as string | null, funcao: "gestor" as string | null }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../../components/arranque/DadosEmFalta", () => ({
  DadosEmFalta: ({ orgId }: { orgId: string }) => <div data-testid="relatorio">relatório de {orgId}</div>,
}));

import DadosEmFaltaPagina from "../DadosEmFalta";

beforeEach(() => {
  auth.activeOrgId = "org";
  auth.funcao = "gestor";
});

describe("DadosEmFaltaPagina", () => {
  it("o gestor vê o relatório da organização ativa", () => {
    render(<DadosEmFaltaPagina />);
    expect(screen.getByRole("heading", { name: "Dados em falta" })).toBeInTheDocument();
    expect(screen.getByTestId("relatorio")).toHaveTextContent("relatório de org");
  });

  it("um técnico não vê o relatório", () => {
    auth.funcao = "tecnico";
    render(<DadosEmFaltaPagina />);
    expect(screen.queryByTestId("relatorio")).toBeNull();
    expect(screen.getByText(/para quem planeia/)).toBeInTheDocument();
  });

  it("sem organização, pede para escolher", () => {
    auth.activeOrgId = null;
    render(<DadosEmFaltaPagina />);
    expect(screen.getByText("Sem organização escolhida")).toBeInTheDocument();
  });
});
