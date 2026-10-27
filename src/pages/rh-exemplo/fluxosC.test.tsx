// Arranque dos ecrãs da frente C (horas extra; as horas extra da pessoa são agora uma aba, ver abasAssiduidade.test.tsx).
// O «Cálculo do mês» já não é de exemplo: está ligado ao processamento salarial real e o seu teste vive em
// components/rh-exemplo/fluxosC/ProcessamentoFluxoTab.test.tsx (com o cálculo simulado ao nível do hook partilhado).
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { InterruptorHorasExtra } from "@/components/rh-exemplo/fluxosC/InterruptorHorasExtra";
import { lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosC();
});

describe("Marca «pode fazer horas extra»", () => {
  it("o interruptor liga e desliga a marca da pessoa", () => {
    render(<LanguageProvider><InterruptorHorasExtra pessoaId="p-marta" /></LanguageProvider>);
    const interruptor = screen.getByRole("switch", { name: "Pode fazer horas extra" });
    expect(interruptor).toHaveAttribute("aria-checked", "false");
    fireEvent.click(interruptor);
    expect(lerFluxosC().podeHE["p-marta"]).toBe(true);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });
});
