// Itens da Frota na Agenda (decisão do Rafael: só de leitura). A regra (lib/agenda/fleet), o calendário (não se
// arrastam, levam o selo "Frota"; os outros itens continuam a arrastar-se) e o diálogo de consulta com "Abrir na Frota".
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { addDays, startOfWeek } from "date-fns";
import type { ScheduleBoard, ScheduleItem } from "@/types/scheduling";

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k, language: "pt" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true, loading: false }) }));
const toastInfo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/toast", () => ({ toast: { info: toastInfo, error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { FLEET_READ_ONLY_MESSAGE, fleetItemLink, isFleetScheduleItem } from "@/lib/agenda/fleet";
import { ScheduleCalendarView } from "../ScheduleCalendarView";
import { FleetScheduleItemDialog } from "../FleetScheduleItem";

const board = (o: Partial<ScheduleBoard>): ScheduleBoard => ({
  id: "b", name: "Quadro", color: "#64748b", is_active: true, settings: {}, created_by: "u", created_at: "", updated_at: "", ...o,
});
const BOARDS = [board({ id: "b-fleet", name: "Frota", board_type: "fleet", is_system_board: true }), board({ id: "b-visitas", name: "Visitas" })];

// uma semana futura (o calendário recusa largar em dias passados)
const SEGUNDA = startOfWeek(addDays(new Date(), 14), { weekStartsOn: 1 });
const em = (dias: number, h: number): string => { const d = addDays(SEGUNDA, dias); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const item = (o: Partial<ScheduleItem>): ScheduleItem => ({
  id: "i", board_id: "b-visitas", title: "Item", status: "scheduled", origin: "manual", start_datetime: em(1, 9), end_datetime: em(1, 10), all_day: false,
  priority: 0, metadata: {}, created_by: "u", created_at: "", updated_at: "", ...o,
});
const RESERVA = item({
  id: "si-fleet", board_id: "b-fleet", title: "Reserva · AA-12-BC · Sofia Martins", all_day: true, start_datetime: em(1, 0), end_datetime: em(2, 0),
  metadata: { source: "fleet", fleet_vehicle_id: "v1", fleet_kind: "reservation", fleet_assignment_id: "a2" },
});
const VISITA = item({ id: "si-visita", title: "Visita ao cliente Lima" });

describe("lib/agenda/fleet", () => {
  it("é da Frota pelo metadata.source ou pelo quadro board_type='fleet'; os outros não", () => {
    expect(isFleetScheduleItem(RESERVA)).toBe(true);
    expect(isFleetScheduleItem({ board_id: "b-fleet", metadata: {} }, BOARDS)).toBe(true);
    expect(isFleetScheduleItem(VISITA, BOARDS)).toBe(false);
    expect(isFleetScheduleItem(null, BOARDS)).toBe(false);
  });
  it("Abrir na Frota: a ficha da viatura na aba da reserva ou da manutenção", () => {
    expect(fleetItemLink(RESERVA)).toBe("/frota/atribuicoes?viatura=v1&aba=atrib");
    expect(fleetItemLink({ board_id: "b-fleet", metadata: { source: "fleet", fleet_vehicle_id: "v1", fleet_kind: "maintenance" } })).toBe("/frota/manutencao?viatura=v1&aba=manut");
    expect(fleetItemLink({ board_id: "b-fleet", metadata: { source: "fleet" } })).toBe("/frota/atribuicoes");
  });
});

describe("Calendário da Agenda com itens da Frota", () => {
  const montar = () => {
    const onItemDrop = vi.fn(), onItemClick = vi.fn();
    render(
      <ScheduleCalendarView items={[RESERVA, VISITA]} boards={BOARDS} currentDate={addDays(SEGUNDA, 1)} onDateChange={vi.fn()}
        onItemClick={onItemClick} onItemDrop={onItemDrop} viewMode="week" />,
    );
    const frota = screen.getAllByText(RESERVA.title)[0].closest("[draggable]") as HTMLElement;
    const visita = screen.getByText(VISITA.title).closest("[draggable]") as HTMLElement;
    return { onItemDrop, onItemClick, frota, visita };
  };
  const dt = () => ({ dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } });
  /** Arrasta o item para a coluna do dia seguinte. */
  const arrastar = (el: HTMLElement) => {
    const colunas = el.closest(".grid")!.querySelectorAll<HTMLElement>("[class*='min-h-[400px]']");
    const destino = colunas[3];
    fireEvent.dragStart(el, dt());
    fireEvent.dragOver(destino, dt());
    fireEvent.drop(destino, dt());
  };

  it("o item da Frota tem o selo 'Frota' e não se arrasta; o item normal continua arrastável", () => {
    const { frota, visita, onItemDrop } = montar();
    expect(within(frota).getByText("Frota")).toBeInTheDocument();
    expect(frota).toHaveAttribute("draggable", "false");
    expect(within(visita).queryByText("Frota")).toBeNull();
    expect(visita).toHaveAttribute("draggable", "true");

    arrastar(frota);
    expect(onItemDrop).not.toHaveBeenCalled();

    arrastar(visita);
    expect(onItemDrop).toHaveBeenCalledTimes(1);
    expect(onItemDrop.mock.calls[0][0]).toBe("si-visita");
  });

  it("clicar continua a abrir (a página decide: consulta para a Frota, edição para os outros)", () => {
    const { frota, onItemClick } = montar();
    fireEvent.click(frota);
    expect(onItemClick).toHaveBeenCalledWith(RESERVA);
  });
});

describe("Consulta de um item da Frota", () => {
  it("sem gravar nem apagar; diz que é gerido na Frota e liga à reserva", () => {
    render(<MemoryRouter><FleetScheduleItemDialog item={RESERVA} boards={BOARDS} onOpenChange={vi.fn()} /></MemoryRouter>);
    const dlg = screen.getByTestId("fleet-schedule-item");
    expect(within(dlg).getByText(FLEET_READ_ONLY_MESSAGE)).toBeInTheDocument();
    expect(within(dlg).getByText("Reserva da viatura")).toBeInTheDocument();
    expect(within(dlg).getByRole("link", { name: "Abrir na Frota" })).toHaveAttribute("href", "/frota/atribuicoes?viatura=v1&aba=atrib");
    expect(within(dlg).queryByRole("button", { name: /guardar|gravar|apagar|eliminar|delete|save/i })).toBeNull();
  });
});

