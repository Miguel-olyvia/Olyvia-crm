/**
 * "Ofícios de obra" na ficha de RH (migration 20261231996000): mostra os ofícios do Catálogo, marca os da pessoa, grava a lista
 * escolhida e só mostra o custo/hora a quem o pode ver.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (k: string, p?: Record<string, string>) => (p ? `${k} ${Object.values(p).join(" ")}` : k),
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const hrRpc = vi.fn();
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => hrRpc(...a) }));

import { PessoaOficiosObraCard } from "@/components/hr/PessoaOficiosObraCard";

const LIDO = {
  oficios: [
    { id: "lad", nome: "Ladrilhador", ligado: true },
    { id: "can", nome: "Canalizador", ligado: false },
  ],
  custo_hora: 27.73,
  ve_custo: true,
};

describe("PessoaOficiosObraCard", () => {
  beforeEach(() => {
    hrRpc.mockReset();
    hrRpc.mockImplementation(async (fn: string) => (fn === "rh_ler_oficios_pessoa" ? { data: LIDO, error: null } : { data: null, error: null }));
  });

  it("marca os ofícios da pessoa e mostra o custo/hora", async () => {
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    expect(await screen.findByLabelText("Ladrilhador")).toHaveAttribute("data-state", "checked");
    expect(screen.getByLabelText("Canalizador")).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByText(/hr\.oficiosObra\.custoHora 27,73/)).toBeInTheDocument();
  });

  it("grava a lista escolhida", async () => {
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    fireEvent.click(await screen.findByLabelText("Canalizador"));
    fireEvent.click(screen.getByText("employees.form.update"));
    await waitFor(() =>
      expect(hrRpc).toHaveBeenCalledWith("rh_guardar_oficios_pessoa", { p_org: "o1", p_pessoa: "p1", p_skills: ["lad", "can"] }),
    );
  });

  it("sem permissão de editar, fica em leitura e sem botão", async () => {
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar={false} />);
    expect(await screen.findByLabelText("Ladrilhador")).toBeDisabled();
    expect(screen.queryByText("employees.form.update")).toBeNull();
  });

  it("sem retribuicao.view, não mostra o custo/hora", async () => {
    hrRpc.mockResolvedValue({ data: { ...LIDO, custo_hora: null, ve_custo: false }, error: null });
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    await screen.findByLabelText("Ladrilhador");
    expect(screen.queryByText(/custoHora|semCusto/)).toBeNull();
  });
});
