import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

// Radix Select precisa disto no jsdom
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

const toastError = vi.fn();
// 03/11: para quem se agenda segue o âmbito de scheduling.items.edit (era scheduling.items.manage, que não existe no catálogo).
const permissions = { ambito: "ORG" as "NONE" | "OWNED" | "TEAM" | "ORG", equipa: [] as string[] };

vi.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), info: vi.fn(), success: vi.fn() },
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    isSystemAdmin: false,
  }),
}));
vi.mock("@/hooks/usePermissionScope", () => ({
  usePermissionScope: () => ({
    getPermissionScope: (p: string) => (p === "scheduling.items.edit" ? permissions.ambito : "ORG"),
    teamMemberIds: permissions.equipa,
  }),
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ userType: "company_admin" }) }));
vi.mock("@/hooks/useScheduleInvitations", () => ({
  useScheduleInvitations: () => ({ sendInvitations: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: "approver" } } }) } },
}));

import { ScheduleItemDialog } from "../ScheduleItemDialog";

const boards = [
  { id: "b1", name: "Ferias", color: "#000", board_type: "time_off" },
] as never;
const users = [
  { id: "u1", name: "Ana" },
  { id: "u2", name: "Rui" },
];

const baseItem = {
  id: "i1",
  board_id: "b1",
  title: "Ferias",
  start_datetime: new Date(2026, 9, 20, 9, 0).toISOString(),
  end_datetime: new Date(2026, 9, 21, 9, 0).toISOString(),
  time_off_type: "vacation",
  user_id: null,
};

function setup(props: Record<string, unknown>) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  // O diálogo usa useNavigate (ligação para as ausências do RH): precisa de um router.
  render(
    <MemoryRouter>
    <ScheduleItemDialog
      open
      onOpenChange={vi.fn()}
      boards={boards}
      resources={[]}
      contacts={[]}
      companyUsers={users}
      onSave={onSave}
      {...props}
    />
    </MemoryRouter>,
  );
  return onSave;
}

describe("ScheduleItemDialog - Colaborador obrigatorio em quadros de ferias", () => {
  beforeEach(() => {
    toastError.mockClear();
    permissions.ambito = "ORG";
    permissions.equipa = [];
  });

  it("sem colaborador nao grava, mostra o erro e marca o campo", async () => {
    const onSave = setup({ item: baseItem });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("scheduling.timeOff.employeeRequired"));
    expect(onSave).not.toHaveBeenCalled();
    const trigger = screen.getByText("scheduling.timeOff.selectEmployee").closest("button")!;
    expect(trigger).toHaveAttribute("aria-required", "true");
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("scheduling.timeOff.employeeRequired");
  });

  it("com colaborador grava com o user_id", async () => {
    const onSave = setup({ item: { ...baseItem, user_id: "u2" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ user_id: "u2" });
    expect(toastError).not.toHaveBeenCalled();
  });

  // Um item NOVO num quadro de férias já não se cria aqui: o diálogo manda para o pedido de ausência do RH (ausenciaPassaPorPedido).
  it("novo item num quadro de ferias leva ao pedido de ausencia do RH, sem botao de criar", () => {
    permissions.ambito = "OWNED";
    const onSave = setup({ currentUserId: "u1", defaultTitle: "Ferias" });
    expect(screen.queryByRole("button", { name: "common.create" })).toBeNull();
    expect(screen.getByRole("button", { name: "hr.ausencias.board.irParaAusencias" })).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("self-only a editar item de ferias sem user_id grava com o seu id", async () => {
    permissions.ambito = "OWNED";
    const onSave = setup({ item: baseItem, currentUserId: "u1" });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ user_id: "u1" });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("self-only nao sobrescreve um user_id ja existente", async () => {
    permissions.ambito = "OWNED";
    const onSave = setup({ item: { ...baseItem, user_id: "u2" }, currentUserId: "u1" });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ user_id: "u2" });
  });

  it("o foco vai para o select e o erro fica ligado ao controlo", async () => {
    setup({ item: baseItem });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    const alert = await screen.findByRole("alert");
    const trigger = screen.getByRole("combobox", { name: /scheduling\.timeOff\.employee/ });
    expect(trigger).toHaveAttribute("aria-describedby", alert.id);
    expect(alert.id).not.toBe("");
    expect(trigger).toHaveFocus();
  });

  it("o erro desaparece ao escolher um colaborador", async () => {
    const onSave = setup({ item: baseItem });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await screen.findByRole("alert");

    const trigger = screen.getByRole("combobox", { name: /scheduling\.timeOff\.employee/ });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    const option = await screen.findByRole("option", { name: "Rui" });
    fireEvent.click(option);

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(trigger).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ user_id: "u2" });
  });

  it("quadro que nao e de ferias nao exige colaborador", async () => {
    const onSave = setup({
      boards: [{ id: "b2", name: "Reunioes", color: "#000", board_type: "standard" }],
      item: { ...baseItem, id: "i2", board_id: "b2", title: "Reuniao", time_off_type: null },
    });
    expect(screen.queryByText("scheduling.timeOff.selectEmployee")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
  });

  it.each([
    ["scheduling.timeOff.approve", "approved"],
    ["scheduling.timeOff.reject", "rejected"],
  ])("%s continua a funcionar sem passar pela validacao de colaborador", async (label, status) => {
    const onSave = setup({
      item: { ...baseItem, user_id: "u2", approval_status: "pending" },
      currentEmployeeId: "e0",
      employees: [{ id: "e2", first_name: "Rui", last_name: "X", reports_to: "e0", user_id: "u2" }],
    });
    fireEvent.click(screen.getByRole("button", { name: label }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "i1", approval_status: status });
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("ScheduleItemDialog - para quem se agenda segue o ambito de scheduling.items.edit (03/11)", () => {
  const users3 = [{ id: "u1", name: "Ana" }, { id: "u2", name: "Rui" }, { id: "u3", name: "Eva" }];
  const opcoes = async () => {
    const trigger = screen.getByRole("combobox", { name: /scheduling\.timeOff\.employee/ });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    await screen.findAllByRole("option");
    return screen.getAllByRole("option").map((o) => o.textContent);
  };
  beforeEach(() => { permissions.equipa = []; });

  it("organizacao: qualquer pessoa da lista", async () => {
    permissions.ambito = "ORG";
    setup({ item: baseItem, currentUserId: "u1", companyUsers: users3 });
    expect(await opcoes()).toEqual(["Ana", "Rui", "Eva"]);
  });

  it("equipa: a propria pessoa e a sua equipa", async () => {
    permissions.ambito = "TEAM";
    permissions.equipa = ["u3"];
    setup({ item: baseItem, currentUserId: "u1", companyUsers: users3 });
    expect(await opcoes()).toEqual(["Ana", "Eva"]);
  });

  it.each(["OWNED", "NONE"] as const)("%s: so a propria pessoa (o seletor fica fixo nela)", (ambito) => {
    permissions.ambito = ambito;
    setup({ item: baseItem, currentUserId: "u1", companyUsers: users3 });
    const trigger = screen.getByRole("combobox", { name: /scheduling\.timeOff\.employee/ });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent("Ana");
  });
});
