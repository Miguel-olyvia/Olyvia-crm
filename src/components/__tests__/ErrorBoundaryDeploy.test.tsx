// 20/11 (auditoria de 19/11, lote 3): o ErrorBoundary usa a mesma recarga que main.tsx (lib/recargaDeploy.ts): uma vez, a saltar a cache.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../ErrorBoundary";
import { MARCA_RECARREGOU, navegacao, reporRecarga } from "@/lib/recargaDeploy";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

const substituir = vi.fn<(url: string) => void>();
const original = { ...navegacao };
beforeEach(() => {
  sessionStorage.clear(); reporRecarga(); substituir.mockReset();
  navegacao.substituir = substituir; navegacao.recarregar = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); Object.assign(navegacao, original); vi.restoreAllMocks(); });

function Partido({ msg }: { msg: string }): never { throw new Error(msg); }
const CHUNK = "Failed to fetch dynamically imported module: https://app/assets/Pagina-abc.js";

describe("o ErrorBoundary e o deploy", () => {
  it("um chunk de um deploy antigo recarrega uma vez, a saltar a cache (?v=)", () => {
    render(<ErrorBoundary><Partido msg={CHUNK} /></ErrorBoundary>);
    expect(substituir).toHaveBeenCalledTimes(1);
    expect(new URL(substituir.mock.calls[0][0]).searchParams.get("v")).toBeTruthy();
    expect(sessionStorage.getItem(MARCA_RECARREGOU)).toBe("true");
  });

  it("já recarregou nesta sessão: mostra o erro, e «Recarregar página» também salta a cache", () => {
    sessionStorage.setItem(MARCA_RECARREGOU, "true");
    render(<ErrorBoundary><Partido msg={CHUNK} /></ErrorBoundary>);
    expect(substituir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Recarregar página/ }));
    expect(substituir).toHaveBeenCalledTimes(1);
  });

  it("outro erro não recarrega sozinho", () => {
    render(<ErrorBoundary><Partido msg="outra coisa" /></ErrorBoundary>);
    expect(substituir).not.toHaveBeenCalled();
    expect(screen.getByText("Algo correu mal")).toBeInTheDocument();
  });
});
