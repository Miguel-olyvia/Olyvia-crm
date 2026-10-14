// Arranque dos ecrãs novos da frente C (horas extra, as minhas horas extra, cálculo do mês) e dos fluxos principais.
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { InterruptorHorasExtra } from "@/components/rh-exemplo/fluxosC/InterruptorHorasExtra";
import { lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import RhHorasExtra from "./RhHorasExtra";
import RhMinhasHorasExtra from "./RhMinhasHorasExtra";
import RhProcessamentoSalarial from "./RhProcessamentoSalarial";

const renderEm = (caminho: string, padrao: string, elemento: JSX.Element) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[caminho]}>
        <Routes>
          <Route path={padrao} element={elemento} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

function semChavesPorTraduzir(): void {
  const soltas = (document.body.textContent ?? "").match(/\brhFluxosC\.[A-Za-z]+\.[A-Za-z0-9_.]+/g) ?? [];
  expect(soltas).toEqual([]);
}

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosC();
});

describe("Horas extra (lista do RH)", () => {
  it("abre com as pendentes e sem chaves por traduzir", () => {
    renderEm("/rh-exemplo/horas-extra", "/rh-exemplo/horas-extra", <RhHorasExtra />);
    expect(screen.getByRole("heading", { level: 1, name: /Horas extra/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Confirmar:/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Acima do limite \(1\)/ })).toBeInTheDocument();
    semChavesPorTraduzir();
  });

  it("confirmar uma pendente passa-a a confirmada", () => {
    renderEm("/rh-exemplo/horas-extra", "/rh-exemplo/horas-extra", <RhHorasExtra />);
    const antes = lerFluxosC().horasExtra.filter((h) => h.estado === "confirmada").length;
    fireEvent.click(screen.getAllByRole("button", { name: /^Confirmar:/ })[0]);
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar" }));
    expect(lerFluxosC().horasExtra.filter((h) => h.estado === "confirmada").length).toBe(antes + 1);
  });

  it("rejeitar exige motivo de 3 caracteres e só depois rejeita", () => {
    renderEm("/rh-exemplo/horas-extra", "/rh-exemplo/horas-extra", <RhHorasExtra />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Rejeitar:/ })[0]);
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "ab" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Rejeitar" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(/pelo menos 3/);
    expect(lerFluxosC().horasExtra.filter((h) => h.estado === "rejeitada").length).toBe(2);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "não foi feita" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Rejeitar" }));
    expect(lerFluxosC().horasExtra.filter((h) => h.estado === "rejeitada").length).toBe(3);
  });

  it("filtrar por «Acima do limite» mostra só a marcada", () => {
    renderEm("/rh-exemplo/horas-extra", "/rh-exemplo/horas-extra", <RhHorasExtra />);
    fireEvent.click(screen.getByRole("button", { name: /Acima do limite \(1\)/ }));
    const tabela = screen.getAllByRole("table")[0];
    expect(within(tabela).getAllByRole("row")).toHaveLength(2);
  });
});

describe("A minha área: as minhas horas extra", () => {
  it("mostra o limite anual com alerta, a lista e o banco de horas", () => {
    renderEm("/rh-exemplo/minhas-horas-extra", "/rh-exemplo/minhas-horas-extra", <RhMinhasHorasExtra />);
    expect(screen.getByRole("heading", { level: 1, name: /As minhas horas extra/ })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getByText("Banco de horas")).toBeInTheDocument();
    expect(screen.getByText("+3 h")).toBeInTheDocument();
    semChavesPorTraduzir();
  });

  it("a vista da pessoa não oferece ajuste manual do banco", () => {
    renderEm("/rh-exemplo/minhas-horas-extra", "/rh-exemplo/minhas-horas-extra", <RhMinhasHorasExtra />);
    expect(screen.queryByRole("button", { name: /Crédito manual/ })).not.toBeInTheDocument();
  });
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

describe("Processamento salarial: cálculo do mês", () => {
  const abrir = () => renderEm("/rh-exemplo/processamento-salarial?tab=calculo", "/rh-exemplo/processamento-salarial", <RhProcessamentoSalarial />);

  it("abre com uma linha por pessoa activa e o total", () => {
    abrir();
    expect(screen.getByRole("columnheader", { name: "Total bruto" })).toBeInTheDocument();
    expect(screen.getByText("Total bruto do mês")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Horas extra" })).toBeInTheDocument();
    semChavesPorTraduzir();
  });

  it("«Como chegámos a este valor» mostra os passos", () => {
    abrir();
    fireEvent.click(screen.getAllByRole("button", { name: /Como chegámos a este valor/ })[0]);
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(/Retribuição mensal/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Valor da hora/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Total bruto estimado/)).toBeInTheDocument();
  });

  it("fechar guarda o recibo (leitura) e reabrir exige autorização e motivo, e fica registado", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Fechar o mês" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Fechar o mês" }));
    expect(Object.keys(lerFluxosC().fechos)).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(/Mês fechado/);
    expect(screen.queryByRole("button", { name: /Acrescentar valor/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reabrir o mês" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "erro" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir o mês" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(/autorização especial/);
    fireEvent.click(within(dialogo).getByRole("checkbox"));
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "x" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir o mês" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent(/pelo menos 3/);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "prémio em falta" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Reabrir o mês" }));
    expect(Object.keys(lerFluxosC().fechos)).toHaveLength(0);
    expect(lerFluxosC().reaberturas).toHaveLength(1);
    expect(lerFluxosC().reaberturas[0].motivo).toBe("prémio em falta");
  });

  it("um valor pontual entra no total da pessoa", () => {
    abrir();
    const antes = lerFluxosC().pontuais.length;
    fireEvent.click(screen.getAllByRole("button", { name: /Acrescentar valor/ })[0]);
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Descrição"), { target: { value: "Prémio" } });
    fireEvent.change(within(dialogo).getByLabelText(/Valor/), { target: { value: "25" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    expect(lerFluxosC().pontuais.length).toBe(antes + 1);
  });
});
