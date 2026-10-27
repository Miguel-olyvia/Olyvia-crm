// Arranque dos fluxos novos da frente A: botões de configuração e separador Cargos, janela do responsável (fim de contrato)
// e separador Custo da ficha. Tudo em memória, sem base.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { lerCusto, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import PessoasRh from "./PessoasRh";
import RhConfiguracaoAdmissao from "./RhConfiguracaoAdmissao";
import RhRegrasFimContrato from "./RhRegrasFimContrato";

// Os dois botões de configuração só aparecem a quem tem a permissão que protege a rota de cada um.
const permissoes = vi.hoisted(() => ({
  concedidas: new Set<string>(["hr.pessoas.create", "hr.admissao.obrigatorios.gerir", "hr.contratos.regras.gerir"]),
}));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => permissoes.concedidas.has(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => permissoes.concedidas.has(p)),
    permissions: [...permissoes.concedidas],
    loading: false,
  }),
}));

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

beforeAll(() => {
  // O grupo de opções «Como conta» (Radix) mede-se com o ResizeObserver, que o jsdom não traz.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  permissoes.concedidas = new Set(["hr.pessoas.create", "hr.admissao.obrigatorios.gerir", "hr.contratos.regras.gerir"]);
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

  it("sem as permissões de configuração, os botões «Campos de admissão» e «Regras de fim de contrato» não aparecem", () => {
    permissoes.concedidas = new Set(["hr.pessoas.create"]);
    renderEm("/rh-exemplo/pessoas");
    expect(screen.queryByRole("button", { name: "Campos de admissão" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regras de fim de contrato" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova pessoa" })).toBeInTheDocument();
  });

  it("um ?tab= desconhecido ou sem permissão (contratos) cai no separador Pessoas", () => {
    renderEm("/rh-exemplo/pessoas?tab=inexistente");
    expect(screen.getByRole("tab", { name: "Pessoas", selected: true })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Contratos/ })).not.toBeInTheDocument();
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

// A janela do responsável e a indicação no cartão «Fim do contrato» já não são de memória: estão testadas, com a base
// simulada, em components/rh-exemplo/fimContrato/fimContratoResponsavel.test.tsx.

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

  it("não há «visão da pessoa» do custo: a pessoa não vê o seu custo e a ficha só tem a vista do RH", () => {
    const ficha = abrirCusto();
    expect(within(ficha).queryByRole("button", { name: "Visão da pessoa" })).not.toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: "Registar valor" })).toBeInTheDocument();
    expect(within(ficha).getByText("Custo total do mês")).toBeInTheDocument();
  });
});
