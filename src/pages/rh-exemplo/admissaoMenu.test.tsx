// Arranque do acesso às admissões de exemplo: o menu sem entrada «Admissões» (o separador da lista de Pessoas continua a abrir
// por `?tab=admissoes` e a mostrar o contador), o realce de «Pessoas», o índice «Ver o Portal do colaborador (exemplo)» com os
// oito estados, o endereço antigo que redireciona e a faixa de volta. Tudo em memória, sem base.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";

vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

import { renderRh, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";
import { menuSections } from "@/components/sidebar/menuConfig";
import { itemAtivo } from "@/components/sidebar/itemAtivo";
import { ESTADOS_CONVITE } from "@/components/rh-exemplo/convite/estadosConvite";
import { repor } from "@/components/rh-exemplo/dados/loja";
import PessoasRh from "./PessoasRh";
import RhAdmissaoIndice from "./RhAdmissaoIndice";
import RhConviteAdmissao from "./RhConviteAdmissao";
import RhPortalColaborador from "./RhPortalColaborador";

const grupo = () => menuSections.find((s) => s.id === "rh-exemplo")!;
const entrada = (to: string) => grupo().items.find((i) => i.to === to)!;

const renderEm = (endereco: string) =>
  renderRh(
    <Routes>
      <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
      <Route path="/rh-exemplo/admissao" element={<RhAdmissaoIndice />} />
      <Route path="/rh-exemplo/admissao/:token" element={<RhConviteAdmissao />} />
      <Route path="/rh-exemplo/portal-colaborador/:token" element={<RhPortalColaborador />} />
    </Routes>,
    { rota: endereco },
  );

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
});

// A lista do pipeline vem da base (`rpc_hr_admissao_listar`); aqui o Supabase é simulado e devolve uma submetida e uma convidada.
const servirPipeline = () => {
  rhTeste.rpcs["rpc_hr_admissao_listar"] = {
    data: {
      itens: [
        { convite_id: "c-marco", pessoa_id: "p-marco", nome: "Marco Ventura", cargo: "Vendedor", estado: "submetida", estado_portal: "ativo", valid_until: "2099-01-01T10:00:00Z", submetido_em: null, devolvida_em: null, atualizado_em: null },
        { convite_id: "c-lara", pessoa_id: "p-lara", nome: "Lara Mendes", cargo: "Vendedor", estado: "convidada", estado_portal: "ativo", valid_until: "2099-01-01T10:00:00Z", submetido_em: null, devolvida_em: null, atualizado_em: null },
      ],
      contadores: { submetida: 1, convidada: 1 },
      seguinte: null,
    },
    error: null,
  };
};

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  reporRhTeste();
  rhTeste.permissoes = new Set(["hr.pessoas.convite.enviar", "hr.onboarding.approve"]);
  repor();
});

describe("o menu de RH de exemplo", () => {
  it("não tem «Admissões»: Pessoas, Organização e as restantes entradas, com «Ver o Portal do colaborador (exemplo)» no fim", () => {
    const destinos = grupo().items.map((i) => i.to);
    expect(destinos).toEqual([
      "/rh-exemplo/pessoas", "/rh-exemplo/organizacao", "/rh-exemplo/assiduidade-e-ausencias", "/rh-exemplo/centros",
      "/rh-exemplo/documentos/modelos", "/rh-exemplo/processamento-salarial", "/rh-exemplo/custos", "/rh-exemplo/denuncias", "/rh-exemplo/admissao",
    ]);
    expect(destinos.some((d) => d.includes("tab=admissoes"))).toBe(false);
    expect(grupo().items.some((i) => i.labelKey === "sidebar.rhExemploAdmissoes")).toBe(false);
    expect(grupo().items.some((i) => (i.textCounter as string | undefined) === "rhAdmissoesPorAprovar")).toBe(false);
    expect(entrada("/rh-exemplo/denuncias").textCounter).toBe("rhDenunciasPorConfirmar");
    expect(entrada("/rh-exemplo/admissao").labelKey).toBe("sidebar.rhExemploVerComoPessoa");
    expect(grupo().items.every((i) => i.permission === "users.view")).toBe(true);
  });

  it("a ligação direta ?tab=admissoes continua a abrir o pipeline de admissões (lido da base), e a de «Pessoas» o separador Pessoas", async () => {
    servirPipeline();
    renderEm("/rh-exemplo/pessoas?tab=admissoes");
    expect(screen.getByRole("tab", { selected: true, name: /Pipeline de admissões/ })).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Admissões" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Por rever\s*1$/ })).toBeInTheDocument();
    cleanup();
    renderEm(entrada("/rh-exemplo/pessoas").to);
    expect(screen.getByRole("tab", { selected: true, name: /Pessoas/ })).toBeInTheDocument();
  });

  it("trocar de separador mantém o parâmetro do endereço", async () => {
    servirPipeline();
    renderEm("/rh-exemplo/pessoas?tab=admissoes");
    await screen.findByRole("list", { name: "Admissões" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Cargos/ }), { button: 0 });
    expect(screen.getByRole("tab", { selected: true, name: /Cargos/ })).toBeInTheDocument();
  });

  it("«Pessoas» realça em qualquer separador da lista e na ficha, sem lógica especial para as admissões", () => {
    const pessoas = entrada("/rh-exemplo/pessoas");
    expect("inactiveWhenSearch" in pessoas).toBe(false);
    const casos: Array<[string, string, boolean]> = [
      ["/rh-exemplo/pessoas", "", true],
      ["/rh-exemplo/pessoas", "?tab=pessoas", true],
      ["/rh-exemplo/pessoas", "?tab=admissoes", true],
      ["/rh-exemplo/pessoas/p-marco", "?tab=admissoes", true],
      ["/rh-exemplo/pessoas/p-marco", "", true],
      ["/rh-exemplo/pessoas", "?tab=cargos", true],
      ["/rh-exemplo/centros", "", false],
      ["/rh-exemplo/organizacao", "", false],
    ];
    for (const [caminho, pesquisa, esperado] of casos) {
      expect(itemAtivo(pessoas, caminho, pesquisa), `Pessoas em ${caminho}${pesquisa}`).toBe(esperado);
    }
  });

  it("«Ver o Portal do colaborador» só realça no índice, não no ecrã de configuração da admissão", () => {
    const indice = entrada("/rh-exemplo/admissao");
    expect(itemAtivo(indice, "/rh-exemplo/admissao")).toBe(true);
    expect(itemAtivo(indice, "/rh-exemplo/admissao/configuracao")).toBe(false);
  });

  it("as outras entradas realçam como antes (caminho igual ou a começar por ele)", () => {
    const centros = entrada("/rh-exemplo/centros");
    expect(itemAtivo(centros, "/rh-exemplo/centros")).toBe(true);
    expect(itemAtivo(centros, "/rh-exemplo/centros/c1", "?x=1")).toBe(true);
    expect(itemAtivo(centros, "/rh-exemplo/centros-outros")).toBe(false);
  });

  it("o separador do pipeline mostra o contador em texto, vindo dos contadores da base, e só a quem pode ver admissões", async () => {
    servirPipeline();
    renderEm("/rh-exemplo/pessoas?tab=admissoes");
    const aba = () => screen.getByRole("tab", { name: /Pipeline de admissões/ });
    expect(await within(aba()).findByText(", 1 por aprovar")).toBeInTheDocument();
    cleanup();
    // Sem nenhuma das permissões de admissão o separador nem existe e o contador não aparece, mesmo que a base respondesse.
    rhTeste.permissoes = new Set();
    renderEm("/rh-exemplo/pessoas?tab=admissoes");
    expect(screen.queryByRole("tab", { name: /Pipeline de admissões/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/por aprovar/)).not.toBeInTheDocument();
  });
});

describe("o índice «Ver o Portal do colaborador (exemplo)»", () => {
  it("lista os 8 estados, cada um com pessoa de exemplo, o que a pessoa vê e «Abrir» para o portal do token certo", () => {
    renderEm("/rh-exemplo/admissao");
    expect(screen.getByRole("heading", { level: 1, name: /Ver o Portal do colaborador \(exemplo\)/ })).toBeInTheDocument();
    const cartoes = within(screen.getByRole("list", { name: "Estados do Portal do colaborador" })).getAllByRole("listitem");
    expect(cartoes).toHaveLength(8);
    expect(ESTADOS_CONVITE.map((e) => e.token)).toEqual(["lara", "exemplo", "devolvida", "submetida", "contrato", "assinado", "expirada", "revogada"]);
    for (const { token, pessoa } of ESTADOS_CONVITE) {
      const cartao = screen.getByTestId(`estado-${token}`);
      expect(within(cartao).getByRole("heading", { level: 2 }).textContent).toBeTruthy();
      expect(within(cartao).getByText(`Exemplo: ${pessoa}`)).toBeInTheDocument();
      expect(within(cartao).getByRole("link", { name: /^Abrir/ })).toHaveAttribute("href", `/rh-exemplo/portal-colaborador/${token}`);
    }
    expect(within(screen.getByTestId("estado-devolvida")).getByText(/Só os campos que o RH devolveu/)).toBeInTheDocument();
  });

  it("«Abrir» leva ao portal do token, no mesmo separador, sem login e sem o menu do CRM", () => {
    renderEm("/rh-exemplo/admissao");
    fireEvent.click(within(screen.getByTestId("estado-submetida")).getByRole("link", { name: /^Abrir/ }));
    expect(screen.getByRole("heading", { name: "À espera da decisão do RH" })).toBeInTheDocument();
    expect(screen.getByTestId("portal-colaborador")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: /Ver o Portal do colaborador/ })).not.toBeInTheDocument();
  });

  it("cada cartão abre o portal do seu estado: com as duas secções, ou o acesso terminado sem elas", () => {
    for (const { token } of ESTADOS_CONVITE) {
      renderEm("/rh-exemplo/admissao");
      fireEvent.click(within(screen.getByTestId(`estado-${token}`)).getByRole("link", { name: /^Abrir/ }));
      const terminado = token === "expirada" || token === "revogada";
      expect(screen.queryByRole("navigation", { name: "Secções do portal" }) === null, token).toBe(terminado);
      cleanup();
    }
  });
});

describe("o portal em exemplo", () => {
  it("o endereço antigo do link redireciona para o portal do mesmo token", () => {
    renderEm("/rh-exemplo/admissao/assinado");
    expect(screen.getByTestId("portal-colaborador")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Ficha de admissão" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Contrato assinado" })).toBeInTheDocument();
  });

  it("mostra a faixa «Pré-visualização de exemplo» com a ligação de volta ao índice", () => {
    renderEm("/rh-exemplo/portal-colaborador/assinado");
    const faixa = screen.getByTestId("faixa-previsualizacao");
    expect(within(faixa).getByText("Pré-visualização de exemplo")).toBeInTheDocument();
    fireEvent.click(within(faixa).getByRole("link", { name: /Voltar à lista de estados/ }));
    expect(screen.getByRole("heading", { level: 1, name: /Ver o Portal do colaborador/ })).toBeInTheDocument();
  });

  it("passa ao estado anterior e ao seguinte, e as pontas não têm ligação para fora da lista", () => {
    renderEm("/rh-exemplo/portal-colaborador/submetida");
    const faixa = screen.getByTestId("faixa-previsualizacao");
    expect(within(faixa).getByText("4 de 8")).toBeInTheDocument();
    expect(within(faixa).getByRole("link", { name: /Anterior/ })).toHaveAttribute("href", "/rh-exemplo/portal-colaborador/devolvida");
    expect(within(faixa).getByRole("link", { name: /Seguinte/ })).toHaveAttribute("href", "/rh-exemplo/portal-colaborador/contrato");
    cleanup();
    renderEm("/rh-exemplo/portal-colaborador/lara");
    expect(within(screen.getByTestId("faixa-previsualizacao")).queryByRole("link", { name: /Anterior/ })).not.toBeInTheDocument();
    cleanup();
    renderEm("/rh-exemplo/portal-colaborador/revogada");
    expect(within(screen.getByTestId("faixa-previsualizacao")).queryByRole("link", { name: /Seguinte/ })).not.toBeInTheDocument();
  });

  it("cada um dos 8 tokens abre o portal com a faixa", () => {
    for (const { token } of ESTADOS_CONVITE) {
      renderEm(`/rh-exemplo/portal-colaborador/${token}`);
      expect(screen.getByTestId("faixa-previsualizacao"), token).toBeInTheDocument();
      cleanup();
    }
  });
});
