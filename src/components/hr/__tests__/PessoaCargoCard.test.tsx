/**
 * `PessoaCargoCard`: o unico sitio onde se muda o cargo de uma pessoa (fluxo 2).
 *
 * O que fecha:
 *  - o ecra AVISA antes de confirmar: "de X para Y", "igual", "primeiro salario"
 *    e a subida agendada do cargo novo;
 *  - so se oferecem cargos activos (e nunca o actual);
 *  - a data nao passa de hoje (D3);
 *  - quem tem retribuicao e nao tem `hr.pessoas.retribuicao.edit` fica com o
 *    botao desactivado e a explicacao (D2);
 *  - um erro da base (HRC06) chega traduzido; o historico mostra os cargos
 *    antigos com datas e a coluna do salario so com `retribuicao.view`.
 *
 * Supabase simulado: o hook `usePessoaCargo` e substituido.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  // Devolve a chave e os parametros, para os avisos poderem ser verificados.
  useTranslation: () => ({
    t: (chave: string, params?: Record<string, string | number>) =>
      params ? `${chave} ${JSON.stringify(params)}` : chave,
    language: "pt",
  }),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError, success: toastSuccess } }));

const cargoHook = vi.hoisted(() => ({
  linhas: [] as Array<Record<string, unknown>>,
  loading: false,
  erroLeitura: false,
  mudarCargo: vi.fn(),
}));
vi.mock("@/hooks/usePessoaCargo", () => ({
  usePessoaCargo: () => ({
    linhas: cargoHook.linhas,
    aberta: cargoHook.linhas.find((l) => l.valido_ate === null) ?? null,
    loading: cargoHook.loading,
    erroLeitura: cargoHook.erroLeitura,
    recusado: false,
    saving: false,
    mudarCargo: cargoHook.mudarCargo,
    recarregar: vi.fn(),
  }),
}));

import { PessoaCargoCard } from "@/components/hr/PessoaCargoCard";
import { dataDeHojeISO } from "@/lib/hr/afectacoes";
import type { HrCargo } from "@/hooks/useCargos";
import type { HrCargoPeriodo } from "@/lib/hr/cargosPeriodos";

function cargo(id: string, nome: string, activo = true): HrCargo {
  return {
    id,
    organization_id: "org",
    nome,
    horas_referencia: null,
    activo,
    created_at: "",
    updated_at: "",
  };
}

function periodo(
  cargoId: string,
  validoDe: string,
  validoAte: string | null,
  salario: number,
  periodicidade: HrCargoPeriodo["periodicidade"] = "mensal",
): HrCargoPeriodo {
  return {
    id: `${cargoId}-${validoDe}`,
    cargo_id: cargoId,
    salario_base: salario,
    periodicidade,
    valido_de: validoDe,
    valido_ate: validoAte,
    motivo: null,
  };
}

const CARGOS = [
  cargo("c1", "Comercial"),
  cargo("c2", "Gestor"),
  cargo("c3", "Operador"),
  cargo("c4", "Antigo", false),
];

const PERIODOS: HrCargoPeriodo[] = [
  periodo("c1", "2020-01-01", null, 1000),
  periodo("c2", "2020-01-01", null, 2000),
  periodo("c3", "2020-01-01", null, 1000),
];

const LINHA_C1 = {
  id: "l1",
  pessoa_id: "p1",
  organization_id: "org",
  cargo_id: "c1",
  valido_de: "2025-01-01",
  valido_ate: null,
  motivo: null,
};

function montar(
  overrides: Partial<Parameters<typeof PessoaCargoCard>[0]> = {},
) {
  const onMudou = vi.fn();
  render(
    <PessoaCargoCard
      pessoaId="p1"
      organizationId="org"
      cargos={CARGOS}
      periodos={PERIODOS}
      podeEditar
      podeVerRetribuicao
      podeEditarRetribuicao
      temRetribuicao={false}
      salarioActual={null}
      onMudou={onMudou}
      {...overrides}
    />,
  );
  return { onMudou };
}

function abrirDialogo() {
  const botao = screen.getByRole("button", { name: /hr\.laborais\.cargo(Mudar|Atribuir)$/ });
  fireEvent.click(botao);
}

async function escolherCargo(nome: string) {
  const combobox = await screen.findByRole("combobox");
  fireEvent.keyDown(combobox, { key: "Enter" });
  const lista = await screen.findByRole("listbox");
  fireEvent.click(within(lista).getByText(nome));
}

beforeEach(() => {
  vi.clearAllMocks();
  cargoHook.linhas = [LINHA_C1];
  cargoHook.loading = false;
  cargoHook.erroLeitura = false;
  cargoHook.mudarCargo.mockResolvedValue({ erro: null, resultado: { versoes_criadas: 1 } });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("PessoaCargoCard", () => {
  it("mostra o cargo em vigor e desde quando", () => {
    montar();
    const actual = screen.getByTestId("cargo-actual");
    expect(actual).toHaveTextContent("Comercial");
    expect(actual).toHaveTextContent("2025-01-01");
  });

  it("sem cargo o botao e Atribuir; com cargo e Mudar", () => {
    cargoHook.linhas = [];
    const { unmount } = render(
      <PessoaCargoCard
        pessoaId="p1"
        organizationId="org"
        cargos={CARGOS}
        periodos={PERIODOS}
        podeEditar
        podeVerRetribuicao
        podeEditarRetribuicao
        temRetribuicao={false}
        salarioActual={null}
        onMudou={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "hr.laborais.cargoAtribuir" })).toBeInTheDocument();
    unmount();

    cargoHook.linhas = [LINHA_C1];
    montar();
    expect(screen.getByRole("button", { name: "hr.laborais.cargoMudar" })).toBeInTheDocument();
  });

  it("nao ha botao 'retirar cargo': so mudar", () => {
    montar();
    expect(screen.queryByText(/retirar/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retirar|remover/i })).not.toBeInTheDocument();
  });

  it("sem hr.pessoas.laborais.edit nao ha botao", () => {
    montar({ podeEditar: false });
    expect(screen.queryByRole("button", { name: "hr.laborais.cargoMudar" })).not.toBeInTheDocument();
  });

  it("so oferece cargos activos e nunca o actual", async () => {
    montar();
    abrirDialogo();
    const combobox = await screen.findByRole("combobox");
    fireEvent.keyDown(combobox, { key: "Enter" });
    const lista = await screen.findByRole("listbox");

    expect(within(lista).getByText("Gestor")).toBeInTheDocument();
    expect(within(lista).getByText("Operador")).toBeInTheDocument();
    expect(within(lista).queryByText("Antigo")).not.toBeInTheDocument();
    expect(within(lista).queryByText("Comercial")).not.toBeInTheDocument();
  });

  it("avisa 'de X para Y' quando o salario muda", async () => {
    montar();
    abrirDialogo();
    await escolherCargo("Gestor");

    const aviso = await screen.findByText(/hr\.laborais\.cargoAvisoDePara/);
    expect(aviso.textContent).toContain("1000");
    expect(aviso.textContent).toContain("2000");
  });

  it("avisa 'igual' quando o salario do cargo novo e o mesmo", async () => {
    montar();
    abrirDialogo();
    await escolherCargo("Operador");

    const aviso = await screen.findByText(/hr\.laborais\.cargoAvisoIgual/);
    expect(aviso.textContent).toContain("1000");
    expect(screen.queryByText(/hr\.laborais\.cargoAvisoDePara/)).not.toBeInTheDocument();
  });

  it("sem cargo anterior e com retribuicao sem valor em vigor avisa 'primeiro salario'", async () => {
    cargoHook.linhas = [];
    montar({ temRetribuicao: true });
    abrirDialogo();
    await escolherCargo("Gestor");

    const aviso = await screen.findByText(/hr\.laborais\.cargoAvisoPrimeiro/);
    expect(aviso.textContent).toContain("2000");
  });

  it("sem cargo mas com retribuicao antiga, compara com o salario actual da pessoa", async () => {
    cargoHook.linhas = [];
    montar({
      temRetribuicao: true,
      salarioActual: { salarioBase: 900, periodicidade: "mensal" },
    });
    abrirDialogo();
    await escolherCargo("Gestor");

    const aviso = await screen.findByText(/hr\.laborais\.cargoAvisoDePara/);
    expect(aviso.textContent).toContain("900");
    expect(aviso.textContent).toContain("2000");
  });

  it("avisa quando o cargo novo tem uma subida agendada", async () => {
    montar({
      periodos: [
        ...PERIODOS,
        periodo("c2", "2099-01-01", null, 2500),
      ].map((p) => (p.cargo_id === "c2" && p.valido_de === "2020-01-01" ? { ...p, valido_ate: "2099-01-01" } : p)),
    });
    abrirDialogo();
    await escolherCargo("Gestor");

    const aviso = await screen.findByText(/hr\.laborais\.cargoAvisoAgendado/);
    expect(aviso.textContent).toContain("2099-01-01");
  });

  it("a data de efeito nao passa de hoje", async () => {
    montar();
    abrirDialogo();
    const data = (await screen.findByLabelText("hr.laborais.cargoDesde")) as HTMLInputElement;
    expect(data.max).toBe(dataDeHojeISO());
    expect(data.value).toBe(dataDeHojeISO());
  });

  it("confirmar chama mudarCargo com cargo, data e motivo, avisa o pai e fecha", async () => {
    const { onMudou } = montar();
    abrirDialogo();
    await escolherCargo("Gestor");
    fireEvent.change(screen.getByLabelText("hr.laborais.cargoMotivo"), {
      target: { value: "Promocao" },
    });
    fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));

    await waitFor(() => expect(onMudou).toHaveBeenCalledTimes(1));
    expect(cargoHook.mudarCargo).toHaveBeenCalledWith("c2", dataDeHojeISO(), "Promocao");
    expect(toastSuccess).toHaveBeenCalledWith("hr.laborais.cargoMudado");
  });

  it("sem cargo escolhido nao se pode confirmar", async () => {
    montar();
    abrirDialogo();
    const confirmar = await screen.findByRole("button", { name: "employees.form.update" });
    expect(confirmar).toBeDisabled();
  });

  it("com retribuicao e sem hr.pessoas.retribuicao.edit o botao fica desactivado, com a explicacao", () => {
    montar({ temRetribuicao: true, podeEditarRetribuicao: false });
    expect(screen.getByRole("button", { name: "hr.laborais.cargoMudar" })).toBeDisabled();
    expect(screen.getByText("hr.laborais.cargoSemPermissaoRetribuicao")).toBeInTheDocument();
  });

  it("sem retribuicao, laborais.edit chega (primeiro cargo)", () => {
    montar({ temRetribuicao: false, podeEditarRetribuicao: false });
    expect(screen.getByRole("button", { name: "hr.laborais.cargoMudar" })).toBeEnabled();
  });

  it("erro da base volta traduzido e o dialogo fica aberto", async () => {
    cargoHook.mudarCargo.mockResolvedValue({
      erro: "texto traduzido de HRC06",
      resultado: null,
    });
    const { onMudou } = montar();
    abrirDialogo();
    await escolherCargo("Gestor");
    fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("texto traduzido de HRC06"));
    expect(onMudou).not.toHaveBeenCalled();
    expect(screen.getByLabelText("hr.laborais.cargoMotivo")).toBeInTheDocument();
  });

  it("o historico lista os cargos antigos com datas e salario base", () => {
    cargoHook.linhas = [
      LINHA_C1,
      { ...LINHA_C1, id: "l0", cargo_id: "c2", valido_de: "2024-01-01", valido_ate: "2025-01-01" },
    ];
    montar();

    const tabela = screen.getByRole("table");
    expect(within(tabela).getByText("Gestor")).toBeInTheDocument();
    expect(within(tabela).getByText("2024-01-01")).toBeInTheDocument();
    expect(within(tabela).getAllByText(/1000|2000/).length).toBeGreaterThan(0);
  });

  it("a coluna do salario so aparece com hr.pessoas.retribuicao.view", () => {
    cargoHook.linhas = [LINHA_C1];
    montar({ podeVerRetribuicao: false });
    const tabela = screen.getByRole("table");
    expect(within(tabela).queryByText(/1000/)).not.toBeInTheDocument();
  });

  // -- Achados da revisao React (fluxo 2) ------------------------------------

  it("um cargo que comeca hoje corrige-se na mesma data (a base aceita p_desde = valido_de >= hoje)", async () => {
    const hoje = dataDeHojeISO();
    cargoHook.linhas = [{ ...LINHA_C1, valido_de: hoje }];
    const { onMudou } = montar();
    abrirDialogo();
    const data = (await screen.findByLabelText("hr.laborais.cargoDesde")) as HTMLInputElement;
    expect(data.min).toBe(hoje);
    expect(data.max).toBe(hoje);
    await escolherCargo("Gestor");
    fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));

    await waitFor(() => expect(onMudou).toHaveBeenCalledTimes(1));
    expect(cargoHook.mudarCargo).toHaveBeenCalledWith("c2", hoje, "");
  });

  it("uma data fora do intervalo explica de que data a que data se pode escolher", async () => {
    montar();
    abrirDialogo();
    await escolherCargo("Gestor");
    fireEvent.change(await screen.findByLabelText("hr.laborais.cargoDesde"), {
      target: { value: "2025-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const texto = String(toastError.mock.calls[0][0]);
    expect(texto).toContain("hr.laborais.cargoDataForaIntervalo");
    expect(texto).toContain("2025-01-02");
    expect(texto).toContain(dataDeHojeISO());
    expect(cargoHook.mudarCargo).not.toHaveBeenCalled();
  });

  it("falha a ler pessoas_cargos: mostra o erro e nao oferece 'Atribuir cargo' nem 'sem valor'", () => {
    cargoHook.linhas = [];
    cargoHook.erroLeitura = true;
    montar();
    expect(screen.getByTestId("cargo-actual")).toHaveTextContent("hr.laborais.cargoErroLeitura");
    expect(screen.getByTestId("cargo-actual")).not.toHaveTextContent("hr.campos.semValor");
    expect(screen.queryByRole("button", { name: "hr.laborais.cargoAtribuir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "hr.laborais.cargoMudar" })).not.toBeInTheDocument();
    expect(screen.queryByText("hr.laborais.cargoHistoricoVazio")).not.toBeInTheDocument();
  });

  it("a carregar: diz que carrega e nao oferece mudar nem diz 'sem cargo'", () => {
    cargoHook.linhas = [];
    cargoHook.loading = true;
    montar();
    expect(screen.getByTestId("cargo-actual")).toHaveTextContent("common.loading");
    expect(screen.queryByRole("button", { name: "hr.laborais.cargoAtribuir" })).not.toBeInTheDocument();
    expect(screen.queryByText("hr.laborais.cargoHistoricoVazio")).not.toBeInTheDocument();
  });

  it("periodos dos cargos com erro: avisa no dialogo em vez de dizer 'sem salario'", async () => {
    montar({ periodos: [], periodosError: true });
    abrirDialogo();
    await escolherCargo("Gestor");
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("hr.laborais.cargoPeriodosErro")).toBeInTheDocument();
    expect(screen.queryByText("hr.laborais.cargoAvisoSemSalario")).not.toBeInTheDocument();
  });

  it("periodos dos cargos a carregar: diz que carrega e nao 'sem salario'", async () => {
    montar({ periodos: [], periodosLoading: true });
    abrirDialogo();
    await escolherCargo("Gestor");
    expect(await screen.findByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByText("hr.laborais.cargoAvisoSemSalario")).not.toBeInTheDocument();
  });

  it("cargo novo sem periodos diz 'sem salario definido'", async () => {
    montar({ periodos: PERIODOS.filter((p) => p.cargo_id !== "c2") });
    abrirDialogo();
    await escolherCargo("Gestor");
    expect(await screen.findByText("hr.laborais.cargoAvisoSemSalario")).toBeInTheDocument();
  });

  it("sem hr.pessoas.retribuicao.view o aviso nao desaparece: diz que o salario so se ve com a permissao", async () => {
    montar({ podeVerRetribuicao: false, periodos: [], podeEditarRetribuicao: true });
    abrirDialogo();
    await escolherCargo("Gestor");
    expect(await screen.findByText("hr.laborais.cargoAvisoSalarioOculto")).toBeInTheDocument();
    expect(screen.queryByText("hr.laborais.cargoAvisoSemSalario")).not.toBeInTheDocument();
  });

  it("pessoa sem cargo e sem retribuicao: atribuir o cargo nao lhe cria retribuicao, e o aviso di-lo (nao 'passa a ter')", async () => {
    cargoHook.linhas = [];
    montar({ temRetribuicao: false });
    abrirDialogo();
    await escolherCargo("Gestor");
    const aviso = await screen.findByText(/hr\.laborais\.cargoAvisoSemRetribuicao/);
    expect(aviso.textContent).toContain("2000");
    expect(screen.queryByText(/hr\.laborais\.cargoAvisoPrimeiro/)).not.toBeInTheDocument();
    expect(screen.queryByText(/hr\.laborais\.cargoAvisoDePara/)).not.toBeInTheDocument();
  });

  it("sem retribuicao.view nao se sabe se tem retribuicao: o botao fica desactivado, com o motivo visivel", () => {
    montar({ podeVerRetribuicao: false, podeEditarRetribuicao: false, temRetribuicao: false });
    expect(screen.getByRole("button", { name: "hr.laborais.cargoMudar" })).toBeDisabled();
    expect(screen.getByText("hr.laborais.cargoSemPermissaoRetribuicaoIncerta")).toBeInTheDocument();
  });

  it("data passada sem hr.pessoas.retribuicao.corrigir: explica que pode reescrever a versao em vigor", async () => {
    cargoHook.linhas = [{ ...LINHA_C1, valido_de: "2024-01-01" }];
    montar({ temRetribuicao: true, podeCorrigirRetribuicao: false });
    abrirDialogo();
    fireEvent.change(await screen.findByLabelText("hr.laborais.cargoDesde"), {
      target: { value: "2025-06-01" },
    });
    expect(await screen.findByText("hr.laborais.cargoAvisoPrecisaCorrigir")).toBeInTheDocument();
  });

  it("com hr.pessoas.retribuicao.corrigir esse aviso nao aparece", async () => {
    cargoHook.linhas = [{ ...LINHA_C1, valido_de: "2024-01-01" }];
    montar({ temRetribuicao: true, podeCorrigirRetribuicao: true });
    abrirDialogo();
    fireEvent.change(await screen.findByLabelText("hr.laborais.cargoDesde"), {
      target: { value: "2025-06-01" },
    });
    expect(screen.queryByText("hr.laborais.cargoAvisoPrecisaCorrigir")).not.toBeInTheDocument();
  });

  it("Confirmar desactivado diz porque: falta escolher o cargo", async () => {
    montar();
    abrirDialogo();
    expect(await screen.findByText("hr.laborais.cargoConfirmarFaltaCargo")).toBeInTheDocument();
    await escolherCargo("Gestor");
    expect(screen.queryByText("hr.laborais.cargoConfirmarFaltaCargo")).not.toBeInTheDocument();
  });

  it("o dialogo tem descricao para leitores de ecra", async () => {
    montar();
    abrirDialogo();
    expect(await screen.findByText("hr.laborais.cargoMudarAjuda")).toBeInTheDocument();
  });

  it("a tabela do historico tem legenda", () => {
    montar();
    expect(screen.getByRole("table", { name: "hr.laborais.cargoHistoricoTitulo" })).toBeInTheDocument();
  });
});
