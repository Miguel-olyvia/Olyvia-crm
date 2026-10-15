// A página da Agenda (/scheduling) com um item da Frota e um item normal: o da Frota abre só para consulta (com
// "Abrir na Frota") e não se arrasta nem grava; o normal continua a abrir o diálogo de edição e a reagendar-se.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ScheduleBoard, ScheduleItem } from "@/types/scheduling";

const m = vi.hoisted(() => ({
  rescheduleItem: vi.fn(async (_id: string, _ini: Date, _fim: Date) => true),
  updateItem: vi.fn(async () => true),
  deleteItem: vi.fn(async () => true),
  updateAssignees: vi.fn(async () => null),
  toastInfo: vi.fn(),
  items: [] as unknown[],
  boards: [] as unknown[],
  dialogo: null as null | { onSave: (d: unknown, a: string[]) => Promise<void>; onDelete: (id: string) => Promise<void> },
  // referências estáveis, como nos hooks reais (um array novo a cada render punha os efeitos da página em ciclo)
  estaveis: {} as Record<string, unknown>,
}));
m.estaveis.perms = { hasPermission: () => true, loading: false };
m.estaveis.scope = { getPermissionScope: () => "ORG", authUserId: "auth-1", teamMemberIds: [], anewUserId: "u-1", loading: false };
m.estaveis.company = { activeCompany: { id: "org-1" }, userType: "user" };
m.estaveis.settings = { settings: null, holidays: [] };
m.estaveis.t = { t: (k: string) => k, language: "pt" };

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => m.estaveis.t }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => m.estaveis.perms }));
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => m.estaveis.scope }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => m.estaveis.company }));
vi.mock("@/hooks/useScheduleSettings", () => ({ useScheduleSettings: () => m.estaveis.settings }));
vi.mock("@/hooks/useScheduling", () => ({
  useScheduling: () => (m.estaveis.scheduling ??= {
    loading: false,
    fetchBoards: async () => m.boards, createBoard: vi.fn(), updateBoard: vi.fn(), deleteBoard: vi.fn(),
    fetchResources: async () => [], createResource: vi.fn(), updateResource: vi.fn(), deleteResource: vi.fn(),
    fetchItems: async () => m.items, createItem: vi.fn(), updateItem: m.updateItem, deleteItem: m.deleteItem,
    rescheduleItem: m.rescheduleItem, updateAssignees: m.updateAssignees, ensureTimeOffBoard: async () => undefined,
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { info: m.toastInfo, error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/scheduling/notifyClientOfScheduleChange", () => ({ notifyClientOfScheduleChange: vi.fn(async () => null), detectScheduleChanges: () => [] }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/PageFAQSheet", () => ({ PageFAQSheet: () => null }));
vi.mock("@/components/scheduling/ScheduleBoardsTab", () => ({ ScheduleBoardsTab: () => null }));
vi.mock("@/components/scheduling/AutoScheduleRulesTab", () => ({ AutoScheduleRulesTab: () => null }));
vi.mock("@/components/scheduling/ScheduleSettingsDialog", () => ({ ScheduleSettingsDialog: () => null }));
vi.mock("@/components/scheduling/ScheduleBoardDialog", () => ({ ScheduleBoardDialog: () => null }));
vi.mock("@/components/scheduling/ScheduleResourceDialog", () => ({ ScheduleResourceDialog: () => null }));
vi.mock("@/components/scheduling/ScheduleItemDialog", () => ({
  ScheduleItemDialog: (p: { open: boolean; item: { title: string } | null; onSave: never; onDelete: never }) => {
    m.dialogo = { onSave: p.onSave, onDelete: p.onDelete };
    return p.open ? <div data-testid="dialogo-edicao">{p.item?.title}</div> : null;
  },
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const f of ["select", "eq", "in", "order", "is"]) q[f] = () => q;
  q.maybeSingle = async () => ({ data: { id: "u-1" }, error: null });
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return { supabase: { from: () => q, auth: { getUser: async () => ({ data: { user: { id: "auth-1" } } }) } } };
});

import Scheduling from "../Scheduling";

const board = (o: Partial<ScheduleBoard>): ScheduleBoard => ({ id: "b", name: "Quadro", color: "#64748b", is_active: true, settings: {}, created_by: "u", created_at: "", updated_at: "", ...o });
const hoje = (h: number): string => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const item = (o: Partial<ScheduleItem>): ScheduleItem => ({
  id: "i", board_id: "b-visitas", title: "Item", status: "scheduled", origin: "manual", start_datetime: hoje(20), end_datetime: hoje(21), all_day: false,
  priority: 0, metadata: {}, created_by: "u", created_at: "", updated_at: "", ...o,
});
const MANUT = item({
  id: "si-fleet", board_id: "b-fleet", title: "Revisão anual · AA-12-BC", metadata: { source: "fleet", fleet_vehicle_id: "v1", fleet_kind: "maintenance", fleet_maintenance_event_id: "m1" },
});
const VISITA = item({ id: "si-visita", title: "Visita ao cliente Lima", start_datetime: hoje(21), end_datetime: hoje(22) });

beforeEach(() => {
  m.boards = [board({ id: "b-fleet", name: "Frota", board_type: "fleet", is_system_board: true }), board({ id: "b-visitas", name: "Visitas" })];
  m.items = [MANUT, VISITA];
  for (const f of [m.rescheduleItem, m.updateItem, m.deleteItem, m.toastInfo]) f.mockClear();
});

async function montar() {
  render(<MemoryRouter><Scheduling /></MemoryRouter>);
  const frota = (await screen.findByText(MANUT.title)).closest("[draggable]") as HTMLElement;
  const visita = screen.getByText(VISITA.title).closest("[draggable]") as HTMLElement;
  return { frota, visita };
}
const dt = () => ({ dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } });
const arrastarNoMesmoDia = (el: HTMLElement) => {
  const dia = el.parentElement!.parentElement!;
  fireEvent.dragStart(el, dt());
  fireEvent.dragOver(dia, dt());
  fireEvent.drop(dia, dt());
};

describe("Agenda: itens da Frota só de leitura", () => {
  it("clicar no item da Frota abre a consulta com 'Abrir na Frota', não o diálogo de edição", async () => {
    const { frota } = await montar();
    fireEvent.click(frota);
    const dlg = await screen.findByTestId("fleet-schedule-item");
    expect(within(dlg).getByRole("link", { name: "Abrir na Frota" })).toHaveAttribute("href", "/frota/manutencao?viatura=v1&aba=manut");
    expect(screen.queryByTestId("dialogo-edicao")).toBeNull();
  });

  it("o item normal continua a abrir o diálogo de edição", async () => {
    const { visita } = await montar();
    fireEvent.click(visita);
    expect(await screen.findByTestId("dialogo-edicao")).toHaveTextContent(VISITA.title);
    expect(screen.queryByTestId("fleet-schedule-item")).toBeNull();
  });

  it("arrastar: o item da Frota não reagenda; o normal reagenda", async () => {
    const { frota, visita } = await montar();
    expect(frota).toHaveAttribute("draggable", "false");
    arrastarNoMesmoDia(frota);
    expect(m.rescheduleItem).not.toHaveBeenCalled();
    arrastarNoMesmoDia(visita);
    await waitFor(() => expect(m.rescheduleItem).toHaveBeenCalledTimes(1));
    expect(m.rescheduleItem.mock.calls[0][0]).toBe("si-visita");
  });

  it("gravar ou apagar um item da Frota (por qualquer caminho) não chega à BD; um normal sim", async () => {
    await montar();
    await m.dialogo!.onSave({ id: "si-fleet", title: "Mudado" }, []);
    await m.dialogo!.onDelete("si-fleet");
    expect(m.updateItem).not.toHaveBeenCalled();
    expect(m.deleteItem).not.toHaveBeenCalled();
    expect(m.toastInfo).toHaveBeenCalled();
    await m.dialogo!.onDelete("si-visita");
    expect(m.deleteItem).toHaveBeenCalledWith("si-visita");
  });
});
