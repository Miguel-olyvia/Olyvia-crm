// «Corrigir o ponto» (entrada e saida de uma vez): enquanto grava, nao fecha (Esc, clique fora) e um duplo clique nao grava
// a entrada duas vezes. A `picar` e simulada; o resto e o componente real.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";

vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { LancarEntradaESaidaSheet } from "./LancarEntradaESaidaSheet";

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => window.localStorage.setItem("language", "pt"));
afterEach(cleanup);

function montar(onPicar: (a: { sentido: string }) => Promise<string | null>) {
  const onFechar = vi.fn();
  const onAlterado = vi.fn();
  render(
    <LanguageProvider>
      <LancarEntradaESaidaSheet
        aberto
        data="2026-10-06"
        horaEntradaInicial="09:00"
        horaSaidaInicial="13:00"
        locais={[]}
        aGravar={false}
        onFechar={onFechar}
        onPicar={onPicar as never}
        onAlterado={onAlterado}
      />
    </LanguageProvider>,
  );
  return { onFechar, onAlterado };
}

/** Uma `picar` que so responde quando o teste o decide. */
function picarSuspensa() {
  const pendentes: Array<(erro: string | null) => void> = [];
  const picar = vi.fn((_a: { sentido: string }) => new Promise<string | null>((resolve) => pendentes.push(resolve)));
  return { picar, responder: (erro: string | null = null) => pendentes.shift()?.(erro) };
}

describe("LancarEntradaESaidaSheet", () => {
  it("a trava e sincrona: dois cliques seguidos gravam a entrada uma so vez", async () => {
    const { picar, responder } = picarSuspensa();
    montar(picar);
    const botao = screen.getByRole("button", { name: "Lançar entrada e saída" });
    act(() => {
      botao.click();
      botao.click();
    });
    expect(picar).toHaveBeenCalledTimes(1);
    expect(picar.mock.calls[0][0].sentido).toBe("entrada");
    await act(async () => responder(null));
    await waitFor(() => expect(picar).toHaveBeenCalledTimes(2));
    expect(picar.mock.calls[1][0].sentido).toBe("saida");
    await act(async () => responder(null));
  });

  it("enquanto grava, Esc nao fecha a gaveta; depois de gravar, fecha-se", async () => {
    const { picar, responder } = picarSuspensa();
    const { onFechar } = montar(picar);
    fireEvent.click(screen.getByRole("button", { name: "Lançar entrada e saída" }));
    await waitFor(() => expect(picar).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    expect(onFechar).not.toHaveBeenCalled();
    await act(async () => responder(null));
    await waitFor(() => expect(picar).toHaveBeenCalledTimes(2));
    await act(async () => responder(null));
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });

  it("sem gravar nada, Esc fecha a gaveta", () => {
    const { picar } = picarSuspensa();
    const { onFechar } = montar(picar);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
});
