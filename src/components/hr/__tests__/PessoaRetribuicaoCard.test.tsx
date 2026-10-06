/**
 * `PessoaRetribuicaoCard` no fluxo 2: o valor base vem SO do cargo.
 *
 * O cartao mostra o salario base em leitura ("vem do cargo X"), e o unico
 * gesto de escrita e "Alterar subsidio e duodecimos" -- o dialogo ja nao tem
 * valor, moeda nem periodicidade. Quem escreve e `rpc_hr_retribuicao_definir_
 * pessoal` (a base recusa o INSERT directo). Fecham-se tambem:
 *
 *  - sem cargo: nao ha base nem botao, so a indicacao de onde atribuir cargo;
 *  - o botao respeita `podeAlterar`; "Corrigir" so com `podeCorrigir`;
 *  - o valor mostrado no dialogo e o do cargo NA DATA escolhida (subida agendada);
 *  - os duodecimos propoem 50 quando a pessoa ainda nao tem valor;
 *  - a data de efeito nao pode ser igual ou anterior a da versao em vigor de
 *    origem "pessoa".
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, params?: Record<string, string | number>) =>
      params ? `${chave} ${JSON.stringify(params)}` : chave,
    language: "pt",
  }),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

const dados = vi.hoisted(() => ({
  versoes: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
}));

function versao(over: Record<string, unknown>) {
  return {
    pessoa_id: "p1",
    organization_id: "org",
    vinculo_id: "v1",
    moeda: "EUR",
    subsidio_alimentacao: null,
    subsidio_alimentacao_modo: null,
    motivo: null,
    origem: "pessoa",
    ...over,
  };
}

const VERSAO_ABERTA = versao({
  id: "r-aberta",
  valor_base: 1500,
  periodicidade: "mensal",
  duodecimos_pct: 100,
  valido_de: "2024-06-01",
  valido_ate: null,
});

const VERSAO_HISTORICA = versao({
  id: "r-historica",
  valor_base: 1300,
  periodicidade: "mensal",
  duodecimos_pct: 100,
  valido_de: "2023-01-01",
  valido_ate: "2024-06-01",
});

// A leitura de `pessoas_retribuicoes` ao montar o cartao.
function buildChain() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    insert: () => {
      throw new Error("INSERT directo em pessoas_retribuicoes: o cartao nao pode escrever por aqui");
    },
    update: () => chain,
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve({ data: dados.versoes, error: null }).then(onFulfilled, onRejected);
    },
  };
  return chain;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => buildChain(),
    rpc: (...args: unknown[]) => dados.rpc(...args),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));

import { PessoaRetribuicaoCard } from "@/components/hr/PessoaRetribuicaoCard";
import type { HrCargo } from "@/hooks/useCargos";
import type { HrCargoPeriodo } from "@/lib/hr/cargosPeriodos";

const CARGO: HrCargo = {
  id: "c1",
  organization_id: "org",
  nome: "Comercial",
  horas_referencia: null,
  activo: true,
  created_at: "",
  updated_at: "",
};

function periodo(
  validoDe: string,
  validoAte: string | null,
  salario: number,
): HrCargoPeriodo {
  return {
    id: `c1-${validoDe}`,
    cargo_id: "c1",
    salario_base: salario,
    periodicidade: "mensal",
    valido_de: validoDe,
    valido_ate: validoAte,
    motivo: null,
  };
}

const PERIODOS: HrCargoPeriodo[] = [periodo("2020-01-01", null, 1500)];

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

beforeEach(() => {
  vi.clearAllMocks();
  dados.versoes = [VERSAO_ABERTA, VERSAO_HISTORICA];
  dados.rpc.mockResolvedValue({ data: { versoes_criadas: 1 }, error: null });
});

function montar(
  overrides: {
    podeAlterar?: boolean;
    podeCorrigir?: boolean;
    cargo?: HrCargo | null;
    periodosDoCargo?: HrCargoPeriodo[];
    periodosLoading?: boolean;
    periodosError?: boolean;
    onMudou?: () => void;
  } = {},
) {
  render(
    <PessoaRetribuicaoCard
      pessoaId="p1"
      organizationId="org"
      vinculoActivoId="v1"
      podeAlterar={overrides.podeAlterar ?? true}
      podeCorrigir={overrides.podeCorrigir ?? true}
      cargo={"cargo" in overrides ? (overrides.cargo ?? null) : CARGO}
      periodosDoCargo={overrides.periodosDoCargo ?? PERIODOS}
      periodosLoading={overrides.periodosLoading}
      periodosError={overrides.periodosError}
      onMudou={overrides.onMudou}
    />,
  );
}

describe("PessoaRetribuicaoCard: o botao e o historico", () => {
  it("o botao de subsidio e duodecimos so aparece com podeAlterar", async () => {
    montar({ podeAlterar: false });
    await screen.findByText("1500 EUR");

    expect(screen.queryByText("hr.retribuicaoCartao.alterarPessoal")).not.toBeInTheDocument();
  });

  it("com podeAlterar o botao e 'Alterar subsidio e duodecimos'", async () => {
    montar({ podeAlterar: true });
    await screen.findByText("1500 EUR");

    expect(screen.getByText("hr.retribuicaoCartao.alterarPessoal")).toBeInTheDocument();
    // O botao antigo, que mudava o valor base, desapareceu.
    expect(screen.queryByText("hr.retribuicaoCartao.alterar")).not.toBeInTheDocument();
  });

  it("sem nenhuma versao o botao diz 'Definir'", async () => {
    dados.versoes = [];
    montar();
    await screen.findByText("hr.retribuicaoCartao.semVersoes");

    expect(screen.getByText("hr.retribuicaoCartao.definirPessoal")).toBeInTheDocument();
  });

  it("o botao Corrigir so aparece nas linhas do historico com podeCorrigir", async () => {
    montar({ podeCorrigir: false });

    const linhaHistorico = await screen.findByText("1300 EUR (hr.periodicidade.mensal)");
    const linha = linhaHistorico.closest("tr");
    expect(linha).not.toBeNull();
    expect(within(linha as HTMLElement).queryByText("hr.retribuicaoCartao.corrigir")).not.toBeInTheDocument();
  });

  it("mostra Corrigir na linha do historico quando podeCorrigir", async () => {
    montar({ podeCorrigir: true });

    const linhaHistorico = await screen.findByText("1300 EUR (hr.periodicidade.mensal)");
    const linha = linhaHistorico.closest("tr");
    expect(linha).not.toBeNull();
    expect(within(linha as HTMLElement).getByText("hr.retribuicaoCartao.corrigir")).toBeInTheDocument();
  });

  it("uma versao futura (subida agendada) aparece no historico e nao tem Corrigir: a base so deixa corrigir o que ja decorreu", async () => {
    dados.versoes = [
      versao({
        id: "r-futura",
        valor_base: 1800,
        periodicidade: "mensal",
        duodecimos_pct: 100,
        valido_de: "2099-01-01",
        valido_ate: null,
        origem: "subida_cargo",
      }),
      { ...VERSAO_ABERTA, valido_ate: "2099-01-01" },
    ];
    montar({ podeCorrigir: true });

    // A versao em vigor continua a ser a actual, nao a futura.
    await screen.findByText("1500 EUR");
    const celula = await screen.findByText("1800 EUR (hr.periodicidade.mensal)");
    const linhaFutura = celula.closest("tr") as HTMLElement;
    expect(within(linhaFutura).queryByText("hr.retribuicaoCartao.corrigir")).not.toBeInTheDocument();
  });

  it("o historico traduz a origem de cada versao", async () => {
    dados.versoes = [
      VERSAO_ABERTA,
      { ...VERSAO_HISTORICA, origem: "subida_cargo" },
    ];
    montar();

    const linhaHistorico = await screen.findByText("1300 EUR (hr.periodicidade.mensal)");
    const linha = linhaHistorico.closest("tr") as HTMLElement;
    expect(within(linha).getByText("hr.retribuicaoCartao.origem.subida_cargo")).toBeInTheDocument();
  });
});

describe("PessoaRetribuicaoCard: o salario base vem do cargo", () => {
  it("mostra o base em leitura com o nome do cargo", async () => {
    montar();
    await screen.findByText("1500 EUR");

    const base = screen.getByText(/hr\.retribuicaoCartao\.baseDoCargo/);
    expect(base.textContent).toContain("Comercial");
    expect(base.textContent).toContain("1500");
  });

  it("mostra a subida agendada do cargo", async () => {
    montar({
      periodosDoCargo: [periodo("2020-01-01", "2099-01-01", 1500), periodo("2099-01-01", null, 1800)],
    });
    await screen.findByText("1500 EUR");

    const sobe = screen.getByText(/hr\.cargos\.sobeEm/);
    expect(sobe.textContent).toContain("1800");
    expect(sobe.textContent).toContain("2099-01-01");
  });

  it("sem cargo: diz onde atribuir e nao oferece nenhum botao de escrita", async () => {
    montar({ cargo: null });
    await screen.findByText("1500 EUR");

    expect(screen.getByText("hr.retribuicaoCartao.semCargo")).toBeInTheDocument();
    expect(screen.queryByText("hr.retribuicaoCartao.alterarPessoal")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.retribuicaoCartao.definirPessoal")).not.toBeInTheDocument();
  });
});

describe("PessoaRetribuicaoCard: o dialogo de subsidio e duodecimos", () => {
  async function abrirDialogo() {
    await screen.findByText("1500 EUR");
    fireEvent.click(screen.getByText(/hr\.retribuicaoCartao\.(alterarPessoal|definirPessoal)/));
    return screen.findByRole("dialog");
  }

  it("so tem subsidio, modo, duodecimos, data e motivo -- nada de valor, moeda ou periodicidade", async () => {
    montar();
    const dialogo = await abrirDialogo();

    expect(within(dialogo).getByLabelText("hr.retribuicaoCartao.subsidioAlimentacao")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("hr.retribuicaoCartao.subsidioAlimentacaoModo")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("hr.contrato.duodecimos")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("hr.retribuicaoCartao.dataEfeito")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("hr.laborais.cargoMotivo")).toBeInTheDocument();

    expect(within(dialogo).queryByLabelText("hr.retribuicaoCartao.valor")).not.toBeInTheDocument();
    expect(within(dialogo).queryByLabelText("hr.retribuicaoCartao.moeda")).not.toBeInTheDocument();
    expect(within(dialogo).queryByLabelText("hr.contrato.periodicidade")).not.toBeInTheDocument();
  });

  it("o valor base do cargo aparece em leitura", async () => {
    montar();
    const dialogo = await abrirDialogo();
    const base = within(dialogo).getByText(/hr\.retribuicaoCartao\.baseDoCargo/);
    expect(base.textContent).toContain("1500");
  });

  it("o valor mostrado e o do cargo NA DATA escolhida", async () => {
    montar({
      periodosDoCargo: [periodo("2020-01-01", "2099-01-01", 1500), periodo("2099-01-01", null, 1800)],
    });
    const dialogo = await abrirDialogo();
    expect(within(dialogo).getByText(/hr\.retribuicaoCartao\.baseDoCargo/).textContent).toContain("1500");

    fireEvent.change(within(dialogo).getByLabelText("hr.retribuicaoCartao.dataEfeito"), {
      target: { value: "2099-02-01" },
    });
    await waitFor(() =>
      expect(within(dialogo).getByText(/hr\.retribuicaoCartao\.baseDoCargo/).textContent).toContain("1800"),
    );
  });

  it("os duodecimos propoem 50 quando a pessoa ainda nao tem versao", async () => {
    dados.versoes = [];
    montar();
    fireEvent.click(await screen.findByText("hr.retribuicaoCartao.definirPessoal"));
    const dialogo = await screen.findByRole("dialog");

    const gatilho = within(dialogo).getByLabelText("hr.contrato.duodecimos");
    expect(gatilho.textContent).toContain("50%");
  });

  it("grava pela RPC, nunca por INSERT, e envia so o que e da pessoa", async () => {
    montar();
    const dialogo = await abrirDialogo();

    fireEvent.change(within(dialogo).getByLabelText("hr.retribuicaoCartao.subsidioAlimentacao"), {
      target: { value: "7.5" },
    });
    fireEvent.change(within(dialogo).getByLabelText("hr.retribuicaoCartao.dataEfeito"), {
      target: { value: "2099-03-01" },
    });
    fireEvent.click(within(dialogo).getByText("employees.form.update"));

    await waitFor(() => expect(dados.rpc).toHaveBeenCalledTimes(1));
    const [fn, args] = dados.rpc.mock.calls[0];
    expect(fn).toBe("rpc_hr_retribuicao_definir_pessoal");
    expect(args).toMatchObject({
      p_pessoa_id: "p1",
      p_desde: "2099-03-01",
      p_subsidio: 7.5,
      p_duodecimos_pct: 100,
    });
    expect(args).not.toHaveProperty("p_valor_base");
    expect(args).not.toHaveProperty("p_periodicidade");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("recusa no cliente uma data igual ou anterior a da versao em vigor (origem pessoa)", async () => {
    montar();
    const dialogo = await abrirDialogo();

    fireEvent.change(within(dialogo).getByLabelText("hr.retribuicaoCartao.dataEfeito"), {
      target: { value: "2024-06-01" },
    });
    fireEvent.click(within(dialogo).getByText("employees.form.update"));

    expect(toastError).toHaveBeenCalledWith("hr.retribuicaoCartao.erroDataAnterior");
    expect(dados.rpc).not.toHaveBeenCalled();
  });

  it("recusa um subsidio negativo", async () => {
    montar();
    const dialogo = await abrirDialogo();

    fireEvent.change(within(dialogo).getByLabelText("hr.retribuicaoCartao.subsidioAlimentacao"), {
      target: { value: "-3" },
    });
    fireEvent.click(within(dialogo).getByText("employees.form.update"));

    expect(toastError).toHaveBeenCalledWith("hr.retribuicaoCartao.erroSubsidioInvalido");
    expect(dados.rpc).not.toHaveBeenCalled();
  });

  it("um erro da base (HRC11) volta traduzido e o dialogo fica aberto", async () => {
    dados.rpc.mockResolvedValue({
      data: null,
      error: { code: "HRC11", message: "retribuicao_sem_cargo: atribua primeiro um cargo" },
    });
    montar();
    const dialogo = await abrirDialogo();

    fireEvent.change(within(dialogo).getByLabelText("hr.retribuicaoCartao.dataEfeito"), {
      target: { value: "2099-03-01" },
    });
    fireEvent.click(within(dialogo).getByText("employees.form.update"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).not.toContain("HRC11");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("PessoaRetribuicaoCard: corrigir", () => {
  it("mostra valor e periodicidade em leitura (os da propria linha) e nao os envia", async () => {
    montar();
    const linhaHistorico = await screen.findByText("1300 EUR (hr.periodicidade.mensal)");
    const linha = linhaHistorico.closest("tr") as HTMLElement;
    fireEvent.click(within(linha).getByText("hr.retribuicaoCartao.corrigir"));

    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).queryByLabelText("hr.retribuicaoCartao.valor")).not.toBeInTheDocument();
    expect(within(dialogo).queryByLabelText("hr.contrato.periodicidade")).not.toBeInTheDocument();
    expect(within(dialogo).getByText(/1300/)).toBeInTheDocument();
  });
});

describe("PessoaRetribuicaoCard: carregamento, erro e acessibilidade (revisao React)", () => {
  it("cargos a carregar: diz que carrega e nao 'Sem cargo'", async () => {
    montar({ cargo: null, periodosLoading: true });
    await screen.findByText("1500 EUR");
    expect(screen.queryByText("hr.retribuicaoCartao.semCargo")).not.toBeInTheDocument();
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("falha a ler os cargos: avisa do erro e nao diz 'Sem cargo' nem 'cargo sem salario'", async () => {
    montar({ cargo: null, periodosError: true });
    await screen.findByText("1500 EUR");
    expect(screen.getByText("hr.retribuicaoCartao.periodosErro")).toBeInTheDocument();
    expect(screen.queryByText("hr.retribuicaoCartao.semCargo")).not.toBeInTheDocument();
  });

  it("cargo sem periodos diz 'cargo sem salario definido'", async () => {
    montar({ periodosDoCargo: [] });
    await screen.findByText("1500 EUR");
    expect(screen.getByText("hr.retribuicaoCartao.cargoSemSalario")).toBeInTheDocument();
  });

  it("periodos com erro: mostra o erro e nao 'cargo sem salario'", async () => {
    montar({ periodosDoCargo: [], periodosError: true });
    await screen.findByText("1500 EUR");
    expect(screen.getByText("hr.retribuicaoCartao.periodosErro")).toBeInTheDocument();
    expect(screen.queryByText("hr.retribuicaoCartao.cargoSemSalario")).not.toBeInTheDocument();
  });

  it("o historico marca como 'agendada' a versao futura e nao a passada", async () => {
    dados.versoes = [
      versao({
        id: "r-futura",
        valor_base: 1800,
        periodicidade: "mensal",
        duodecimos_pct: 100,
        valido_de: "2099-01-01",
        valido_ate: null,
        origem: "subida_cargo",
      }),
      { ...VERSAO_ABERTA, valido_ate: "2099-01-01" },
      VERSAO_HISTORICA,
    ];
    montar();
    const futura = (await screen.findByText("1800 EUR (hr.periodicidade.mensal)")).closest("tr") as HTMLElement;
    expect(within(futura).getByText("hr.retribuicaoCartao.agendada")).toBeInTheDocument();
    const passada = screen.getByText("1300 EUR (hr.periodicidade.mensal)").closest("tr") as HTMLElement;
    expect(within(passada).queryByText("hr.retribuicaoCartao.agendada")).not.toBeInTheDocument();
  });

  it("depois de definir subsidio e duodecimos avisa o pai, para a ficha (cargo/retribuicao) se actualizar", async () => {
    const onMudou = vi.fn();
    dados.versoes = [];
    montar({ onMudou });
    fireEvent.click(await screen.findByText("hr.retribuicaoCartao.definirPessoal"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("hr.retribuicaoCartao.dataEfeito"), {
      target: { value: "2099-03-01" },
    });
    fireEvent.click(within(dialogo).getByText("employees.form.update"));

    await waitFor(() => expect(dados.rpc).toHaveBeenCalled());
    await waitFor(() => expect(onMudou).toHaveBeenCalledTimes(1));
  });

  it("a tabela do historico tem legenda", async () => {
    montar();
    await screen.findByText("1300 EUR (hr.periodicidade.mensal)");
    expect(screen.getByRole("table", { name: "hr.retribuicaoCartao.historicoTitulo" })).toBeInTheDocument();
  });

  it("os dialogos tem descricao para leitores de ecra", async () => {
    montar();
    await screen.findByText("1500 EUR");
    fireEvent.click(screen.getByText("hr.retribuicaoCartao.alterarPessoal"));
    expect(await screen.findByText("hr.retribuicaoCartao.ajudaPessoal")).toBeInTheDocument();
  });

  it("o dialogo de corrigir tem descricao para leitores de ecra", async () => {
    montar();
    const linha = (await screen.findByText("1300 EUR (hr.periodicidade.mensal)")).closest("tr") as HTMLElement;
    fireEvent.click(within(linha).getByText("hr.retribuicaoCartao.corrigir"));
    expect(await screen.findByText("hr.retribuicaoCartao.ajudaCorrigir")).toBeInTheDocument();
  });
});
