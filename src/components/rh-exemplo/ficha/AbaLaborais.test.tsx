/**
 * O separador "Detalhes laborais" da ficha de /rh-exemplo mostra o cartão "Ofícios de obra" (o mesmo do /rh, RPCs da
 * migration 20261231996000) por baixo dos detalhes laborais, e o cartão segue `podeEditarLaborais`: sem ela fica só de leitura.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { rhOficiosObraTranslations } from "@/translations/rhOficiosObra";

// Textos em português do cartão; as outras chaves ficam como estão.
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    language: "pt",
    t: (k: string) => rhOficiosObraTranslations.pt?.[k] ?? k,
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const hrRpc = vi.fn();
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => hrRpc(...a) }));
// Os detalhes laborais têm os seus próprios testes: aqui interessa só o que a aba junta.
vi.mock("@/components/rh-exemplo/PessoaLaboraisTab", () => ({ PessoaLaboraisTab: () => <div data-testid="laborais" /> }));

import { AbaLaborais, type AbaProps } from "./AbasPessoa";

const LIDO = {
  oficios: [
    { id: "lad", nome: "Ladrilhador", ligado: true },
    { id: "can", nome: "Canalizador", ligado: false },
  ],
  custo_hora: null,
  ve_custo: false,
};

function montar(trabalho: { podeVerLaborais: boolean; podeEditarLaborais: boolean }) {
  const props = {
    ficha: { retribuicao: null, saving: false, savePessoa: vi.fn() },
    pessoa: { id: "p1", organization_id: "org-1", nome_completo: "Rui Amaral" },
    ctx: { trabalho, colegas: [], locais: [], cargos: [] },
  } as unknown as AbaProps;
  return render(<AbaLaborais {...props} aoMudarCargo={vi.fn()} />);
}

describe("AbaLaborais (rh-exemplo): ofícios de obra", () => {
  beforeEach(() => {
    hrRpc.mockReset();
    hrRpc.mockImplementation(async (fn: string) => (fn === "rh_ler_oficios_pessoa" ? { data: LIDO, error: null } : { data: null, error: null }));
  });

  it("mostra o cartão «Ofícios de obra» por baixo dos detalhes laborais, lido da pessoa e da organização dela", async () => {
    montar({ podeVerLaborais: true, podeEditarLaborais: true });
    expect(screen.getByTestId("laborais")).toBeInTheDocument();
    expect(screen.getByText("Ofícios de obra")).toBeInTheDocument();
    expect(await screen.findByLabelText("Ladrilhador")).toHaveAttribute("data-state", "checked");
    expect(screen.getByLabelText("Canalizador")).toBeEnabled();
    expect(hrRpc).toHaveBeenCalledWith("rh_ler_oficios_pessoa", { p_org: "org-1", p_pessoa: "p1" });
  });

  it("sem podeEditarLaborais, o cartão fica só de leitura e sem botão de gravar", async () => {
    montar({ podeVerLaborais: true, podeEditarLaborais: false });
    expect(screen.getByText("Ofícios de obra")).toBeInTheDocument();
    expect(await screen.findByLabelText("Ladrilhador")).toBeDisabled();
    expect(screen.getByLabelText("Canalizador")).toBeDisabled();
    expect(screen.queryByText("employees.form.update")).toBeNull();
    expect(hrRpc).not.toHaveBeenCalledWith("rh_guardar_oficios_pessoa", expect.anything());
  });

  it("sem podeVerLaborais, mostra «sem acesso» e não há cartão", () => {
    montar({ podeVerLaborais: false, podeEditarLaborais: false });
    expect(screen.queryByText("Ofícios de obra")).toBeNull();
    expect(hrRpc).not.toHaveBeenCalled();
  });
});
