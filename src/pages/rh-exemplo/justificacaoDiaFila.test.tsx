// A fila de trabalho do mapa de assiduidade com as justificações de dia por decidir: a linha conta no contador do
// separador, a decisão tira-a da fila e o mapa da organização acompanha (a falta justificada aparece na célula do dia).
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { reporJustificacaoDia } from "@/components/rh-exemplo/dados/lojaJustificacaoDia";
import { reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import RhAssiduidadeOrganizacao from "./RhAssiduidadeOrganizacao";

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
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
  reporJustificacaoDia();
});

const abrirSeparador = (nome: RegExp) => {
  const separador = screen.getByRole("tab", { name: nome });
  fireEvent.mouseDown(separador);
  fireEvent.click(separador);
};

describe("justificações de dia na fila do mapa de assiduidade", () => {
  it("a linha da Inês aparece na fila, entra no contador, e aceitar tira-a e desce o contador", async () => {
    render(<LanguageProvider><MemoryRouter><RhAssiduidadeOrganizacao /></MemoryRouter></LanguageProvider>);
    const contador = await screen.findByTestId("rhd-contador-fila");
    const antes = Number(contador.textContent);
    abrirSeparador(/Fila de trabalho|Desvios/i);
    const fila = await screen.findByTestId("rhjd-fila");
    const linha = within(fila).getByTestId("rhjd-fila-jd-ines");
    expect(linha).toHaveTextContent("Justificação por decidir");
    expect(linha).toHaveTextContent("Inês Cardoso");
    expect(linha).toHaveTextContent("há 2 dia(s)");
    fireEvent.click(within(linha).getByRole("button", { name: /Aceitar a justificação de Inês Cardoso/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Aceitar · não paga" }));
    await waitFor(() => expect(within(fila).queryByTestId("rhjd-fila-jd-ines")).not.toBeInTheDocument());
    expect(Number(screen.getByTestId("rhd-contador-fila").textContent)).toBe(antes - 1);
    expect(within(fila).getByTestId("rhjd-fila-aviso")).toHaveTextContent("Justificação aceite · não paga.");
  });
});
