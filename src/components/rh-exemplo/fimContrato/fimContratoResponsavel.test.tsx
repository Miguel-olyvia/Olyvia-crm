// O fim de contrato do lado do responsável, ligado ao RH real (Supabase simulado: o hook real é substituído, nada vai à base).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SinoFimContrato } from "./SinoFimContrato";
import { IndicacaoDoResponsavelReal } from "@/components/rh-exemplo/hooks/IndicacaoDoResponsavelReal";

const ORG = "org-teste";
const contratoBase = {
  vinculo_id: "v1", pessoa_id: "p1", pessoa_nome: "Ana Teste", tipo_contrato: "prazo_certo", data_fim: "2026-12-31", resposta: null,
};

const estado = vi.hoisted(() => ({
  contratos: [] as Array<Record<string, unknown>>,
  loading: false,
  erroLeitura: false,
  indicar: vi.fn(),
  chamadas: [] as Array<[string | null | undefined, boolean]>,
}));

vi.mock("@/hooks/useContratosDoResponsavel", () => ({
  useContratosDoResponsavel: (org: string | null | undefined, ativo: boolean) => {
    estado.chamadas.push([org, ativo]);
    return { contratos: ativo ? estado.contratos : [], loading: estado.loading, erroLeitura: estado.erroLeitura, aGuardar: null, indicar: estado.indicar };
  },
}));
vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({
  useCompany: () => ({ activeCompany: { id: ORG, name: "Org" }, companies: [], isLoading: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mostrar = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  estado.contratos = [{ ...contratoBase }, { ...contratoBase, vinculo_id: "v2", pessoa_nome: "Rui Teste", resposta: "pretendo_continuar" }];
  estado.loading = false;
  estado.erroLeitura = false;
  estado.chamadas.length = 0;
  estado.indicar.mockReset();
  estado.indicar.mockResolvedValue(null);
});

describe("sino do fim de contrato (real)", () => {
  it("conta só os contratos da equipa ainda sem indicação, lidos com a organização activa", () => {
    mostrar(<SinoFimContrato />);
    expect(screen.getByRole("button", { name: /\(1 por indicar\)/ })).toBeInTheDocument();
    expect(estado.chamadas.some(([org, ativo]) => org === ORG && ativo)).toBe(true);
  });

  it("se a leitura falha, o sino diz-o em vez de mostrar um zero", () => {
    estado.erroLeitura = true;
    mostrar(<SinoFimContrato />);
    expect(screen.getByRole("button", { name: "Não foi possível carregar os contratos da sua equipa." })).toBeInTheDocument();
  });

  it("abre a janela real do responsável e indica através do hook real, sem dados de exemplo", async () => {
    mostrar(<SinoFimContrato />);
    fireEvent.click(screen.getByRole("button", { name: /por indicar/ }));
    const janela = screen.getByRole("dialog", { name: "Contratos da minha equipa" });
    expect(within(janela).getByText("Ana Teste")).toBeInTheDocument();
    fireEvent.click(within(janela).getAllByRole("button", { name: "Pretendo continuar" })[0]);
    await waitFor(() => expect(estado.indicar).toHaveBeenCalledWith("v1", "pretendo_continuar"));
  });

  it("sem equipa a base devolve lista vazia e a janela diz que não há nada para indicar", () => {
    estado.contratos = [];
    mostrar(<SinoFimContrato />);
    fireEvent.click(screen.getByRole("button", { name: /\(0 por indicar\)/ }));
    expect(within(screen.getByRole("dialog")).queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("indicação do responsável no cartão «Fim do contrato» (real)", () => {
  const indicacao = { id: "i1", vinculo_id: "v1", ciclo_fim: "2026-12-31", resposta: "nao_pretendo_continuar", indicada_em: "2026-11-05T10:00:00Z" };

  it("mostra a indicação do ciclo actual lida de hr_contrato_indicacoes", () => {
    mostrar(<IndicacaoDoResponsavelReal vinculoId="v1" dataFim="2026-12-31" indicacoes={[indicacao] as never} />);
    const seccao = screen.getByRole("region", { name: "Indicação do responsável" });
    expect(within(seccao).getByText("Não pretendo continuar")).toBeInTheDocument();
  });

  it("não mostra a indicação de um ciclo anterior nem de outro contrato", () => {
    mostrar(<IndicacaoDoResponsavelReal vinculoId="v1" dataFim="2027-06-30" indicacoes={[indicacao] as never} />);
    const seccao = screen.getByRole("region", { name: "Indicação do responsável" });
    expect(within(seccao).queryByText("Não pretendo continuar")).not.toBeInTheDocument();
  });
});
