// As tarefas de obra no calendário da Agenda: aparecem nas três vistas, não se arrastam, não abrem o diálogo de edição nem criam marcação,
// e o clique abre o resumo com "Abrir nas Operações".
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { addDays, startOfWeek } from "date-fns";

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ t: (k: string) => k, language: "pt" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => true, loading: false }) }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { ScheduleCalendarView } from "../ScheduleCalendarView";
import { LINK_OPERACOES_OBRA } from "../ObraTarefaEvento";
import { diaIso, eventosObra } from "@/lib/agenda/obraTarefas";

const SEGUNDA = startOfWeek(addDays(new Date(), 14), { weekStartsOn: 1 });
const QUARTA = addDays(SEGUNDA, 2);
const EVENTOS = eventosObra([
  { pessoa_id: "p1", nome: "Rúben Lopes", tarefas: [
    { tarefa_id: "t1", nome: "Montagem de louças", oficio: "Canalizador", inicio: diaIso(SEGUNDA), fim: diaIso(addDays(SEGUNDA, 6)), estado: "em_curso",
      horas_dia: 4, obra_id: "o1", obra_codigo: "OB-0007", obra_titulo: "Remodelação WC", morada: "Rua A, 1", negocio_numero: 1010 },
    { tarefa_id: "t2", nome: "Pintura", oficio: null, inicio: diaIso(QUARTA), fim: null, estado: "validada",
      horas_dia: 8, obra_id: "o1", obra_codigo: "OB-0007", obra_titulo: "Remodelação WC", morada: null, negocio_numero: 1010 },
  ] },
], diaIso(SEGUNDA), diaIso(addDays(SEGUNDA, 6)));

const montar = (viewMode: "month" | "week" | "day", currentDate = QUARTA) => {
  const onItemClick = vi.fn(), onAddClick = vi.fn();
  render(
    <MemoryRouter>
      <ScheduleCalendarView items={[]} boards={[]} currentDate={currentDate} onDateChange={vi.fn()} onItemClick={onItemClick}
        onAddClick={onAddClick} viewMode={viewMode} obraEventos={EVENTOS} />
    </MemoryRouter>,
  );
  return { onItemClick, onAddClick };
};

describe("Tarefas de obra no calendário da Agenda", () => {
  it("semana: a tarefa nos 5 dias úteis (não no fim de semana), com a pessoa; a validada esbatida", () => {
    montar("week");
    expect(screen.getAllByText("#1010 · Montagem de louças")).toHaveLength(5);
    expect(screen.getAllByText("Rúben Lopes").length).toBeGreaterThanOrEqual(5);
    const pintura = screen.getByText("#1010 · Pintura").closest("[data-testid='agenda-obra-tarefa']") as HTMLElement;
    expect(pintura.dataset.estado).toBe("validada");
    expect(pintura.className).toContain("text-muted-foreground");
  });

  it("só de leitura: não se arrasta, o clique não abre o diálogo nem cria marcação e mostra o resumo", () => {
    const { onItemClick, onAddClick } = montar("week");
    const el = screen.getAllByText("#1010 · Montagem de louças")[0].closest("[data-testid='agenda-obra-tarefa']") as HTMLElement;
    expect(el.closest("[draggable='true']")).toBeNull();
    fireEvent.click(el);
    expect(onItemClick).not.toHaveBeenCalled();
    expect(onAddClick).not.toHaveBeenCalled();
    expect(screen.getByText("Remodelação WC", { exact: false })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Abrir nas Operações" }).getAttribute("href")).toBe(LINK_OPERACOES_OBRA);
    fireEvent.click(screen.getByText("Planeada na obra do negócio; altera-se no plano da obra, não aqui."));
    expect(onAddClick).not.toHaveBeenCalled();
  });

  it("dia: as tarefas de obra numa faixa por cima das horas", () => {
    montar("day");
    expect(screen.getByText("Obras")).toBeTruthy();
    expect(screen.getByText("#1010 · Pintura")).toBeTruthy();
  });

  it("mês: entram nas três primeiras do dia", () => {
    montar("month");
    expect(screen.getAllByText("#1010 · Montagem de louças").length).toBe(5);
  });
});
