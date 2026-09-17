/**
 * `ConfiguracaoVencimento`: gating por permissao (as duas leituras sao
 * independentes -- so uma delas ja chega para ver o ecra, so a sua propria
 * aba), a lista de codigos (todos da organizacao activa, sem separacao
 * nenhuma -- 20261201250000 acabou com a nocao de codigo transversal),
 * criar um codigo novo, desactivar, e o formulario do subsidio grava. Os
 * hooks (`useCodigosProcessamento`, `useRegrasSubsidioAlimentacao`) sao
 * mockados -- a logica de escrita ja tem os proprios testes.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { HrCodigoProcessamento, HrCodigoProcessamentoOrigemAutomatica } from "@/types/hr";

// Radix Select precisa disto no jsdom -- mesmo padrao de
// `WorkflowAutomationRules.options.test.tsx`.
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

const CODIGO_A = {
  id: "c-100",
  organization_id: "org-nike",
  codigo: "100",
  nome: "Horas extraordinarias ao valor normal",
  descricao: null as string | null,
  activo: true,
  modo_calculo: "percentagem_hora_normal" as const,
  percentagem: 100 as number | null,
  valor_fixo: null as number | null,
  origem_automatica: "horas_extra" as const,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const CODIGO_PROPRIO = {
  id: "c-300",
  organization_id: "org-nike",
  codigo: "300",
  nome: "Recibos verdes",
  descricao: null as string | null,
  activo: true,
  modo_calculo: "manual" as const,
  percentagem: null as number | null,
  valor_fixo: null as number | null,
  origem_automatica: null as HrCodigoProcessamentoOrigemAutomatica | null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const criarCodigo = vi.fn(async () => {});
const actualizarCodigo = vi.fn(async () => {});
const definirActivoCodigo = vi.fn(async () => {});
let codigos: HrCodigoProcessamento[] = [];
vi.mock("@/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({
    codigos,
    isLoading: false,
    isSaving: false,
    criar: criarCodigo,
    actualizar: actualizarCodigo,
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
    actualizarCodigo.mockClear();
    definirActivoCodigo.mockClear();
    gravarRegra.mockClear();
    codigos = [CODIGO_A, CODIGO_PROPRIO];
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

  it("todos os codigos da organizacao aparecem juntos, num so cartao", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    expect(screen.getByText("Horas extraordinarias ao valor normal")).toBeTruthy();
    expect(screen.getByText("Recibos verdes")).toBeTruthy();
    expect(screen.getByText("Catálogo de códigos")).toBeTruthy();
  });

  it("sem hr.vencimento.codigos.gerir nao mostra o botao de novo codigo nem acoes", async () => {
    hasPermission.mockImplementation((perm: string) => perm === "hr.vencimento.codigos.view");

    await renderPagina();

    expect(screen.queryByText("Novo código")).toBeNull();
  });

  /** Radix Select no jsdom nao reage de forma fiavel a clique/mouseDown num
   *  item da lista -- mesmo padrao do selector de unidade do subsidio,
   *  abaixo. */
  async function escolherOpcaoCombobox(combo: HTMLElement, nomeOpcao: string) {
    fireEvent.keyDown(combo, { key: "Enter" });
    const listbox = await screen.findByRole("listbox");
    const opcao = within(listbox).getByText(nomeOpcao);
    fireEvent.pointerUp(opcao);
    fireEvent.click(opcao);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  }

  it("com .gerir, criar um codigo novo chama o hook com os dados do formulario", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    fireEvent.click(screen.getByText("Novo código"));
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "400" } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Horas noturnas" } });

    const botoesGuardar = screen.getAllByText("Novo código");
    fireEvent.click(botoesGuardar[botoesGuardar.length - 1]);

    await waitFor(() =>
      expect(criarCodigo).toHaveBeenCalledWith({
        codigo: "400",
        nome: "Horas noturnas",
        descricao: null,
        modo_calculo: "manual",
        percentagem: null,
        valor_fixo: null,
        origem_automatica: null,
      }),
    );
  });

  it("criar um codigo com percentagem_hora_normal e origem horas_extra funciona", async () => {
    hasPermission.mockReturnValue(true);
    // Nenhum outro codigo activo reclama "horas_extra" para este teste.
    codigos = [];

    await renderPagina();

    fireEvent.click(screen.getByText("Novo código"));
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "410" } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Horas extra a 150%" } });

    await escolherOpcaoCombobox(
      screen.getByLabelText("Modo de cálculo"),
      "Percentagem da hora normal",
    );
    fireEvent.change(screen.getByLabelText("Percentagem"), { target: { value: "150" } });
    await escolherOpcaoCombobox(screen.getByLabelText("Aplicar automaticamente a"), "Horas extra");

    const botoesGuardar = screen.getAllByText("Novo código");
    fireEvent.click(botoesGuardar[botoesGuardar.length - 1]);

    await waitFor(() =>
      expect(criarCodigo).toHaveBeenCalledWith({
        codigo: "410",
        nome: "Horas extra a 150%",
        descricao: null,
        modo_calculo: "percentagem_hora_normal",
        percentagem: 150,
        valor_fixo: null,
        origem_automatica: "horas_extra",
      }),
    );
  });

  it("percentagem vazia impede o submit e nao grava percentagem: 0", async () => {
    hasPermission.mockReturnValue(true);
    codigos = [];

    await renderPagina();

    fireEvent.click(screen.getByText("Novo código"));
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "420" } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Codigo sem percentagem" } });

    await escolherOpcaoCombobox(
      screen.getByLabelText("Modo de cálculo"),
      "Percentagem da hora normal",
    );
    // Campo de percentagem fica vazio de proposito -- e o que se esta a testar.
    expect((screen.getByLabelText("Percentagem") as HTMLInputElement).value).toBe("");

    const botoesGuardar = screen.getAllByText("Novo código");
    fireEvent.click(botoesGuardar[botoesGuardar.length - 1]);

    // O submit fica bloqueado pela validacao: nunca chega a chamar o hook,
    // e nunca com percentagem: 0 (que era o que `Number("")` produzia).
    expect(criarCodigo).not.toHaveBeenCalled();
    expect(criarCodigo).not.toHaveBeenCalledWith(expect.objectContaining({ percentagem: 0 }));
  });

  it("trocar de modo limpa o campo do modo anterior", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    fireEvent.click(screen.getByText("Novo código"));
    await escolherOpcaoCombobox(
      screen.getByLabelText("Modo de cálculo"),
      "Percentagem da hora normal",
    );
    fireEvent.change(screen.getByLabelText("Percentagem"), { target: { value: "150" } });

    await escolherOpcaoCombobox(screen.getByLabelText("Modo de cálculo"), "Valor fixo mensal");
    expect(screen.queryByLabelText("Percentagem")).toBeNull();

    await escolherOpcaoCombobox(
      screen.getByLabelText("Modo de cálculo"),
      "Percentagem da hora normal",
    );
    expect((screen.getByLabelText("Percentagem") as HTMLInputElement).value).toBe("");
  });

  it("uma origem ja usada por outro codigo activo aparece desactivada no selector", async () => {
    hasPermission.mockReturnValue(true);
    // CODIGO_A ja usa "horas_extra" e esta activo.
    codigos = [CODIGO_A, CODIGO_PROPRIO];

    await renderPagina();

    fireEvent.click(screen.getByText("Novo código"));
    await escolherOpcaoCombobox(
      screen.getByLabelText("Modo de cálculo"),
      "Percentagem da hora normal",
    );

    fireEvent.keyDown(screen.getByLabelText("Aplicar automaticamente a"), { key: "Enter" });
    const listbox = await screen.findByRole("listbox");
    const opcaoHorasExtra = within(listbox).getByText(
      (conteudo) => conteudo.startsWith("Horas extra") && conteudo.includes("já usada"),
    );
    expect(opcaoHorasExtra.closest('[role="option"]')).toHaveAttribute("aria-disabled", "true");
  });

  it("editar um codigo existente preenche o formulario correctamente", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    fireEvent.click(screen.getAllByRole("button", { name: "Editar código" })[0]);

    expect(screen.getByRole("heading", { name: "Editar código" })).toBeTruthy();
    expect((screen.getByLabelText("Código") as HTMLInputElement).value).toBe("100");
    expect((screen.getByLabelText("Código") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe(
      "Horas extraordinarias ao valor normal",
    );
    expect((screen.getByLabelText("Percentagem") as HTMLInputElement).value).toBe("100");
    expect(screen.getByLabelText("Modo de cálculo").textContent).toContain("Percentagem da hora normal");
    expect(screen.getByLabelText("Aplicar automaticamente a").textContent).toContain("Horas extra");

    fireEvent.click(screen.getByText("Guardar alterações"));

    await waitFor(() =>
      expect(actualizarCodigo).toHaveBeenCalledWith("c-100", {
        nome: "Horas extraordinarias ao valor normal",
        descricao: null,
        modo_calculo: "percentagem_hora_normal",
        percentagem: 100,
        valor_fixo: null,
        origem_automatica: "horas_extra",
      }),
    );
  });

  it("desactivar um codigo chama definirActivo(id, false)", async () => {
    hasPermission.mockReturnValue(true);

    await renderPagina();

    const linhaRecibosVerdes = screen.getByText("Recibos verdes").closest("div")?.parentElement?.parentElement
      ?.parentElement;
    fireEvent.click(
      within(linhaRecibosVerdes as HTMLElement).getByRole("button", { name: "Desactivar código" }),
    );

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

  describe("selector de unidade do campo minimos_minutos_dia", () => {
    beforeEach(() => {
      hasPermission.mockReturnValue(true);
    });

    async function abrirAbaSubsidio() {
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Subsídio de alimentação" }), { button: 0 });
      await waitFor(() => expect(screen.getByLabelText("Valor diário")).toBeTruthy());
    }

    /** O selector de "modo" (Dinheiro/Cartão) e o primeiro combobox da aba;
     *  o de unidade (Minutos/Horas) e o segundo. Abre-o e escolhe a opcao
     *  pedida por teclado -- mesmo padrao de
     *  `WorkflowAutomationRules.options.test.tsx`, porque o Radix Select no
     *  jsdom nao reage de forma fiavel a clique/mouseDown num item da lista. */
    async function escolherUnidade(label: "Minutos" | "Horas") {
      const combo = screen.getAllByRole("combobox")[1];
      fireEvent.keyDown(combo, { key: "Enter" });
      const listbox = await screen.findByRole("listbox");
      const opcao = within(listbox).getByRole("option", { name: label });
      fireEvent.pointerUp(opcao);
      fireEvent.click(opcao);
      await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    }

    it("por omissao mostra o campo em Minutos", async () => {
      await renderPagina();
      await abrirAbaSubsidio();

      expect(screen.getByLabelText("Minutos mínimos por dia")).toBeTruthy();
      expect(screen.getAllByRole("combobox")[1].textContent).toContain("Minutos");
    });

    it("escolher Horas e escrever 5 grava 300 minutos", async () => {
      await renderPagina();
      await abrirAbaSubsidio();

      await escolherUnidade("Horas");

      await waitFor(() => expect(screen.getByLabelText("Horas mínimas por dia")).toBeTruthy());
      fireEvent.change(screen.getByLabelText("Horas mínimas por dia"), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText("Valor diário"), { target: { value: "7.63" } });
      fireEvent.click(screen.getByText("Guardar"));

      await waitFor(() =>
        expect(gravarRegra).toHaveBeenCalledWith({ valorDiario: 7.63, modo: "dinheiro", minutosMinimosDia: 300 }),
      );
    });

    it("escolher Minutos e escrever 300 grava 300 minutos", async () => {
      await renderPagina();
      await abrirAbaSubsidio();

      fireEvent.change(screen.getByLabelText("Minutos mínimos por dia"), { target: { value: "300" } });
      fireEvent.change(screen.getByLabelText("Valor diário"), { target: { value: "7.63" } });
      fireEvent.click(screen.getByText("Guardar"));

      await waitFor(() =>
        expect(gravarRegra).toHaveBeenCalledWith({ valorDiario: 7.63, modo: "dinheiro", minutosMinimosDia: 300 }),
      );
    });

    it("trocar de unidade converte o valor mostrado sem perder precisao (90 minutos -> 1.5 horas)", async () => {
      regra = { valorDiario: 0, modo: "dinheiro", minutosMinimosDia: 90 };
      await renderPagina();
      await abrirAbaSubsidio();

      expect((screen.getByLabelText("Minutos mínimos por dia") as HTMLInputElement).value).toBe("90");

      await escolherUnidade("Horas");

      await waitFor(() =>
        expect((screen.getByLabelText("Horas mínimas por dia") as HTMLInputElement).value).toBe("1.5"),
      );
    });
  });
});
