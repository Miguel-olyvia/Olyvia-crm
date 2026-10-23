// Regressão: no App o protótipo vive dentro do BrowserRouter e de uma rota (/prototipo/negocios). O RH tem um MemoryRouter próprio;
// o react-router recusa um Router dentro de outro e o ErrorBoundary mostrava "Algo correu mal ... recarregar". Os outros testes do RH
// renderizam-no sem router por fora e por isso nunca apanharam isto.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => { throw new Error("O protótipo de RH não pode importar o cliente Supabase"); });
vi.mock("@supabase/supabase-js", () => { throw new Error("O protótipo de RH não pode importar o supabase-js"); });

import ErrorBoundary from "@/components/ErrorBoundary";
import RhPagina from "./RhPagina";
import { ABAS_RH } from "./abas";
import { esquecerRh } from "./loja";

const h1 = (): string => document.querySelector("#rh-painel h1")?.textContent ?? "";

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("language", "pt");
  window.history.pushState({}, "", "/prototipo/negocios");
  esquecerRh();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("RH montado como o App o monta (dentro de BrowserRouter e de uma rota)", () => {
  it("cada aba abre o seu ecrã e não mostra o ecrã de erro", async () => {
    for (const a of ABAS_RH) {
      const { unmount } = render(
        <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/prototipo/negocios" element={<RhPagina aba={a.k} aoMudarAba={() => undefined} />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>,
      );
      await waitFor(() => expect(h1().length, a.k).toBeGreaterThan(0), { timeout: 15000 });
      expect(screen.queryByText(/Algo correu mal/i), a.k).toBeNull();
      unmount();
    }
  }, 120000);
});
