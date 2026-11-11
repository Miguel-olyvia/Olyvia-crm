/**
 * Decisao 5 (RH): o banco de horas esta escondido na ficha por UM interruptor (`bancoHorasVisivel.ts`). Estes testes ligam-no (mock)
 * para provar que, quando voltar a ser ligado, o cartao e a regra «so com horario de banco» continuam a funcionar. Com o
 * interruptor como esta (desligado) a ficha nao o mostra: ver fluxosD.test.tsx, abasAssiduidade.test.tsx e calendarioPessoa.test.tsx.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";

vi.mock("./bancoHorasVisivel", () => ({ BANCO_DE_HORAS_VISIVEL: true }));

import { BancoHorasDaFicha } from "./BancoHorasDaFicha";
import { useEmBancoDeHoras } from "./useEmBancoDeHoras";

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
});

describe("banco de horas (interruptor ligado)", () => {
  it("quem tem horario de banco de horas tem o cartao, com ajustes para o RH", () => {
    render(
      <LanguageProvider>
        <MemoryRouter><BancoHorasDaFicha pessoaId="p-rui" podeAjustar /></MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.getByTestId("rhd-banco-ficha")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Banco de horas/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  });

  it("so existe banco para quem tem o tipo de horario banco", () => {
    expect(renderHook(() => useEmBancoDeHoras("p-rui")).result.current).toBe(true);
    expect(renderHook(() => useEmBancoDeHoras("p-sofia")).result.current).toBe(false);
  });
});
