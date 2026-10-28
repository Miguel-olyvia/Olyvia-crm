// Arranque dos fluxos novos da frente A: botões de configuração e separador Cargos, janela do responsável (fim de contrato)
// e separador Custo da ficha. Tudo em memória, sem base.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import RhConfiguracaoAdmissao from "./RhConfiguracaoAdmissao";
import RhRegrasFimContrato from "./RhRegrasFimContrato";
import { renderRh, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";

// A organização activa e o Supabase são os do ambiente simulado de RH (sem base).
vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

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
  renderRh(
    <Routes>
      <Route path="/rh-exemplo/pessoas/:id?" element={<PessoaRhDetalhe />} />
      <Route path="/rh-exemplo/admissao/configuracao" element={<RhConfiguracaoAdmissao />} />
      <Route path="/rh-exemplo/contratos/configuracao" element={<RhRegrasFimContrato />} />
    </Routes>,
    { rota: endereco },
  );

beforeAll(() => {
  // O grupo de opções «Como conta» (Radix) mede-se com o ResizeObserver, que o jsdom não traz.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  reporRhTeste();
  permissoes.concedidas = new Set(["hr.pessoas.create", "hr.admissao.obrigatorios.gerir", "hr.contratos.regras.gerir", "hr.pessoas.laborais.view"]);
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

  it("«Regras de fim de contrato» abre a página (lida da base), também com «Voltar a Pessoas»", async () => {
    renderEm("/rh-exemplo/pessoas");
    fireEvent.click(screen.getByRole("button", { name: "Regras de fim de contrato" }));
    expect(await screen.findByRole("link", { name: "Voltar a Pessoas" })).toHaveAttribute("href", "/rh-exemplo/pessoas");
  });

  it("o separador Cargos mostra que os cargos só se desativam", async () => {
    renderEm("/rh-exemplo/pessoas?tab=cargos");
    expect(screen.getByRole("tab", { name: "Cargos", selected: true })).toBeInTheDocument();
    expect(await screen.findByText(/Os cargos nunca se apagam/)).toBeInTheDocument();
  });
});

// A janela do responsável e a indicação no cartão «Fim do contrato» já não são de memória: estão testadas, com a base
// simulada, em components/rh-exemplo/fimContrato/fimContratoResponsavel.test.tsx.

describe("frente A: separador Custo da ficha", () => {
  // A ficha e o custo lêem-se da base (Supabase simulado): a pessoa vem de `pessoas`; o resto da base está vazio.
  const TIAGO = {
    id: "p-tiago", organization_id: "org-teste", numero_interno: "T1", primeiro_nome: "Tiago", apelido: "Pinheiro",
    nome_completo: "Tiago Pinheiro", email_trabalho: null, email_pessoal: null, telefone_trabalho: null, cargo: "Vendedor",
    cargo_id: null, local_trabalho: null, local_id: null, entidade_legal_org_id: null, reporta_a_pessoa_id: null,
    data_admissao: "2024-01-02", data_antiguidade: "2024-01-02", data_saida: null, fotografia_anexo_id: null,
    estado_registo: "activo", notas: null, created_at: "2024-01-02T00:00:00Z", updated_at: "2024-01-02T00:00:00Z",
  };

  const abrirCusto = async () => {
    rhTeste.respostas["pessoas"] = [TIAGO];
    renderEm("/rh-exemplo/pessoas/p-tiago");
    const ficha = await screen.findByRole("dialog");
    fireEvent.mouseDown(await within(ficha).findByRole("tab", { name: "Custo" }), { button: 0 });
    return ficha;
  };

  it("a ficha da pessoa lida da base abre no separador Custo, com o seletor do mês", async () => {
    const ficha = await abrirCusto();
    expect(within(ficha).getByRole("heading", { level: 1, name: /Tiago Pinheiro/ })).toBeInTheDocument();
    expect(within(ficha).getByRole("tab", { name: "Custo", selected: true })).toBeInTheDocument();
  });

  it("com a base vazia o separador mostra o custo do mês e os valores avulsos sem nada inventado", async () => {
    const ficha = await abrirCusto();
    expect(await within(ficha).findByText("Custo total do mês")).toBeInTheDocument();
    expect(within(ficha).getByText("Custo com os subsídios repartidos por 12 meses")).toBeInTheDocument();
    expect(within(ficha).getByRole("button", { name: "Registar valor" })).toBeInTheDocument();
    expect(within(ficha).queryByText("Visita ao cliente do Porto")).not.toBeInTheDocument();
    expect(within(ficha).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("não há «visão da pessoa» do custo: a ficha só tem a vista do RH", async () => {
    const ficha = await abrirCusto();
    await within(ficha).findByText("Custo total do mês");
    expect(within(ficha).queryByRole("button", { name: "Visão da pessoa" })).not.toBeInTheDocument();
  });
});
