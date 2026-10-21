// O Recursos Humanos no protótipo (grupo "Recursos Humanos" do menu lateral): os ecrãs de RH de exemplo (src/pages/rh-exemplo) numa moldura do
// protótipo, só com dados de teste em memória. Aqui prova-se que abre e mostra os dados, que se cria e edita uma pessoa e um centro de teste,
// que nada fala com a base (o cliente Supabase rebenta se alguém o importar) e a acessibilidade básica do menu e do painel.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Se algum módulo do caminho do RH importar o cliente da base, a importação rebenta e o teste falha.
vi.mock("@/integrations/supabase/client", () => { throw new Error("O protótipo de RH não pode importar o cliente Supabase"); });
vi.mock("@supabase/supabase-js", () => { throw new Error("O protótipo de RH não pode importar o supabase-js"); });

import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import MenuRh from "./MenuRh";
import RhPagina from "./RhPagina";
import { ABAS_RH, type AbaRh } from "./abas";
import { esquecerRh } from "./loja";

const LENTO = 30000;

function Casa({ inicio = "pessoas" as AbaRh }) {
  const [aba, setAba] = useState<AbaRh>(inicio);
  return <><MenuRh aba={aba} aoIr={setAba} iniciarAberto /><RhPagina aba={aba} aoMudarAba={setAba} /></>;
}
const h1 = (): string => document.querySelector("#rh-painel h1")?.textContent ?? "";

beforeAll(() => {
  // O Radix Select e o interruptor precisam de APIs que o jsdom não traz.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  localStorage.clear(); localStorage.setItem("language", "pt");
  esquecerRh();
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("RH no protótipo: abre e mostra os dados de teste", () => {
  it("a aba Pessoas abre com o selo de dados de exemplo e as pessoas de teste", async () => {
    render(<RhPagina aba="pessoas" aoMudarAba={() => undefined} />);
    expect(await screen.findByText("Dados de exemplo", undefined, { timeout: 15000 })).toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getByText("Marta Figueiredo")).toBeInTheDocument();
    expect(within(tabela).getByText("Rui Amaral")).toBeInTheDocument();
    expect(document.getElementById("rh-painel")).not.toBeNull();
  }, LENTO);

  it("cada ecrã do menu abre com o seu título (nenhum fica em branco nem rebenta)", async () => {
    expect(ABAS_RH.length).toBeGreaterThanOrEqual(11);
    for (const a of ABAS_RH) {
      const { unmount } = render(<RhPagina aba={a.k} aoMudarAba={() => undefined} />);
      await waitFor(() => expect(h1().length, a.k).toBeGreaterThan(0), { timeout: 15000 });
      unmount();
    }
  }, 120000);

  it("trocar de aba no menu muda o ecrã e marca a entrada aberta com aria-current", async () => {
    render(<Casa />);
    await screen.findByText("Dados de exemplo", undefined, { timeout: 15000 });
    const menu = screen.getByTestId("menu-rh");
    fireEvent.click(within(menu).getByRole("button", { name: /^Centros/ }));
    await waitFor(() => expect(document.querySelector("#rh-painel h1")?.textContent).toMatch(/centros/i), { timeout: 15000 });
    expect(within(menu).getByRole("button", { name: /^Centros/ })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("button", { name: /^Pessoas/ })).not.toHaveAttribute("aria-current");
  }, LENTO);

  it("um ecra que navega para outra aba chega ao destino exacto: clicar numa pessoa na Organizacao abre a ficha, nao a lista", async () => {
    render(<Casa inicio="organizacao" />);
    const cartao = (await screen.findAllByText("Marta Figueiredo", undefined, { timeout: 15000 }))[0];
    fireEvent.click(cartao);
    const menu = screen.getByTestId("menu-rh");
    await waitFor(() => expect(within(menu).getByRole("button", { name: /^Pessoas/ })).toHaveAttribute("aria-current", "page"), { timeout: 15000 });
    expect(await screen.findByRole("heading", { level: 1, name: "Marta Figueiredo" }, { timeout: 15000 })).toBeInTheDocument();
  }, LENTO);

  it("a mudanca de aba e anunciada numa regiao de estado, sem mexer no foco", async () => {
    render(<Casa />);
    await screen.findByText("Dados de exemplo", undefined, { timeout: 15000 });
    const anuncio = screen.getByTestId("rh-anuncio");
    expect(anuncio).toHaveAttribute("role", "status");
    const entrada = within(screen.getByTestId("menu-rh")).getByRole("button", { name: /^Centros/ });
    entrada.focus();
    fireEvent.click(entrada);
    await waitFor(() => expect(anuncio.textContent).toMatch(/Centros de trabalho/));
    expect(entrada).toHaveFocus();
  }, LENTO);
});

describe("RH no protótipo: criar e editar dados de teste", () => {
  const painel = () => screen.getByRole("dialog");
  const campo = (id: string) => document.getElementById(id) as HTMLInputElement;
  const irParaAba = (nome: RegExp | string) => fireEvent.mouseDown(within(painel()).getByRole("tab", { name: nome }), { button: 0 });
  const escrever = (id: string, valor: string) => fireEvent.change(campo(id), { target: { value: valor } });
  function escolher(rotulo: RegExp | string, opcao: RegExp | string) {
    const gatilho = within(painel()).getByRole("combobox", { name: rotulo });
    fireEvent.keyDown(gatilho, { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: opcao }));
  }

  it("cria uma pessoa de teste, vê-a na lista na hora e edita-lhe um dado na ficha", async () => {
    render(<RhPagina aba="pessoas" aoMudarAba={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Nova pessoa" }, { timeout: 15000 }));
    escrever("hr-novo-primeiro-nome", "Teresa");
    escrever("hr-novo-apelido", "Nogueira");
    irParaAba(/Contacto e morada/);
    escrever("hr-novo-email-pessoal", "teresa@exemplo.pt");
    irParaAba(/Contrato e local/);
    escolher(/^Cargo/, /Vendedor/);
    escolher(/^Tipo de contrato/, /Sem termo/);
    irParaAba(/Retribuição e bancário/);
    escrever("hr-novo-subsidio", "7,63");
    escolher(/^Subsidios em duodecimos/, /^50 %/);
    fireEvent.click(within(painel()).getByRole("button", { name: "Criar e enviar convite" }));
    const titulo = await screen.findByRole("heading", { level: 1, name: "Teresa Nogueira" });
    const ficha = titulo.closest<HTMLElement>('[role="dialog"]') as HTMLElement;
    expect(Object.values(lerEstado().fichas).some((f) => JSON.stringify(f).includes("Teresa"))).toBe(true);

    // editar: mudar o telemóvel pessoal na ficha, gravar, e ver o novo valor no estado de teste
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Detalhes pessoais/ }), { button: 0 });
    await waitFor(() => expect(document.getElementById("hr-telefone-pessoal")).not.toBeNull());
    fireEvent.change(document.getElementById("hr-telefone-pessoal") as HTMLInputElement, { target: { value: "912345678" } });
    fireEvent.click(within(ficha).getAllByRole("button", { name: /^(Atualizar|Actualizar|Guardar|Gravar|Update|Save)/ })[0]);
    await waitFor(() => expect(JSON.stringify(lerEstado().fichas)).toContain("912345678"), { timeout: 10000 });
  }, 60000);

  it("cria, edita e desativa um centro de trabalho de teste", async () => {
    render(<RhPagina aba="centros" aoMudarAba={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /Novo centro/ }, { timeout: 15000 }));
    await screen.findByRole("dialog");
    const nome = document.getElementById("centro-nome") as HTMLInputElement;
    fireEvent.change(nome, { target: { value: "Armazém de Teste" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Guardar/ }));
    const linha = await screen.findByText("Armazém de Teste");
    expect(linha).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Editar.*Armazém de Teste/ }));
    await screen.findByRole("dialog");
    const nome2 = document.getElementById("centro-nome") as HTMLInputElement;
    fireEvent.change(nome2, { target: { value: "Armazém Renomeado" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Guardar/ }));
    expect(await screen.findByText("Armazém Renomeado")).toBeInTheDocument();
    expect(screen.queryByText("Armazém de Teste")).toBeNull();
  }, 60000);
});

describe("RH no protótipo: nenhum pedido à base", () => {
  it("abrir todos os ecrãs não faz nenhum fetch (e o cliente da base nunca é importado: o mock rebentaria)", async () => {
    const fetchEspiao = vi.spyOn(globalThis, "fetch");
    for (const a of ABAS_RH) {
      const { unmount } = render(<RhPagina aba={a.k} aoMudarAba={() => undefined} />);
      await waitFor(() => expect(h1().length, a.k).toBeGreaterThan(0), { timeout: 15000 });
      unmount();
    }
    expect(fetchEspiao).not.toHaveBeenCalled();
  }, 120000);
});

describe("RH no protótipo: acessibilidade básica", () => {
  it("o grupo do menu é um botão com aria-expanded e aria-controls, abre e fecha, e as entradas são botões nativos com nome", () => {
    render(<MenuRh aba={null} aoIr={() => undefined} />);
    const grupo = screen.getByTestId("menu-rh");
    const botao = within(grupo).getByRole("button", { name: "Recursos Humanos" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(botao.tagName).toBe("BUTTON");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(botao.getAttribute("aria-controls") ?? "")).not.toBeNull();
    const entradas = within(grupo).getAllByRole("button").filter((b) => b !== botao);
    expect(entradas.length).toBe(ABAS_RH.length);
    for (const e of entradas) {
      expect(e.tagName).toBe("BUTTON");
      expect(e.textContent?.trim().length).toBeGreaterThan(0);
      expect(e).not.toHaveAttribute("tabindex", "-1");
    }
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "false");
  });

  it("o menu e uma navegacao com nome e as entradas estao em grupos com nome; os alvos de toque tem 44px", () => {
    render(<MenuRh aba={null} aoIr={() => undefined} iniciarAberto />);
    const grupo = screen.getByTestId("menu-rh");
    const nav = within(grupo).getByRole("navigation", { name: "Recursos Humanos" });
    const gestao = within(nav).getByRole("group", { name: "Gestão" });
    const eu = within(nav).getByRole("group", { name: "A minha área" });
    expect(within(gestao).getAllByRole("button").length + within(eu).getAllByRole("button").length).toBe(ABAS_RH.length);
    for (const b of within(nav).getAllByRole("button")) expect(b.className).toContain("min-h-11");
  });

  it("o menu fala inglês quando a língua é inglês, sem emoji", () => {
    localStorage.setItem("language", "en");
    render(<MenuRh aba={null} aoIr={() => undefined} iniciarAberto />);
    const grupo = screen.getByTestId("menu-rh");
    expect(within(grupo).getByRole("button", { name: "Human Resources" })).toBeInTheDocument();
    expect(within(grupo).getByRole("button", { name: /^People/ })).toBeInTheDocument();
    expect(grupo.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("o painel é uma região com nome, o ecrã tem um h1 e o foco não se perde ao mudar de aba", async () => {
    render(<Casa />);
    await screen.findByText("Dados de exemplo", undefined, { timeout: 15000 });
    const regiao = screen.getByRole("region", { name: /Recursos Humanos/ });
    expect(regiao.id).toBe("rh-painel");
    expect(regiao.querySelectorAll("h1").length).toBe(1);
    const entrada = within(screen.getByTestId("menu-rh")).getByRole("button", { name: /^Organização/ });
    entrada.focus();
    fireEvent.click(entrada);
    expect(entrada).toHaveFocus();
  }, LENTO);
});
