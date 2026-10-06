/**
 * `CargosGestao` e o unico sitio onde os cargos de RH se gerem (separador
 * Funcoes de Pessoas). Fecha: contagem por `cargo_id` (nao pelo texto livre),
 * linha "Sem cargo" ao fim, coluna "Em curso" so com `hr.pessoas.vinculos.view`,
 * e botoes de edicao so com `hr.pessoas.laborais.edit`.
 *
 * Fluxo 2 (cargo e salario): o salario do cargo ja NAO se edita no formulario
 * do cargo. O botao "Alterar salario" so existe com `hr.cargos.salario.alterar`,
 * avisa quantas pessoas afecta, exige motivo e vai pela RPC; o cartao "Fichas
 * sem cargo" lista quem precisa de cargo; as divergencias do periodo aparecem
 * (ou "sem divergencias").
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, params?: Record<string, string | number>) =>
      params ? `${chave} ${JSON.stringify(params)}` : chave,
    language: "pt",
  }),
}));

const permissoes = vi.hoisted(() => ({ activas: new Set<string>() }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => permissoes.activas.has(p),
    loading: false,
  }),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError, success: toastSuccess } }));

// Espia: o comportamento e o real, mas vemos por onde passam os erros de criar/editar.
const erros = vi.hoisted(() => ({ mensagem: vi.fn() }));
vi.mock("@/lib/hr/errosCargo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/hr/errosCargo")>();
  erros.mensagem.mockImplementation(real.mensagemDeErroCargo);
  return { ...real, mensagemDeErroCargo: erros.mensagem };
});

const CARGOS = [
  { id: "c1", organization_id: "o", nome: "Comercial", salario_base: 1000, periodicidade: "mensal", horas_referencia: null, activo: true, created_at: "", updated_at: "" },
  { id: "c2", organization_id: "o", nome: "Gestor", salario_base: 2000, periodicidade: "mensal", horas_referencia: null, activo: true, created_at: "", updated_at: "" },
  { id: "c3", organization_id: "o", nome: "Antigo", salario_base: 900, periodicidade: "mensal", horas_referencia: null, activo: false, created_at: "", updated_at: "" },
  // Criado por quem nao tem hr.cargos.salario.alterar: a base grava salario 0.
  { id: "c4", organization_id: "o", nome: "Provisorio", salario_base: 0, periodicidade: "mensal", horas_referencia: null, activo: true, created_at: "", updated_at: "" },
];

const PERIODOS_BASE = [
  { id: "p-c1-a", cargo_id: "c1", salario_base: 1000, periodicidade: "mensal", valido_de: "2020-01-01", valido_ate: "2099-01-01", motivo: null },
  { id: "p-c1-b", cargo_id: "c1", salario_base: 1200, periodicidade: "mensal", valido_de: "2099-01-01", valido_ate: null, motivo: null },
  { id: "p-c2", cargo_id: "c2", salario_base: 2000, periodicidade: "mensal", valido_de: "2020-01-01", valido_ate: null, motivo: null },
  { id: "p-c3", cargo_id: "c3", salario_base: 900, periodicidade: "mensal", valido_de: "2020-01-01", valido_ate: null, motivo: null },
  { id: "p-c4", cargo_id: "c4", salario_base: 0, periodicidade: "mensal", valido_de: "2020-01-01", valido_ate: null, motivo: null },
];

const hooks = vi.hoisted(() => ({
  editar: vi.fn(),
  criar: vi.fn(),
  definirSalario: vi.fn(),
  divergenciasPeriodo: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/hooks/useCargos", () => ({
  useCargos: () => ({
    cargos: CARGOS,
    periodos: PERIODOS_BASE,
    salarioDoCargoEm: () => null,
    isLoading: false,
    isSaving: false,
    criar: hooks.criar,
    editar: hooks.editar,
    definirSalario: hooks.definirSalario,
    definirActivo: vi.fn(),
  }),
}));
vi.mock("@/hooks/useCargosSalariosDivergentes", () => ({
  useCargosSalariosDivergentes: () => ({ divergencias: [], isLoading: false }),
}));
vi.mock("@/hooks/useCargosRetribuicoesDivergentes", () => ({
  useCargosRetribuicoesDivergentes: () => ({
    divergencias: hooks.divergenciasPeriodo,
    isLoading: false,
  }),
}));

import { CargosGestao } from "@/components/hr/CargosGestao";
import { dataDeHojeBase } from "@/lib/hr/dataBase";
import type { PessoaListItem } from "@/types/hr";

function pessoa(
  id: string,
  cargo_id: string | null,
  estado: "em_curso" | "terminado" | null,
  cargo: string | null = null,
) {
  return {
    id,
    cargo_id,
    cargo,
    nome_completo: `Pessoa ${id}`,
    estado_contrato_derivado: estado,
  } as unknown as PessoaListItem;
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

function montar() {
  return render(
    <MemoryRouter>
      <CargosGestao pessoas={PESSOAS} loading={false} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.divergenciasPeriodo = [];
  hooks.editar.mockResolvedValue(undefined);
  hooks.definirSalario.mockResolvedValue({ pessoas_actualizadas: 2 });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

describe("CargosGestao", () => {
  it("conta pessoas e contratos em curso por cargo_id", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.vinculos.view"]);
    montar();

    const comercial = celulasDe(linhaDe("Comercial"));
    expect(comercial.slice(-2)).toEqual(["2", "1"]);
    expect(celulasDe(linhaDe("Gestor")).slice(-2)).toEqual(["1", "1"]);
  });

  it("pessoas sem cargo_id vao para a linha Sem cargo, a ultima, sem somar o texto livre", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.vinculos.view"]);
    montar();

    const linhas = screen.getAllByRole("row");
    const ultima = linhas[linhas.length - 1];
    expect(within(ultima).getByText("hr.funcoes.semCargo")).toBeInTheDocument();
    expect(celulasDe(ultima).slice(-2)).toEqual(["2", "1"]);
  });

  it("esconde a coluna Em curso sem hr.pessoas.vinculos.view", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    montar();

    expect(screen.queryByText("hr.estadoContrato.em_curso")).not.toBeInTheDocument();
  });

  it("so mostra criar e editar com hr.pessoas.laborais.edit", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    const { unmount } = montar();
    expect(screen.queryByText("hr.cargos.novoCargo")).not.toBeInTheDocument();
    expect(screen.queryAllByTitle("hr.cargos.editarCargo")).toHaveLength(0);
    unmount();

    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.laborais.edit"]);
    montar();
    expect(screen.getByText("hr.cargos.novoCargo")).toBeInTheDocument();
    expect(screen.getAllByTitle("hr.cargos.editarCargo").length).toBeGreaterThan(0);
  });

  it("sem hr.pessoas.laborais.view nao mostra a lista", () => {
    permissoes.activas = new Set();
    montar();
    expect(screen.queryByText("Comercial")).not.toBeInTheDocument();
  });

  it("cargos inactivos so aparecem a pedido", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    montar();
    expect(screen.queryByText("Antigo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("hr.cargos.mostrarInactivos"));
    expect(screen.getByText("Antigo")).toBeInTheDocument();
  });
});

describe("CargosGestao: o salario em vigor", () => {
  it("sem hr.pessoas.retribuicao.view mostra o cargo sem valores", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    montar();
    const comercial = linhaDe("Comercial");
    expect(within(comercial).queryByText(/1000/)).not.toBeInTheDocument();
    expect(within(comercial).queryByText(/hr\.cargos\.sobeEm/)).not.toBeInTheDocument();
  });

  it("a coluna do salario mostra o valor em vigor hoje e a subida agendada", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.retribuicao.view"]);
    montar();

    const comercial = linhaDe("Comercial");
    expect(within(comercial).getByText(/1000/)).toBeInTheDocument();
    const sobe = within(comercial).getByText(/hr\.cargos\.sobeEm/);
    expect(sobe.textContent).toContain("1200");
    expect(sobe.textContent).toContain("2099-01-01");
  });

  it("a linha expande para mostrar os periodos: vigente e agendado", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.retribuicao.view"]);
    montar();

    fireEvent.click(within(linhaDe("Comercial")).getByTitle("hr.cargos.periodos.titulo"));

    expect(screen.getByText("hr.cargos.periodos.vigente")).toBeInTheDocument();
    expect(screen.getByText("hr.cargos.periodos.agendado")).toBeInTheDocument();
  });
});

describe("CargosGestao: editar o cargo ja nao toca no salario", () => {
  const PERMISSOES_EDITAR = ["hr.pessoas.laborais.view", "hr.pessoas.laborais.edit"];

  it("o dialogo de edicao mostra o salario em leitura e so deixa mudar nome e horas", async () => {
    permissoes.activas = new Set([...PERMISSOES_EDITAR, "hr.pessoas.retribuicao.view"]);
    montar();

    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.editarCargo"));
    const dialogo = await screen.findByRole("dialog");

    expect(within(dialogo).queryByLabelText("hr.cargos.salarioBase")).not.toBeInTheDocument();
    expect(within(dialogo).queryByLabelText("hr.contrato.periodicidade")).not.toBeInTheDocument();
    expect(within(dialogo).getByText(/hr\.cargos\.salarioSoLeitura/)).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("hr.cargos.coluna.cargo")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("hr.cargos.horasReferencia")).toBeInTheDocument();
  });

  it("guardar envia so id, nome e horas -- sem salario nem periodicidade", async () => {
    permissoes.activas = new Set(PERMISSOES_EDITAR);
    montar();

    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.editarCargo"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.horasReferencia"), {
      target: { value: "40" },
    });
    fireEvent.click(within(dialogo).getByText("common.save"));

    await waitFor(() => expect(hooks.editar).toHaveBeenCalledTimes(1));
    const arg = hooks.editar.mock.calls[0][0];
    expect(arg).toEqual({ id: "c2", nome: "Gestor", horas_referencia: 40 });
  });

  it("criar sem hr.cargos.salario.alterar nao mostra o salario: cria com 0 (a base recusa outro, 42501)", async () => {
    permissoes.activas = new Set(PERMISSOES_EDITAR);
    montar();
    fireEvent.click(screen.getByText("hr.cargos.novoCargo"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).queryByLabelText("hr.cargos.salarioBase")).not.toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.coluna.cargo"), {
      target: { value: "Novo" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "hr.cargos.novoCargo" }));
    await waitFor(() => expect(hooks.criar).toHaveBeenCalledTimes(1));
    expect(hooks.criar.mock.calls[0][0]).toMatchObject({ nome: "Novo", salario_base: 0 });
  });

  it("criar com hr.cargos.salario.alterar continua com salario e periodicidade", async () => {
    permissoes.activas = new Set([...PERMISSOES_EDITAR, "hr.cargos.salario.alterar"]);
    montar();

    fireEvent.click(screen.getByText("hr.cargos.novoCargo"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByLabelText("hr.cargos.salarioBase")).toBeInTheDocument();
    expect(within(dialogo).getByLabelText("hr.contrato.periodicidade")).toBeInTheDocument();
  });
});

describe("CargosGestao: Alterar salario", () => {
  const PERMISSOES_SALARIO = [
    "hr.pessoas.laborais.view",
    "hr.pessoas.laborais.edit",
    "hr.cargos.salario.alterar",
    "hr.pessoas.retribuicao.view",
  ];

  it("o botao so existe com hr.cargos.salario.alterar", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.laborais.edit"]);
    const { unmount } = montar();
    expect(screen.queryAllByTitle("hr.cargos.alterarSalario")).toHaveLength(0);
    unmount();

    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();
    expect(screen.getAllByTitle("hr.cargos.alterarSalario").length).toBeGreaterThan(0);
  });

  it("avisa quantas pessoas afecta e de quanto para quanto", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();

    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.salarioBase"), {
      target: { value: "2200" },
    });

    // O Gestor tem 1 pessoa; o Comercial tem 2.
    // A lista recebida pode estar filtrada: o numero e um minimo, nao um total exacto.
    expect(within(dialogo).getByText(/hr\.cargos\.avisoPessoasAfectadasMinimo/).textContent).toContain('"n":1');
    const dePara = within(dialogo).getByText(/hr\.cargos\.avisoDeParaSalario/);
    expect(dePara.textContent).toContain("2000");
    expect(dePara.textContent).toContain("2200");
  });

  it("o aviso conta as pessoas do cargo certo", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();

    fireEvent.click(within(linhaDe("Comercial")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/hr\.cargos\.avisoPessoasAfectadasMinimo/).textContent).toContain('"n":2');
  });

  it("a data nao pode ser anterior a hoje", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();

    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    const data = within(dialogo).getByLabelText("hr.cargos.dataInicio") as HTMLInputElement;
    // "Hoje" e o da base (current_date, UTC), nao o do relogio local: entre as
    // 00:00 e a 01:00 de Lisboa no verao os dois dias diferem.
    expect(data.min).toBe(dataDeHojeBase());
  });

  it("o motivo e obrigatorio (3 caracteres ou mais): sem ele nao chama a RPC", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();

    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.salarioBase"), {
      target: { value: "2200" },
    });
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.motivo"), { target: { value: "ab" } });

    const confirmar = within(dialogo).getByRole("button", { name: "hr.cargos.alterarSalario" });
    expect(confirmar).toBeDisabled();
    expect(hooks.definirSalario).not.toHaveBeenCalled();
  });

  it("confirmar chama definirSalario e mostra quantas pessoas foram actualizadas", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();

    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.salarioBase"), {
      target: { value: "2200" },
    });
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.motivo"), {
      target: { value: "Revisao anual" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "hr.cargos.alterarSalario" }));

    await waitFor(() => expect(hooks.definirSalario).toHaveBeenCalledTimes(1));
    const [cargoId, salario, periodicidade, data, motivo] = hooks.definirSalario.mock.calls[0];
    expect([cargoId, salario, periodicidade, motivo]).toEqual(["c2", 2200, "mensal", "Revisao anual"]);
    expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining("hr.cargos.alterarSalarioSucesso")),
    );
    expect(toastSuccess.mock.calls[0][0]).toContain('"n":2');
  });

  it("um erro da base (HRC06) volta traduzido e nao fecha o dialogo", async () => {
    hooks.definirSalario.mockRejectedValue({
      code: "HRC06",
      message: "alteracao_posterior_existe: Ana e mais 1",
    });
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();

    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.salarioBase"), {
      target: { value: "2200" },
    });
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.motivo"), {
      target: { value: "Revisao anual" },
    });
    fireEvent.click(within(dialogo).getByRole("button", { name: "hr.cargos.alterarSalario" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).not.toContain("HRC06");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("se a data e a de uma subida ja agendada, avisa que a corrige", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();

    fireEvent.click(within(linhaDe("Comercial")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.dataInicio"), {
      target: { value: "2099-01-01" },
    });

    const aviso = within(dialogo).getByText(/hr\.cargos\.avisoCorrigeAgendada/);
    expect(aviso.textContent).toContain("2099-01-01");
  });
});

describe("CargosGestao: achados da revisao React (fluxo 2)", () => {
  const PERMISSOES_EDITAR = ["hr.pessoas.laborais.view", "hr.pessoas.laborais.edit"];
  const PERMISSOES_SALARIO = [
    "hr.pessoas.laborais.view",
    "hr.pessoas.laborais.edit",
    "hr.cargos.salario.alterar",
    "hr.pessoas.retribuicao.view",
  ];

  it("um cargo com salario 0 (criado sem hr.cargos.salario.alterar) mostra 'salario por definir', nao 0", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.retribuicao.view"]);
    montar();
    const linha = linhaDe("Provisorio");
    expect(within(linha).getByText("hr.cargos.salarioPorDefinir")).toBeInTheDocument();
    expect(within(linha).queryByText(/^0 /)).not.toBeInTheDocument();
  });

  it("criar sem hr.cargos.salario.alterar avisa no formulario que o salario fica por definir", async () => {
    permissoes.activas = new Set(PERMISSOES_EDITAR);
    montar();
    fireEvent.click(screen.getByText("hr.cargos.novoCargo"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("hr.cargos.avisoSalarioPorDefinir")).toBeInTheDocument();
  });

  it("criar com hr.cargos.salario.alterar nao mostra esse aviso", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();
    fireEvent.click(screen.getByText("hr.cargos.novoCargo"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).queryByText("hr.cargos.avisoSalarioPorDefinir")).not.toBeInTheDocument();
  });

  it("um erro ao criar passa por mensagemDeErroCargo (codigo da base traduzido, nunca em bruto)", async () => {
    const erro = { code: "HRC03", message: "cargo_dados_invalidos: nome repetido" };
    hooks.criar.mockRejectedValue(erro);
    permissoes.activas = new Set(PERMISSOES_EDITAR);
    montar();
    fireEvent.click(screen.getByText("hr.cargos.novoCargo"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.coluna.cargo"), { target: { value: "Novo" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "hr.cargos.novoCargo" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(erros.mensagem).toHaveBeenCalledWith(erro, expect.any(String));
    expect(String(toastError.mock.calls[0][0])).not.toContain("HRC03");
  });

  it("um erro ao editar passa por mensagemDeErroCargo", async () => {
    const erro = { code: "HRC02", message: "cargo_nao_encontrado: x" };
    hooks.editar.mockRejectedValue(erro);
    permissoes.activas = new Set(PERMISSOES_EDITAR);
    montar();
    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.editarCargo"));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByText("common.save"));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(erros.mensagem).toHaveBeenCalledWith(erro, expect.any(String));
  });

  it("os botoes de icone tem nome acessivel", () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();
    const linha = linhaDe("Gestor");
    expect(within(linha).getByRole("button", { name: "hr.cargos.alterarSalario" })).toBeInTheDocument();
    expect(within(linha).getByRole("button", { name: "hr.cargos.editarCargo" })).toBeInTheDocument();
    expect(within(linha).getByRole("button", { name: "hr.cargos.desactivar" })).toBeInTheDocument();
    expect(within(linha).getByRole("button", { name: "hr.cargos.periodos.titulo" })).toBeInTheDocument();
  });

  it("o botao de expandir aponta (aria-controls) para a linha que abre", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.retribuicao.view"]);
    montar();
    const botao = within(linhaDe("Comercial")).getByRole("button", { name: "hr.cargos.periodos.titulo" });
    fireEvent.click(botao);
    const alvo = botao.getAttribute("aria-controls");
    expect(alvo).toBeTruthy();
    expect(document.getElementById(alvo as string)).not.toBeNull();
  });

  it("as tabelas tem legenda", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    montar();
    expect(screen.getByRole("table", { name: "hr.cargos.tituloPagina" })).toBeInTheDocument();
  });

  it("o dialogo de salario pre-preenche com o periodo MAIS RECENTE (o que a base compara), nao o vigente", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();
    fireEvent.click(within(linhaDe("Comercial")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    // Vigente: 1000; agendado (o mais recente): 1200.
    expect((within(dialogo).getByLabelText("hr.cargos.salarioBase") as HTMLInputElement).value).toBe("1200");
  });

  it("Confirmar desactivado diz porque: falta o motivo e, sem valor, falta o valor", async () => {
    permissoes.activas = new Set(PERMISSOES_SALARIO);
    montar();
    fireEvent.click(within(linhaDe("Gestor")).getByTitle("hr.cargos.alterarSalario"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("hr.cargos.alterarSalarioFaltaMotivo")).toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("hr.cargos.salarioBase"), { target: { value: "" } });
    expect(within(dialogo).getByText("hr.cargos.alterarSalarioFaltaValor")).toBeInTheDocument();
  });
});

describe("CargosGestao: fichas sem cargo e divergencias do periodo", () => {
  it("o cartao 'Fichas sem cargo' lista as fichas com ligacao para Laborais", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    montar();

    expect(screen.getByText(/hr\.cargos\.semCargoTitulo/).textContent).toContain('"n":2');
    const ligacao = screen.getByRole("link", { name: /Pessoa 4/ });
    expect(ligacao).toHaveAttribute("href", "/rh/pessoas/4?tab=laborais");
    expect(screen.getByRole("link", { name: /Pessoa 5/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Pessoa 1$/ })).not.toBeInTheDocument();
  });

  it("sem fichas sem cargo o cartao nao aparece", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    render(
      <MemoryRouter>
        <CargosGestao pessoas={[pessoa("1", "c1", "em_curso")]} loading={false} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/hr\.cargos\.semCargoTitulo/)).not.toBeInTheDocument();
  });

  it("divergencias do periodo: estado vazio diz que nao ha", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.retribuicao.view"]);
    montar();
    expect(screen.getByText("hr.cargos.divergenciasPeriodoZero")).toBeInTheDocument();
  });

  it("sem hr.pessoas.retribuicao.view o cartao nao aparece (um zero por falta de permissao seria falso)", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    montar();
    expect(screen.queryByText("hr.cargos.divergenciasPeriodoZero")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.cargos.divergenciasPeriodoTitulo")).not.toBeInTheDocument();
  });

  it("divergencias do periodo: mostra pessoa, cargo, valor actual e esperado", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.retribuicao.view"]);
    hooks.divergenciasPeriodo = [
      {
        pessoa_id: "1",
        pessoa_nome: "Ana Alves",
        cargo_id: "c1",
        cargo_nome: "Comercial",
        retribuicao_id: "r1",
        valor_base: 900,
        periodicidade: "mensal",
        valido_de: "2026-01-01",
        esperado_valor_base: 1000,
        esperado_periodicidade: "mensal",
      },
    ];
    montar();

    expect(screen.queryByText("hr.cargos.divergenciasPeriodoZero")).not.toBeInTheDocument();
    const linha = screen.getByText("Ana Alves").closest("tr") as HTMLElement;
    expect(within(linha).getByText(/900/)).toBeInTheDocument();
    expect(within(linha).getByText(/1000/)).toBeInTheDocument();
  });
});
