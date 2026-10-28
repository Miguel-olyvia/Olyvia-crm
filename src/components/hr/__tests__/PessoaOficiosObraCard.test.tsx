/**
 * "Ofícios de obra" na ficha de RH (migrations 20261231996000 e 20261231998000): mostra os ofícios do Catálogo, os do cargo técnico
 * marcados e desativados ("do cargo X"), os extras da pessoa; grava só os extras; só mostra o custo/hora (e de onde vem) a quem o pode
 * ver; e não aparece a quem não tem cargo técnico de obra.
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
  tecnica: true,
  cargo: { id: "c1", nome: "Ladrilhador" },
  oficios: [
    { id: "lad", nome: "Ladrilho", herdado: true, extra: false, ligado: true },
    { id: "pin", nome: "Pintura", herdado: false, extra: true, ligado: true },
    { id: "can", nome: "Canalizador", herdado: false, extra: false, ligado: false },
  ],
  custo_hora: 27.73,
  origem_custo: "retribuicao",
  ve_custo: true,
};

const ler = (lido: unknown) =>
  hrRpc.mockImplementation(async (fn: string) => (fn === "rh_ler_oficios_pessoa" ? { data: lido, error: null } : { data: null, error: null }));

describe("PessoaOficiosObraCard", () => {
  beforeEach(() => {
    hrRpc.mockReset();
    ler(LIDO);
  });

  it("o ofício do cargo vem marcado e desativado, com «do cargo X»; o extra marcado e editável", async () => {
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    const herdado = await screen.findByRole("checkbox", { name: /Ladrilho/ });
    expect(herdado).toHaveAttribute("data-state", "checked");
    expect(herdado).toBeDisabled();
    expect(screen.getByText(/hr\.oficiosObra\.doCargo Ladrilhador/)).toBeInTheDocument();
    const extra = screen.getByRole("checkbox", { name: /Pintura/ });
    expect(extra).toHaveAttribute("data-state", "checked");
    expect(extra).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Canalizador/ })).toHaveAttribute("data-state", "unchecked");
  });

  it("mostra o custo/hora e de onde vem (retribuição)", async () => {
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    await screen.findByRole("checkbox", { name: /Ladrilho/ });
    expect(screen.getByText(/hr\.oficiosObra\.custoHora 27,73 hr\.oficiosObra\.origemRetribuicao/)).toBeInTheDocument();
  });

  it("sem retribuição, o custo vem do salário do cargo e diz qual", async () => {
    ler({ ...LIDO, origem_custo: "cargo" });
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    await screen.findByRole("checkbox", { name: /Ladrilho/ });
    expect(screen.getByText(/hr\.oficiosObra\.custoHora 27,73 hr\.oficiosObra\.origemCargo Ladrilhador/)).toBeInTheDocument();
  });

  it("grava só os extras (nunca o herdado do cargo)", async () => {
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Canalizador/ }));
    fireEvent.click(screen.getByText("employees.form.update"));
    await waitFor(() =>
      expect(hrRpc).toHaveBeenCalledWith("rh_guardar_oficios_pessoa", { p_org: "o1", p_pessoa: "p1", p_skills: ["pin", "can"] }),
    );
  });

  it("sem cargo técnico de obra, o cartão não aparece", async () => {
    ler({ ...LIDO, tecnica: false, oficios: LIDO.oficios.map((o) => ({ ...o, herdado: false, extra: false, ligado: false })) });
    const { container } = render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    await waitFor(() => expect(hrRpc).toHaveBeenCalledWith("rh_ler_oficios_pessoa", { p_org: "o1", p_pessoa: "p1" }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText("hr.oficiosObra.titulo")).toBeNull();
  });

  it("sem permissão de editar, fica em leitura e sem botão", async () => {
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar={false} />);
    expect(await screen.findByRole("checkbox", { name: /Pintura/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Canalizador/ })).toBeDisabled();
    expect(screen.queryByText("employees.form.update")).toBeNull();
  });

  it("sem retribuicao.view, não mostra o custo/hora", async () => {
    ler({ ...LIDO, custo_hora: null, origem_custo: null, ve_custo: false });
    render(<PessoaOficiosObraCard pessoaId="p1" organizationId="o1" podeEditar />);
    await screen.findByRole("checkbox", { name: /Ladrilho/ });
    expect(screen.queryByText(/custoHora|semCusto/)).toBeNull();
  });
});
