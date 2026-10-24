import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SchedulingStep } from "../SchedulingStep";

const NO_COVERAGE = "Sem disponibilidade na sua zona";

type Reply = string[] | "error";

// Simula o servidor: devolve as datas configuradas para o mes do start_date pedido (yyyy-MM).
function mockServer(byMonth: Record<string, Reply>) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const month = String(body.start_date).slice(0, 7);
    const reply = byMonth[month] ?? [];
    if (reply === "error") throw new Error("network");
    return { json: async () => ({ available_dates: reply }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderStep() {
  return render(
    <SchedulingStep
      formId="f1"
      stepNumber={1}
      boardId={null}
      durationMinutes={60}
      primaryColor="#0055ff"
      onSlotSelected={() => {}}
      selectedSlot={null}
    />,
  );
}

describe("SchedulingStep: mes actual sem horarios", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T10:00:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("avanca para o mes seguinte quando o mes actual vem vazio", async () => {
    const fetchMock = mockServer({ "2026-09": [], "2026-10": ["2026-10-05", "2026-10-06"] });
    renderStep();

    await waitFor(() => expect(screen.getByText(/outubro 2026/i)).toBeInTheDocument());
    expect(screen.queryByText(NO_COVERAGE)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const day5 = screen.getByRole("button", { name: "5" });
    await waitFor(() => expect(day5).toBeEnabled());
  });

  it("mostra sem disponibilidade quando os meses seguidos vem todos vazios", async () => {
    const fetchMock = mockServer({});
    renderStep();

    expect(await screen.findByText(NO_COVERAGE)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("mostra sem disponibilidade quando o pedido inicial falha", async () => {
    const fetchMock = mockServer({ "2026-09": "error" });
    renderStep();

    expect(await screen.findByText(NO_COVERAGE)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("nao avanca quando o mes actual tem datas", async () => {
    const fetchMock = mockServer({ "2026-09": ["2026-09-30"], "2026-10": ["2026-10-05"] });
    renderStep();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/setembro 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(NO_COVERAGE)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("um mes vazio escolhido a mao mostra a grelha vazia com as setas", async () => {
    const fetchMock = mockServer({ "2026-09": ["2026-09-30"] });
    const { container } = renderStep();

    await screen.findByText(/setembro 2026/i);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, next] = container.querySelectorAll("button");

    fireEvent.click(next);
    await waitFor(() => expect(screen.getByText(/outubro 2026/i)).toBeInTheDocument());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(screen.queryByText(NO_COVERAGE)).not.toBeInTheDocument();
    expect(screen.getByText(/outubro 2026/i)).toBeInTheDocument();
    expect(container.querySelectorAll("button").length).toBeGreaterThan(2);
  });

  it("nao permite navegar para meses anteriores ao actual", async () => {
    mockServer({ "2026-09": ["2026-09-30"] });
    const { container } = renderStep();

    await screen.findByText(/setembro 2026/i);
    const [prev] = container.querySelectorAll("button");
    expect(prev).toBeDisabled();
  });
});
