import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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
const permissions = { manage: true };

vi.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), info: vi.fn(), success: vi.fn() },
}));
vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => (p === "scheduling.items.manage" ? permissions.manage : true),
    isSystemAdmin: false,
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
  render(
    <ScheduleItemDialog
      open
      onOpenChange={vi.fn()}
      boards={boards}
      resources={[]}
      contacts={[]}
      companyUsers={users}
      onSave={onSave}
      {...props}
    />,
  );
  return onSave;
}

describe("ScheduleItemDialog - Colaborador obrigatorio em quadros de ferias", () => {
  beforeEach(() => {
    toastError.mockClear();
    permissions.manage = true;
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

  it("utilizador so-proprio (novo item) continua a gravar com o seu user_id", async () => {
    permissions.manage = false;
    const onSave = setup({ currentUserId: "u1", defaultTitle: "Ferias" });
    fireEvent.click(screen.getByRole("button", { name: "common.create" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ user_id: "u1" });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("self-only a editar item de ferias sem user_id grava com o seu id", async () => {
    permissions.manage = false;
    const onSave = setup({ item: baseItem, currentUserId: "u1" });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ user_id: "u1" });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("self-only nao sobrescreve um user_id ja existente", async () => {
    permissions.manage = false;
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
