// A secção «Margem de tempo» da Configuração: ler, escolher «Sem margem (desligado)» ou 0 a 120 minutos, confirmar antes de gravar,
// campos inválidos ligados ao erro, só leitura sem permissão. A base é simulada (`@/test/horasExtraFalso`).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", async () => (await import("@/test/horasExtraFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/usePermissoesAssiduidade", async () => (await import("@/test/horasExtraFalso")).permissoesFalsas());
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { desviosBaseFalsa, reporBaseFalsa } from "@/test/horasExtraFalso";
import { ConfiguracaoMargemTempo } from "./ConfiguracaoMargemTempo";

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  reporBaseFalsa();
});
afterEach(cleanup);

const abrir = () => render(<LanguageProvider><ConfiguracaoMargemTempo /></LanguageProvider>);

describe("margem de tempo", () => {
  it("sem margem configurada diz que nada muda e explica o que a margem faz", () => {
    abrir();
    expect(screen.getByTestId("cfg-margem-em-vigor")).toHaveTextContent("Ainda não há margem configurada: nada muda");
    expect(screen.getByText(/Dentro da margem o dia conta como normal; fora dela fica «A validar»/)).toBeInTheDocument();
    expect(screen.getByText(/uma correção de picagens reabre dias já validados/i)).toBeInTheDocument();
  });

  it("mostra a margem em vigor e o histórico", () => {
    desviosBaseFalsa.margem = {
      emVigor: { id: "v2", margem_min: 15, valido_de: "2026-09-01", valido_ate: null, substituida_em: null },
      versoes: [
        { id: "v2", margem_min: 15, valido_de: "2026-09-01", valido_ate: null, substituida_em: null },
        { id: "v1", margem_min: 10, valido_de: "2026-01-01", valido_ate: "2026-08-31", substituida_em: null },
      ],
    };
    abrir();
    expect(screen.getByTestId("cfg-margem-em-vigor")).toHaveTextContent("margem de 15 minutos (desde 01/09/2026)");
    const historico = screen.getByRole("heading", { name: "Histórico da margem" }).closest("section") as HTMLElement;
    expect(within(historico).getAllByRole("listitem")).toHaveLength(2);
  });

  it("grava só depois de confirmar, com a data e os minutos escolhidos", async () => {
    abrir();
    fireEvent.change(screen.getByLabelText(/^Margem, em minutos/), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("A partir de"), { target: { value: "2026-11-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar margem" }));
    expect(desviosBaseFalsa.guardados).toEqual([]);
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent(/margem passa a ser de 20 minutos/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar margem" }));
    await waitFor(() => expect(desviosBaseFalsa.guardados).toEqual([{ validoDe: "2026-11-10", margemMin: 20 }]));
  });

  it("«Sem margem (desligado)» grava null e a confirmação di-lo", async () => {
    abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Sem margem (desligado)" }));
    expect(screen.getByLabelText(/^Margem, em minutos/)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar margem" }));
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent(/fica desligada \(sem margem\)/);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar margem" }));
    await waitFor(() => expect(desviosBaseFalsa.guardados).toHaveLength(1));
    expect(desviosBaseFalsa.guardados[0].margemMin).toBeNull();
  });

  it("uma margem fora de 0 a 120 desactiva o botão e o campo fica ligado ao erro", () => {
    abrir();
    const campo = screen.getByLabelText(/^Margem, em minutos/);
    fireEvent.change(campo, { target: { value: "121" } });
    const erro = screen.getByRole("alert");
    expect(erro).toHaveTextContent("entre 0 e 120");
    expect(campo).toHaveAttribute("aria-invalid", "true");
    expect(campo).toHaveAttribute("aria-describedby", erro.id);
    expect(screen.getByRole("button", { name: "Guardar margem" })).toBeDisabled();
  });

  it("um erro da base aparece escrito e nada se grava como feito", async () => {
    desviosBaseFalsa.erroDeEscrita = "Há uma folha fechada: a margem nova só pode valer a partir do dia seguinte ao fecho.";
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Guardar margem" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Guardar margem" }));
    expect(await screen.findByText(/Há uma folha fechada/)).toBeInTheDocument();
    expect(desviosBaseFalsa.guardados).toEqual([]);
  });
});
