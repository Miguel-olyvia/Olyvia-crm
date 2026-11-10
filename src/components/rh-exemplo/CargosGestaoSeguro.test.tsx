/**
 * Cargos de /rh-exemplo › seguro de acidentes de trabalho por cargo: a coluna da lista, o campo do dialogo (leitura,
 * vazio, virgula/ponto, 0 a 100 com 2 decimais), a gravacao por `definirSeguroDoCargo` DEPOIS de gravar o cargo, e a falha
 * do seguro com o cargo ja gravado (diz-o e deixa tentar de novo sem duplicar o cargo). Supabase simulado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, params?: Record<string, string | number>) => (params ? `${chave} ${JSON.stringify(params)}` : chave),
    language: "pt",
  }),
}));

const permissoes = vi.hoisted(() => ({ activas: new Set<string>() }));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.activas.has(p), loading: false }),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError, success: toastSuccess } }));

const CARGOS = [
  { id: "c1", organization_id: "o", nome: "Ladrilhador", horas_referencia: 40, activo: true, tecnico_obra: false, seguro_acidentes_pct: 1.5, created_at: "", updated_at: "" },
  { id: "c2", organization_id: "o", nome: "Administrativo", horas_referencia: 40, activo: true, tecnico_obra: false, seguro_acidentes_pct: null, created_at: "", updated_at: "" },
  { id: "c3", organization_id: "o", nome: "Estagiario", horas_referencia: 40, activo: true, tecnico_obra: false, seguro_acidentes_pct: 0, created_at: "", updated_at: "" },
  { id: "c4", organization_id: "o", nome: "Antigo sem coluna", horas_referencia: 40, activo: true, created_at: "", updated_at: "" },
];

const hooks = vi.hoisted(() => ({
  criar: vi.fn(),
  editar: vi.fn(),
  definirTecnico: vi.fn(),
  definirSeguroDoCargo: vi.fn(),
}));
vi.mock("@/components/rh-exemplo/hooks/useCargos", () => ({
  useCargos: () => ({
    cargos: CARGOS,
    periodos: [],
    oficios: [],
    salarioDoCargoEm: () => null,
    isLoading: false,
    isSaving: false,
    criar: hooks.criar,
    editar: hooks.editar,
    definirTecnico: hooks.definirTecnico,
    definirSeguroDoCargo: hooks.definirSeguroDoCargo,
    definirSalario: vi.fn(),
    definirActivo: vi.fn(),
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/useOficiosObra", () => ({
  useOficiosObra: () => ({ oficios: [], semAcesso: false, isLoading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/useCargosSalariosDivergentes", () => ({
  useCargosSalariosDivergentes: () => ({ divergencias: [], isLoading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/useCargosRetribuicoesDivergentes", () => ({
  useCargosRetribuicoesDivergentes: () => ({ divergencias: [], isLoading: false }),
}));

import { CargosGestao } from "@/components/rh-exemplo/CargosGestao";

function montar() {
  return render(
    <MemoryRouter>
      <CargosGestao pessoas={[]} loading={false} />
    </MemoryRouter>,
  );
}

const dialogo = () => screen.getByRole("dialog");
const campo = () => within(dialogo()).getByLabelText("hr.cargos.seguro.rotulo") as HTMLInputElement;
const guardar = () => within(dialogo()).getByRole("button", { name: "common.save" });

function abrirEdicao(nome: string) {
  const linha = screen.getByText(nome).closest("tr")!;
  fireEvent.click(within(linha).getByRole("button", { name: "hr.cargos.editarCargo" }));
}

function abrirNovo(nome: string) {
  fireEvent.click(screen.getByRole("button", { name: /hr\.cargos\.novoCargo/ }));
  fireEvent.change(within(dialogo()).getByLabelText("hr.cargos.coluna.cargo"), { target: { value: nome } });
}

beforeEach(() => {
  vi.clearAllMocks();
  permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.laborais.edit"]);
  hooks.criar.mockResolvedValue("c-novo");
  hooks.editar.mockResolvedValue(undefined);
  hooks.definirTecnico.mockResolvedValue(undefined);
  hooks.definirSeguroDoCargo.mockResolvedValue({ cargo_id: "x", seguro_acidentes_pct: null });
});

describe("CargosGestao (rh-exemplo): seguro de acidentes de trabalho", () => {
  it("a lista mostra o seguro de cada cargo; vazio e ausente dizem 'Sem seguro' e 0 e um valor", () => {
    montar();
    expect(screen.getByRole("columnheader", { name: "hr.cargos.seguro.coluna" })).toBeInTheDocument();
    const texto = (nome: string) => screen.getByText(nome).closest("tr")!.textContent ?? "";
    expect(texto("Ladrilhador")).toContain('hr.cargos.seguro.valor {"valor":"1,5"}');
    expect(texto("Administrativo")).toContain("hr.cargos.seguro.semSeguro");
    expect(texto("Estagiario")).toContain('hr.cargos.seguro.valor {"valor":"0"}');
    expect(texto("Estagiario")).not.toContain("hr.cargos.seguro.semSeguro");
    expect(texto("Antigo sem coluna")).toContain("hr.cargos.seguro.semSeguro");
  });

  it("sem hr.pessoas.laborais.edit a lista mostra o valor mas nao ha forma de o editar", () => {
    permissoes.activas = new Set(["hr.pessoas.laborais.view"]);
    montar();
    expect(screen.getByText("Ladrilhador").closest("tr")!.textContent).toContain('"valor":"1,5"');
    expect(screen.queryByRole("button", { name: "hr.cargos.editarCargo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /hr\.cargos\.novoCargo/ })).toBeNull();
    expect(hooks.definirSeguroDoCargo).not.toHaveBeenCalled();
  });

  it("o dialogo abre com o valor do cargo (virgula) ou vazio, com a explicacao e alvo de 44 px", () => {
    montar();
    abrirEdicao("Ladrilhador");
    expect(campo().value).toBe("1,5");
    expect(campo()).toHaveClass("h-11");
    expect(campo()).toHaveAttribute("aria-invalid", "false");
    expect(within(dialogo()).getByText("hr.cargos.seguro.ajuda")).toBeInTheDocument();
    expect(campo().getAttribute("aria-describedby")).toContain(
      within(dialogo()).getByText("hr.cargos.seguro.ajuda").id,
    );
    fireEvent.click(within(dialogo()).getByRole("button", { name: "common.cancel" }));
    abrirEdicao("Administrativo");
    expect(campo().value).toBe("");
  });

  it("grava um valor com virgula: guarda o cargo e depois chama o seguro com o numero", async () => {
    montar();
    abrirEdicao("Administrativo");
    fireEvent.change(campo(), { target: { value: "2,5" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(hooks.definirSeguroDoCargo).toHaveBeenCalledWith("c2", 2.5));
    expect(hooks.editar).toHaveBeenCalledWith({ id: "c2", nome: "Administrativo", horas_referencia: 40 });
    expect(hooks.editar.mock.invocationCallOrder[0]).toBeLessThan(hooks.definirSeguroDoCargo.mock.invocationCallOrder[0]);
    expect(toastSuccess).toHaveBeenCalledWith("hr.cargos.actualizarSucesso");
  });

  it("aceita ponto e os extremos 0 e 100", async () => {
    montar();
    abrirEdicao("Administrativo");
    fireEvent.change(campo(), { target: { value: "0" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(hooks.definirSeguroDoCargo).toHaveBeenCalledWith("c2", 0));
    abrirEdicao("Administrativo");
    fireEvent.change(campo(), { target: { value: "100.00" } });
    fireEvent.click(guardar());
    await waitFor(() => expect(hooks.definirSeguroDoCargo).toHaveBeenCalledWith("c2", 100));
  });

  it("esvaziar o campo limpa o seguro (null)", async () => {
    montar();
    abrirEdicao("Ladrilhador");
    fireEvent.change(campo(), { target: { value: "  " } });
    fireEvent.click(guardar());
    await waitFor(() => expect(hooks.definirSeguroDoCargo).toHaveBeenCalledWith("c1", null));
  });

  it("sem mexer no seguro nao chama a RPC do seguro", async () => {
    montar();
    abrirEdicao("Ladrilhador");
    fireEvent.click(guardar());
    await waitFor(() => expect(hooks.editar).toHaveBeenCalled());
    expect(hooks.definirSeguroDoCargo).not.toHaveBeenCalled();
    // um cargo sem seguro que continua sem seguro (vazio) tambem nao chama
    abrirEdicao("Administrativo");
    fireEvent.click(guardar());
    await waitFor(() => expect(hooks.editar).toHaveBeenCalledTimes(2));
    expect(hooks.definirSeguroDoCargo).not.toHaveBeenCalled();
  });

  it.each(["abc", "-1", "100,01", "101", "1,234", "1,2,3"])(
    "valor invalido %j: erro anunciado, campo invalido, nao grava nada",
    (invalido) => {
      montar();
      abrirEdicao("Ladrilhador");
      fireEvent.change(campo(), { target: { value: invalido } });
      const erro = within(dialogo()).getByRole("alert");
      expect(erro).toHaveTextContent("hr.cargos.seguro.invalido");
      expect(campo()).toHaveAttribute("aria-invalid", "true");
      expect(campo().getAttribute("aria-describedby")).toContain(erro.id);
      expect(guardar()).toBeDisabled();
      fireEvent.click(guardar());
      expect(hooks.editar).not.toHaveBeenCalled();
      expect(hooks.definirSeguroDoCargo).not.toHaveBeenCalled();
    },
  );

  it("o erro some quando o valor passa a valido", () => {
    montar();
    abrirEdicao("Ladrilhador");
    fireEvent.change(campo(), { target: { value: "abc" } });
    expect(within(dialogo()).getByRole("alert")).toBeInTheDocument();
    fireEvent.change(campo(), { target: { value: "3" } });
    expect(within(dialogo()).queryByRole("alert")).toBeNull();
    expect(guardar()).toBeEnabled();
  });

  it("cargo novo: cria o cargo e so depois grava o seguro no id novo", async () => {
    montar();
    abrirNovo("Pedreiro");
    fireEvent.change(campo(), { target: { value: "4" } });
    fireEvent.click(within(dialogo()).getByRole("button", { name: "hr.cargos.novoCargo" }));
    await waitFor(() => expect(hooks.definirSeguroDoCargo).toHaveBeenCalledWith("c-novo", 4));
    expect(hooks.criar.mock.invocationCallOrder[0]).toBeLessThan(hooks.definirSeguroDoCargo.mock.invocationCallOrder[0]);
    expect(toastSuccess).toHaveBeenCalledWith("hr.cargos.criarSucesso");
  });

  it("cargo novo sem seguro (campo vazio) nao chama o seguro", async () => {
    montar();
    abrirNovo("Pedreiro");
    expect(campo().value).toBe("");
    fireEvent.click(within(dialogo()).getByRole("button", { name: "hr.cargos.novoCargo" }));
    await waitFor(() => expect(hooks.criar).toHaveBeenCalled());
    expect(hooks.definirSeguroDoCargo).not.toHaveBeenCalled();
  });

  it("se o seguro falhar depois de o cargo gravar: diz-o, mantem o dialogo e a nova tentativa nao duplica o cargo", async () => {
    hooks.definirSeguroDoCargo.mockRejectedValueOnce({ code: "42501", message: "permission denied" });
    montar();
    abrirNovo("Pedreiro");
    fireEvent.change(campo(), { target: { value: "4" } });
    fireEvent.click(within(dialogo()).getByRole("button", { name: "hr.cargos.novoCargo" }));

    const aviso = 'hr.cargos.seguro.erroGravar {"motivo":"hr.cargos.seguro.erro.semPermissao"}';
    await waitFor(() => expect(within(dialogo()).getByRole("alert")).toHaveTextContent(aviso));
    expect(toastError).toHaveBeenCalledWith(aviso);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(hooks.criar).toHaveBeenCalledTimes(1);
    // o dialogo continua aberto, com o valor escrito, agora a editar o cargo ja criado
    expect(campo().value).toBe("4");

    fireEvent.click(guardar());
    await waitFor(() => expect(hooks.definirSeguroDoCargo).toHaveBeenCalledTimes(2));
    expect(hooks.definirSeguroDoCargo).toHaveBeenLastCalledWith("c-novo", 4);
    expect(hooks.criar).toHaveBeenCalledTimes(1);
    expect(hooks.editar).toHaveBeenCalledWith(expect.objectContaining({ id: "c-novo" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("falha do seguro ao editar: aviso em texto (erro desconhecido cai no texto generico) e fica aberto", async () => {
    hooks.definirSeguroDoCargo.mockRejectedValueOnce({ code: "22003", message: "x" });
    montar();
    abrirEdicao("Administrativo");
    fireEvent.change(campo(), { target: { value: "5" } });
    fireEvent.click(guardar());
    await waitFor(() =>
      expect(within(dialogo()).getByRole("alert")).toHaveTextContent(
        'hr.cargos.seguro.erroGravar {"motivo":"hr.cargos.seguro.erro.invalida"}',
      ),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
