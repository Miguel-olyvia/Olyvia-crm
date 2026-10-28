/**
 * Cargos de /rh-exemplo › cargo técnico de obra (migration 20261231998000): a coluna "Técnico de obra / Ofícios", o interruptor no
 * diálogo de criar/editar, as caixas dos ofícios só com ele ligado, e a gravação da marca e dos ofícios (rh_guardar_cargo_tecnico,
 * pelo hook) depois de criar ou editar o cargo, só quando mudou.
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
  { id: "c1", organization_id: "o", nome: "Ladrilhador", horas_referencia: 40, activo: true, tecnico_obra: true, created_at: "", updated_at: "" },
  { id: "c2", organization_id: "o", nome: "Administrativo", horas_referencia: 40, activo: true, tecnico_obra: false, created_at: "", updated_at: "" },
];

const hooks = vi.hoisted(() => ({ criar: vi.fn(), editar: vi.fn(), definirTecnico: vi.fn() }));
vi.mock("@/components/rh-exemplo/hooks/useCargos", () => ({
  useCargos: () => ({
    cargos: CARGOS,
    periodos: [],
    oficios: [{ cargo_id: "c1", skill_id: "s-lad" }],
    salarioDoCargoEm: () => null,
    isLoading: false,
    isSaving: false,
    criar: hooks.criar,
    editar: hooks.editar,
    definirTecnico: hooks.definirTecnico,
    definirSalario: vi.fn(),
    definirActivo: vi.fn(),
  }),
}));
vi.mock("@/components/rh-exemplo/hooks/useOficiosObra", () => ({
  useOficiosObra: () => ({
    oficios: [
      { id: "s-can", nome: "Canalizador", ativo: true },
      { id: "s-lad", nome: "Ladrilho", ativo: true },
      { id: "s-old", nome: "Antigo", ativo: false },
    ],
    semAcesso: false,
    isLoading: false,
  }),
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
const interruptor = () => within(dialogo()).getByRole("switch", { name: /hr\.cargos\.tecnico\.marca/ });

beforeEach(() => {
  vi.clearAllMocks();
  permissoes.activas = new Set(["hr.pessoas.laborais.view", "hr.pessoas.laborais.edit"]);
  hooks.criar.mockResolvedValue("c-novo");
  hooks.editar.mockResolvedValue(undefined);
  hooks.definirTecnico.mockResolvedValue(undefined);
});

describe("CargosGestao (rh-exemplo): cargo técnico de obra", () => {
  it("a coluna mostra a marca e os ofícios do cargo técnico; os outros ficam com —", () => {
    montar();
    expect(screen.getByRole("columnheader", { name: "hr.cargos.tecnico.coluna" })).toBeInTheDocument();
    const tecnico = screen.getByText("Ladrilhador").closest("tr")!;
    expect(within(tecnico).getByText("hr.cargos.tecnico.marca")).toBeInTheDocument();
    expect(within(tecnico).getByText("Ladrilho")).toBeInTheDocument();
    const outro = screen.getByText("Administrativo").closest("tr")!;
    expect(within(outro).queryByText("hr.cargos.tecnico.marca")).toBeNull();
    // a 3.ª coluna (Cargo, Salário, Técnico de obra / Ofícios)
    expect(within(outro).getAllByRole("cell")[2]).toHaveTextContent(/^—$/);
  });

  it("novo cargo: as caixas dos ofícios só aparecem com o interruptor; grava a marca e os ofícios depois de criar", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /hr\.cargos\.novoCargo/ }));
    fireEvent.change(within(dialogo()).getByLabelText("hr.cargos.coluna.cargo"), { target: { value: "Canalizador" } });
    expect(within(dialogo()).queryByRole("checkbox", { name: "Canalizador" })).toBeNull();
    fireEvent.click(interruptor());
    // os ofícios ativos (o desativado não aparece num cargo que não o tem)
    expect(within(dialogo()).getByRole("checkbox", { name: "Ladrilho" })).toBeInTheDocument();
    expect(within(dialogo()).queryByRole("checkbox", { name: "Antigo" })).toBeNull();
    fireEvent.click(within(dialogo()).getByRole("checkbox", { name: "Canalizador" }));
    fireEvent.click(within(dialogo()).getByRole("button", { name: "hr.cargos.novoCargo" }));
    await waitFor(() => expect(hooks.definirTecnico).toHaveBeenCalledWith("c-novo", true, ["s-can"]));
    expect(hooks.criar).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("hr.cargos.criarSucesso");
  });

  it("novo cargo sem a marca: não chama a gravação da marca", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /hr\.cargos\.novoCargo/ }));
    fireEvent.change(within(dialogo()).getByLabelText("hr.cargos.coluna.cargo"), { target: { value: "Rececionista" } });
    fireEvent.click(within(dialogo()).getByRole("button", { name: "hr.cargos.novoCargo" }));
    await waitFor(() => expect(hooks.criar).toHaveBeenCalled());
    expect(hooks.definirTecnico).not.toHaveBeenCalled();
  });

  it("editar um cargo técnico: vem ligado com os ofícios dele; tirar a marca grava sem ofícios", async () => {
    montar();
    const linha = screen.getByText("Ladrilhador").closest("tr")!;
    fireEvent.click(within(linha).getByRole("button", { name: "hr.cargos.editarCargo" }));
    expect(interruptor()).toHaveAttribute("data-state", "checked");
    expect(within(dialogo()).getByRole("checkbox", { name: "Ladrilho" })).toHaveAttribute("data-state", "checked");
    expect(within(dialogo()).getByRole("checkbox", { name: "Canalizador" })).toHaveAttribute("data-state", "unchecked");
    fireEvent.click(interruptor());
    expect(within(dialogo()).queryByRole("checkbox", { name: "Ladrilho" })).toBeNull();
    fireEvent.click(within(dialogo()).getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(hooks.definirTecnico).toHaveBeenCalledWith("c1", false, []));
    expect(hooks.editar).toHaveBeenCalledWith({ id: "c1", nome: "Ladrilhador", horas_referencia: 40 });
  });

  it("editar sem mexer na marca nem nos ofícios não chama a gravação da marca", async () => {
    montar();
    const linha = screen.getByText("Ladrilhador").closest("tr")!;
    fireEvent.click(within(linha).getByRole("button", { name: "hr.cargos.editarCargo" }));
    fireEvent.click(within(dialogo()).getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(hooks.editar).toHaveBeenCalled());
    expect(hooks.definirTecnico).not.toHaveBeenCalled();
  });

  it("se a marca falhar, avisa que o cargo ficou gravado sem ela", async () => {
    hooks.definirTecnico.mockRejectedValue({ code: "CT002", message: "Só um cargo técnico de obra tem ofícios." });
    montar();
    const linha = screen.getByText("Administrativo").closest("tr")!;
    fireEvent.click(within(linha).getByRole("button", { name: "hr.cargos.editarCargo" }));
    fireEvent.click(interruptor());
    fireEvent.click(within(dialogo()).getByRole("button", { name: "common.save" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("hr.cargos.tecnico.erroGravar Só um cargo técnico de obra tem ofícios."),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
