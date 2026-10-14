// Arranque dos fluxos novos da frente A: botões de configuração e separador Cargos, janela do responsável (fim de contrato)
// e separador Custo da ficha. Tudo em memória, sem base.
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { atualizarFicha, lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { lerCusto, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { aplicarIndicacao } from "@/components/rh-exemplo/fimContrato/indicacaoResponsavel";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import PessoasRh from "./PessoasRh";
import RhConfiguracaoAdmissao from "./RhConfiguracaoAdmissao";
import RhRegrasFimContrato from "./RhRegrasFimContrato";

const renderEm = (endereco: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
          <Route path="/rh-exemplo/pessoas/:id" element={<PessoaRhDetalhe />} />
          <Route path="/rh-exemplo/admissao/configuracao" element={<RhConfiguracaoAdmissao />} />
          <Route path="/rh-exemplo/contratos/configuracao" element={<RhRegrasFimContrato />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
  reporCusto();
});

describe("frente A: botões de configuração e Cargos", () => {
  it("a lista tem os dois botões secundários ao lado de «Nova pessoa» e o separador Cargos", () => {
    renderEm("/rh-exemplo/pessoas");
    expect(screen.getByRole("button", { name: "Campos de admissão" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regras de fim de contrato" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova pessoa" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cargos" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Funções/ })).not.toBeInTheDocument();
  });

  it("«Campos de admissão» abre a página e «Voltar a Pessoas» regressa à lista", () => {
    renderEm("/rh-exemplo/pessoas");
    fireEvent.click(screen.getByRole("button", { name: "Campos de admissão" }));
    expect(screen.getByRole("heading", { level: 1, name: "Campos obrigatórios de admissão" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Voltar a Pessoas" }));
    expect(screen.getByRole("button", { name: "Nova pessoa" })).toBeInTheDocument();
  });

  it("«Regras de fim de contrato» abre a página, também com «Voltar a Pessoas»", () => {
    renderEm("/rh-exemplo/pessoas");
    fireEvent.click(screen.getByRole("button", { name: "Regras de fim de contrato" }));
    expect(screen.getByRole("link", { name: "Voltar a Pessoas" })).toHaveAttribute("href", "/rh-exemplo/pessoas");
  });

  it("o separador Cargos mostra que os cargos só se desativam", () => {
    renderEm("/rh-exemplo/pessoas?tab=cargos");
    expect(screen.getByRole("tab", { name: "Cargos", selected: true })).toBeInTheDocument();
    expect(screen.getByText(/Os cargos nunca se apagam/)).toBeInTheDocument();
  });
});

describe("frente A: janela do responsável (fim de contrato)", () => {
  it("o sino abre a janela, o responsável indica e a indicação fica visível", () => {
    renderEm("/rh-exemplo/pessoas?tab=contratos");
    fireEvent.click(screen.getByRole("button", { name: /Indicações do responsável sobre contratos a terminar/ }));
    const janela = screen.getByRole("dialog", { name: "Contratos a terminar na tua equipa" });
    const continuar = within(janela).getAllByRole("button", { name: "Continuar" })[0];
    expect(continuar).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(continuar);
    expect(within(janela).getAllByRole("button", { name: /Continuar/ })[0]).toHaveAttribute("aria-pressed", "true");
    expect(within(janela).getByText(/^Guardado:/)).toBeInTheDocument();
    expect(within(janela).getByText(/Só indicas/)).toBeInTheDocument();
    const feitas = Object.values(lerEstado().fichas).filter((f) => Object.keys(f.respostasFim).length > 0);
    expect(feitas).toHaveLength(1);
    expect(feitas[0].vinculos.every((v) => v.estado !== "terminado")).toBe(true);
  });

  it("no cartão «Fim do contrato» o RH vê a indicação, com quem e quando, e continua a poder renovar ou terminar", () => {
    const beatriz = lerEstado().fichas["p-beatriz"];
    const vinculo = beatriz.vinculos.find((v) => v.data_fim !== null)?.id ?? "";
    atualizarFicha("p-beatriz", (f) => aplicarIndicacao(f, vinculo, "nao_pretendo_continuar", new Date().toISOString()));
    renderEm("/rh-exemplo/pessoas/p-beatriz");
    const ficha = screen.getByRole("dialog");
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Contratos/ }), { button: 0 });
    const seccao = within(ficha).getByRole("region", { name: "Indicação do responsável" });
    expect(within(seccao).getByText("Não pretendo continuar")).toBeInTheDocument();
    expect(within(seccao).getByText(/Inês Cardoso/)).toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: "Renovar" })).toBeInTheDocument();
  });
});

describe("frente A: separador Custo da ficha", () => {
  const abrirCusto = () => {
    renderEm("/rh-exemplo/pessoas/p-tiago");
    fireEvent.mouseDown(within(screen.getByRole("dialog")).getByRole("tab", { name: "Custo" }), { button: 0 });
    return screen.getByRole("dialog");
  };

  it("mostra o custo do mês, ao lado, acumulados e os valores avulsos do exemplo", () => {
    const ficha = abrirCusto();
    expect(within(ficha).getByText("Custo total do mês")).toBeInTheDocument();
    expect(within(ficha).getByText("Custo com os subsídios repartidos por 12 meses")).toBeInTheDocument();
    expect(within(ficha).getByText(/Saldo do banco de horas/)).toBeInTheDocument();
    expect(within(ficha).getByText("Desde a admissão")).toBeInTheDocument();
    expect(within(ficha).getByText("Visita ao cliente do Porto")).toBeInTheDocument();
  });

  it("recusa um registo sem descrição, aceita um válido e anula só com motivo (o valor continua visível)", () => {
    const ficha = abrirCusto();
    fireEvent.click(within(ficha).getByRole("button", { name: "Registar valor" }));
    const registo = screen.getByRole("dialog", { name: "Registar um valor avulso" });
    fireEvent.change(within(registo).getByLabelText("Quilómetros"), { target: { value: "50" } });
    fireEvent.click(within(registo).getByRole("button", { name: "Registar valor" }));
    expect(within(registo).getByRole("alert")).toHaveTextContent("Preenche a descrição.");
    fireEvent.change(within(registo).getByLabelText("Descrição"), { target: { value: "Entrega em Setúbal" } });
    fireEvent.click(within(registo).getByRole("button", { name: "Registar valor" }));
    expect(within(screen.getByRole("dialog")).getByText("Entrega em Setúbal")).toBeInTheDocument();
    expect(lerCusto().avulsos.at(-1)).toMatchObject({ descricao: "Entrega em Setúbal", valor: 20 });

    const linha = within(screen.getByRole("dialog")).getByText("Entrega em Setúbal").closest("tr") as HTMLElement;
    fireEvent.click(within(linha).getByRole("button", { name: "Anular" }));
    const anular = screen.getByRole("dialog", { name: "Anular valor" });
    fireEvent.click(within(anular).getByRole("button", { name: "Anular" }));
    expect(within(anular).getByRole("alert")).toHaveTextContent("Indica o motivo");
    fireEvent.change(within(anular).getByLabelText("Motivo"), { target: { value: "Registado por engano" } });
    fireEvent.click(within(anular).getByRole("button", { name: "Anular" }));
    const depois = within(screen.getByRole("dialog")).getByText("Entrega em Setúbal").closest("tr") as HTMLElement;
    expect(within(depois).getByText("Anulado")).toBeInTheDocument();
    expect(within(depois).queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("na visão da pessoa só se vêem os valores avulsos, sem encargos, custo total nem botões de registar", () => {
    const ficha = abrirCusto();
    fireEvent.click(within(ficha).getByRole("button", { name: "Visão da pessoa" }));
    expect(within(ficha).queryByText("Custo total do mês")).not.toBeInTheDocument();
    expect(within(ficha).queryByText("Encargos da empresa")).not.toBeInTheDocument();
    expect(within(ficha).queryByRole("button", { name: "Registar valor" })).not.toBeInTheDocument();
    expect(within(ficha).getByText("Visita ao cliente do Porto")).toBeInTheDocument();
  });
});
