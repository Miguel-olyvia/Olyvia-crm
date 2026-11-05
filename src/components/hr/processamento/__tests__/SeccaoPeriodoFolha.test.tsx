/**
 * `SeccaoPeriodoFolha`: a regra em vigor, o aviso do que acontece ao mudar o dia, gravar so com permissao, e a base ainda
 * sem as RPCs (uma linha calma, sem erro vermelho e sem formulario).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));
const toastErro = vi.fn();
const toastSucesso = vi.fn();
vi.mock("@/lib/toast", () => ({ toast: { success: (m: string) => toastSucesso(m), error: (m: string) => toastErro(m) } }));

let estadoMock: "ok" | "indisponivel" | "recusado" | "erro" = "ok";
let regrasMock: unknown[] = [];
const guardarMock = vi.fn(async (..._args: unknown[]) => ({ erro: null as string | null }));
vi.mock("@/hooks/usePeriodoFolhaRegras", () => ({
  usePeriodoFolhaRegras: () => ({
    regras: regrasMock,
    estado: estadoMock,
    isLoading: false,
    isSaving: false,
    guardar: guardarMock,
    recarregar: vi.fn(),
  }),
}));

import { SeccaoPeriodoFolha } from "@/components/hr/processamento/SeccaoPeriodoFolha";

beforeEach(() => {
  estadoMock = "ok";
  regrasMock = [];
  guardarMock.mockClear();
  toastErro.mockClear();
  toastSucesso.mockClear();
});

describe("SeccaoPeriodoFolha", () => {
  it("com a base ainda sem as RPCs diz-o numa linha calma, sem formulario nem alerta", () => {
    estadoMock = "indisponivel";
    render(<SeccaoPeriodoFolha podeGerir />);
    expect(screen.getByTestId("periodo-folha-indisponivel")).toHaveTextContent("hr.periodoFolha.indisponivel");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("hr.periodoFolha.campoDia")).toBeNull();
  });

  it("sem regra gravada diz que vale o mes de calendario; com regra mostra a regra em vigor", () => {
    const { unmount } = render(<SeccaoPeriodoFolha podeGerir={false} />);
    expect(screen.getByTestId("periodo-folha-em-vigor")).toHaveTextContent("hr.periodoFolha.semRegra");
    unmount();

    regrasMock = [{ id: "r1", dia_inicio: 22, valido_de: "2026-11-01", em_vigor: true, criada_em: "2026-10-01T00:00:00Z", criada_por_nome: "Ana" }];
    render(<SeccaoPeriodoFolha podeGerir={false} />);
    expect(screen.getByTestId("periodo-folha-em-vigor")).toHaveTextContent("hr.periodoFolha.regraDiaN");
  });

  it("quem so pode ver nao tem formulario nem botao de gravar", () => {
    render(<SeccaoPeriodoFolha podeGerir={false} />);
    expect(screen.queryByRole("button", { name: "hr.periodoFolha.guardar" })).toBeNull();
    expect(screen.getByText("hr.periodoFolha.semPermissaoGerir")).toBeInTheDocument();
  });

  it("quem gere ve os avisos da transicao, de nao alterar o que ja existe e do prazo", () => {
    render(<SeccaoPeriodoFolha podeGerir />);
    const avisos = screen.getByTestId("periodo-folha-avisos");
    expect(avisos).toHaveTextContent("hr.periodoFolha.avisoTransicao");
    expect(avisos).toHaveTextContent("hr.periodoFolha.avisoNaoAltera");
    expect(avisos).toHaveTextContent("hr.periodoFolha.avisoPrazo");
  });

  it("gravar manda o dia escolhido e o primeiro dia do mes seguinte", async () => {
    render(<SeccaoPeriodoFolha podeGerir />);
    fireEvent.change(screen.getByLabelText("hr.periodoFolha.campoDia"), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("button", { name: "hr.periodoFolha.guardar" }));
    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
    const [dia, validoDe] = guardarMock.mock.calls[0] as [number, string];
    expect(dia).toBe(22);
    expect(validoDe).toMatch(/^\d{4}-\d{2}-01$/);
    expect(toastSucesso).toHaveBeenCalledWith("hr.periodoFolha.guardarSucesso");
  });

  it("um dia fora de 1 a 28 fica visivel junto ao campo (alerta, aria-invalid, foco) e nao chega a base", () => {
    render(<SeccaoPeriodoFolha podeGerir />);
    const campo = screen.getByLabelText("hr.periodoFolha.campoDia");
    fireEvent.change(campo, { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "hr.periodoFolha.guardar" }));
    expect(guardarMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("hr.periodoFolha.erro.diaInvalido");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo.getAttribute("aria-describedby")).toContain("periodo-folha-dia-erro");
    expect(campo).toHaveFocus();
    // Escrever outra vez limpa o erro.
    fireEvent.change(campo, { target: { value: "22" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(campo).not.toHaveAttribute("aria-invalid");
  });

  it.each(["", "0", "29", "2.5"])("valida tambem ao sair do campo: %j", (valor) => {
    render(<SeccaoPeriodoFolha podeGerir />);
    const campo = screen.getByLabelText("hr.periodoFolha.campoDia");
    fireEvent.change(campo, { target: { value: valor } });
    fireEvent.blur(campo);
    expect(screen.getByRole("alert")).toHaveTextContent("hr.periodoFolha.erro.diaInvalido");
  });

  it("um erro da base aparece traduzido, em toast", async () => {
    guardarMock.mockResolvedValueOnce({ erro: "hr.periodoFolha.erro.retroactiva" });
    render(<SeccaoPeriodoFolha podeGerir />);
    fireEvent.change(screen.getByLabelText("hr.periodoFolha.campoDia"), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("button", { name: "hr.periodoFolha.guardar" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("hr.periodoFolha.erro.retroactiva"));
  });

  it("uma regra substituida aparece como substituida no historico e nao como em vigor", () => {
    regrasMock = [
      { id: "r2", dia_inicio: 5, valido_de: "2026-11-01", em_vigor: true, criada_em: "2026-10-02T00:00:00Z", criada_por_nome: "Ana", substituida_em: null },
      { id: "r1", dia_inicio: 22, valido_de: "2026-11-01", em_vigor: false, criada_em: "2026-10-01T00:00:00Z", criada_por_nome: "Ana", substituida_em: "2026-10-02T00:00:00Z" },
    ];
    render(<SeccaoPeriodoFolha podeGerir={false} />);
    expect(screen.getByTestId("periodo-folha-em-vigor")).toHaveTextContent("hr.periodoFolha.regraDiaN");
    expect(screen.getByText(/hr\.periodoFolha\.historicoSubstituida/)).toBeInTheDocument();
  });

  it("a leitura que falhou por rede e um alerta com «Tentar de novo»; a recusada e so um estado", () => {
    estadoMock = "erro";
    const { unmount } = render(<SeccaoPeriodoFolha podeGerir />);
    expect(screen.getByRole("alert")).toHaveTextContent("hr.periodoFolha.erroLeitura");
    expect(screen.getByRole("button", { name: "rhExemplo.leitura.tentarDeNovo" })).toBeInTheDocument();
    unmount();
    estadoMock = "recusado";
    render(<SeccaoPeriodoFolha podeGerir />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("hr.periodoFolha.recusado");
  });
});