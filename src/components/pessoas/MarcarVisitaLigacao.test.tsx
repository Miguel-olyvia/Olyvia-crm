// O diálogo de «Marcar visita» e o que acontece quando a visita pedida a partir de um negócio NÃO fica ligada a ele (a ligação foi recusada):
// o utilizador é avisado e a pessoa passa a contar como tendo visita (o botão das submissões desaparece). Se ficou ligada, o botão das
// submissões continua. Nada fala com a base.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { toast } from "@/lib/toast";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { MarcarVisitaProvider } from "./MarcarVisita";
import { useMarcarVisita } from "./marcarVisitaContexto";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

beforeAll(prepararRadixNoJsdom);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function Consumidor({ negocioId, aoMarcada }: { negocioId?: string; aoMarcada?: (ligada: boolean) => void }) {
  const m = useMarcarVisita()!;
  return (
    <>
      <button type="button" onClick={() => m.pedir({ pessoaId: "p1", nome: "Ana Teste", moradaLead: null, negocioId, aoMarcada })}>abrir</button>
      <p data-testid="marcadas">{[...m.marcadas].join(",")}</p>
    </>
  );
}

function marcar(aoMarcar: () => boolean | void, negocioId?: string, aoMarcada?: (ligada: boolean) => void) {
  render(<MarcarVisitaProvider hoje={HOJE_EXEMPLO} aoMarcar={aoMarcar}><Consumidor negocioId={negocioId} aoMarcada={aoMarcada} /></MarcarVisitaProvider>);
  fireEvent.click(screen.getByRole("button", { name: "abrir" }));
  const dialogo = screen.getByRole("dialog");
  fireEvent.change(within(dialogo).getByLabelText("Dia"), { target: { value: "2026-12-30" } });
  fireEvent.change(within(dialogo).getByLabelText("Rua e número"), { target: { value: "Rua B 2" } });
  fireEvent.click(within(dialogo).getByRole("button", { name: /^Marcar visita$/ }));
}

describe("marcar visita a partir de um negócio", () => {
  it("ligação recusada: avisa que a visita ficou por ligar e a pessoa passa a contar como marcada", () => {
    const depois = vi.fn();
    marcar(() => false, "n1", depois);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("por ligar"));
    expect(screen.getByTestId("marcadas")).toHaveTextContent("p1");
    expect(depois).toHaveBeenCalledWith(false);
  });

  it("ligada ao negócio: toast de sucesso e o botão das submissões da pessoa não desaparece", () => {
    const depois = vi.fn();
    marcar(() => true, "n1", depois);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
    expect(screen.getByTestId("marcadas")).toBeEmptyDOMElement();
    expect(depois).toHaveBeenCalledWith(true);
  });

  it("sem negócio (visita por ligar de propósito): como sempre, a pessoa passa a marcada", () => {
    marcar(() => undefined);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("marcadas")).toHaveTextContent("p1");
  });
});
