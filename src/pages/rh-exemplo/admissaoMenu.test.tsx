// Arranque do acesso às admissões de exemplo: a entrada «Admissões» do menu (e a ligação direta ao separador), o realce que
// não deixa «Pessoas» e «Admissões» ativos ao mesmo tempo, o índice «Ver o Portal do colaborador (exemplo)» com os oito
// estados, o endereço antigo que redireciona e a faixa de volta. Tudo em memória, sem base.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { menuSections } from "@/components/sidebar/menuConfig";
import { itemAtivo } from "@/components/sidebar/itemAtivo";
import { ContadorAdmissoes } from "@/components/sidebar/ContadorAdmissoes";
import { ESTADOS_CONVITE } from "@/components/rh-exemplo/convite/estadosConvite";
import { aprovarFicha } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { repor } from "@/components/rh-exemplo/dados/loja";
import PessoasRh from "./PessoasRh";
import RhAdmissaoIndice from "./RhAdmissaoIndice";
import RhConviteAdmissao from "./RhConviteAdmissao";
import RhPortalColaborador from "./RhPortalColaborador";

const grupo = () => menuSections.find((s) => s.id === "rh-exemplo")!;
const entrada = (to: string) => grupo().items.find((i) => i.to === to)!;

const renderEm = (endereco: string, extra?: JSX.Element) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
          <Route path="/rh-exemplo/admissao" element={<RhAdmissaoIndice />} />
          <Route path="/rh-exemplo/admissao/:token" element={<RhConviteAdmissao />} />
          <Route path="/rh-exemplo/portal-colaborador/:token" element={<RhPortalColaborador />} />
        </Routes>
        {extra}
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  repor();
});

describe("o menu de RH de exemplo", () => {
  it("tem «Admissões» logo a seguir a «Pessoas» e «Ver o Portal do colaborador (exemplo)», sem perder as entradas de antes", () => {
    const destinos = grupo().items.map((i) => i.to);
    expect(destinos.slice(0, 2)).toEqual(["/rh-exemplo/pessoas", "/rh-exemplo/pessoas?tab=admissoes"]);
    expect(destinos).toEqual([
      "/rh-exemplo/pessoas", "/rh-exemplo/pessoas?tab=admissoes", "/rh-exemplo/organizacao", "/rh-exemplo/assiduidade-e-ausencias", "/rh-exemplo/centros",
      "/rh-exemplo/documentos/modelos", "/rh-exemplo/processamento-salarial", "/rh-exemplo/custos", "/rh-exemplo/denuncias", "/rh-exemplo/admissao",
    ]);
    expect(entrada("/rh-exemplo/pessoas?tab=admissoes").labelKey).toBe("sidebar.rhExemploAdmissoes");
    expect(entrada("/rh-exemplo/admissao").labelKey).toBe("sidebar.rhExemploVerComoPessoa");
    expect(grupo().items.every((i) => i.permission === "users.view")).toBe(true);
  });

  it("a ligação de «Admissões» abre a lista já no separador «Admissões», e a de «Pessoas» no separador Pessoas", () => {
    renderEm(entrada("/rh-exemplo/pessoas?tab=admissoes").to);
    expect(screen.getByRole("tab", { selected: true, name: /Admissões/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Por aprovar (1)" })).toBeInTheDocument();
    cleanup();
    renderEm(entrada("/rh-exemplo/pessoas").to);
    expect(screen.getByRole("tab", { selected: true, name: /Pessoas/ })).toBeInTheDocument();
  });

  it("trocar de separador mantém o parâmetro do endereço", () => {
    renderEm("/rh-exemplo/pessoas?tab=admissoes");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Cargos/ }), { button: 0 });
    expect(screen.getByRole("tab", { selected: true, name: /Cargos/ })).toBeInTheDocument();
  });

  it("«Pessoas» e «Admissões» nunca ficam ativos ao mesmo tempo", () => {
    const pessoas = entrada("/rh-exemplo/pessoas");
    const admissoes = entrada("/rh-exemplo/pessoas?tab=admissoes");
    const casos: Array<[string, string, boolean, boolean]> = [
      ["/rh-exemplo/pessoas", "", true, false],
      ["/rh-exemplo/pessoas", "?tab=pessoas", true, false],
      ["/rh-exemplo/pessoas", "?tab=admissoes", false, true],
      ["/rh-exemplo/pessoas/p-marco", "?tab=admissoes", false, true],
      ["/rh-exemplo/pessoas/p-marco", "", true, false],
      ["/rh-exemplo/pessoas", "?tab=cargos", true, false],
      ["/rh-exemplo/centros", "", false, false],
    ];
    for (const [caminho, pesquisa, quemPessoas, quemAdmissoes] of casos) {
      expect(itemAtivo(pessoas, caminho, pesquisa), `Pessoas em ${caminho}${pesquisa}`).toBe(quemPessoas);
      expect(itemAtivo(admissoes, caminho, pesquisa), `Admissões em ${caminho}${pesquisa}`).toBe(quemAdmissoes);
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

  it("o contador de «Admissões» é texto e acompanha as admissões por aprovar", () => {
    render(<LanguageProvider><ContadorAdmissoes /></LanguageProvider>);
    expect(screen.getByText("1 por aprovar")).toBeInTheDocument();
    act(() => void aprovarFicha("p-marco"));
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
