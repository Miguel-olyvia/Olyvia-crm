// Arranque das abas da assiduidade («O meu ponto» e ficha de RH), da barra de abas da ficha (Custo sempre alcançável) e do
// menu de «A minha área». Tudo em memória, sem base. A data é fixa (14/10/2026) para os dados de exemplo serem os mesmos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O limite anual da pessoa vem do contrato real; aqui, sem base, vale o limite por omissão da organização.
vi.mock("@/components/rh-exemplo/fluxosC/limitePessoa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/rh-exemplo/fluxosC/limitePessoa")>()),
  useLimiteAnualMin: (_pessoaId: string, omissaoMin: number) => omissaoMin,
}));
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Tabs } from "@/components/ui/tabs";
import { menuSections } from "@/components/sidebar/menuConfig";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { abaAberta, abasVisiveis } from "@/components/rh-exemplo/assiduidadeAbas/abas";
import { ListaAbasFicha } from "@/components/rh-exemplo/ficha/ListaAbasFicha";
import { PessoaAssiduidadeTab } from "@/components/rh-exemplo/PessoaAssiduidadeTab";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";
import { rhExemploAbasTranslations } from "@/translations/rhExemploAbas";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import RhMeuPonto from "./RhMeuPonto";

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: false, picarOutros: false, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};

function Sonda() {
  return <span data-testid="sonda-url">{useLocation().search}</span>;
}

const noRouter = (endereco: string, padrao: string, elemento: JSX.Element) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes><Route path={padrao} element={elemento} /></Routes>
        <Sonda />
      </MemoryRouter>
    </LanguageProvider>,
  );

const meuPonto = (aba?: string) => noRouter(`/rh-exemplo/assiduidade${aba ? `?aba=${aba}` : ""}`, "/rh-exemplo/assiduidade", <RhMeuPonto />);
const escolher = (nome: RegExp | string) => fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 });
const selecionada = () => screen.getByRole("tab", { selected: true });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
  reporCusto();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("traduções das abas", () => {
  it("en e pt têm exactamente as mesmas chaves", () => {
    expect(Object.keys(rhExemploAbasTranslations.en).sort()).toEqual(Object.keys(rhExemploAbasTranslations.pt).sort());
  });
});

describe("regras das abas da assiduidade", () => {
  it("a própria pessoa com permissão de picar vê Picar e Justificações; o RH a ver outra pessoa não", () => {
    expect(abasVisiveis({ souAPessoa: true, podePicar: true, temBanco: false })).toEqual(["picar", "calendario", "horas-extra", "justificacoes"]);
    expect(abasVisiveis({ souAPessoa: false, podePicar: true, temBanco: false })).toEqual(["calendario", "horas-extra"]);
  });

  it("o banco de horas só existe para quem tem horário do tipo banco", () => {
    expect(abasVisiveis({ souAPessoa: false, podePicar: false, temBanco: true })).toEqual(["calendario", "horas-extra", "banco-horas"]);
    expect(abasVisiveis({ souAPessoa: false, podePicar: false, temBanco: false })).not.toContain("banco-horas");
  });

  it("uma aba pedida que não existe cai na primeira", () => {
    const visiveis = abasVisiveis({ souAPessoa: false, podePicar: false, temBanco: false });
    expect(abaAberta("horas-extra", visiveis)).toBe("horas-extra");
    expect(abaAberta("banco-horas", visiveis)).toBe("calendario");
    expect(abaAberta(null, visiveis)).toBe("calendario");
  });
});

describe("O meu ponto em abas", () => {
  it("abre em Picar com as quatro abas, contadores onde há coisas por tratar e sem banco de horas", () => {
    meuPonto();
    const abas = screen.getAllByRole("tab").map((a) => a.textContent ?? "");
    expect(abas).toHaveLength(4);
    expect(abas[0]).toMatch(/^Picar/);
    expect(abas[1]).toMatch(/^Calendário/);
    expect(abas[2]).toMatch(/^Horas extra/);
    expect(abas[3]).toMatch(/^Justificações/);
    expect(selecionada()).toHaveTextContent(/^Picar/);
    expect(screen.getByRole("button", { name: /Registar (entrada|saida|saída)/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Banco de horas/ })).not.toBeInTheDocument();
    // A Sofia tem uma marcação por justificar dentro do prazo: a aba mostra o número, para quem lê só com o ecrã e com o leitor.
    expect(screen.getByRole("tab", { name: /Justificações, 1 por justificar/ })).toBeInTheDocument();
  });

  it("trocar de aba mostra o conteúdo certo e guarda a aba no endereço", () => {
    meuPonto();
    escolher(/^Calendário/);
    expect(screen.getByRole("button", { name: /Mês anterior/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registar (entrada|saida|saída)/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("sonda-url")).toHaveTextContent("?aba=calendario");

    escolher(/^Horas extra/);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mês anterior/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("sonda-url")).toHaveTextContent("?aba=horas-extra");

    escolher(/^Justificações/);
    expect(screen.getByText("Esqueci-me de picar", { selector: "[class*='font-semibold']" })).toBeInTheDocument();
    expect(screen.getByTestId("rha-just-prazo")).toHaveTextContent(/Dias úteis que restam à justificação mais urgente: \d+/);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("a aba Horas extra mostra o limite da pessoa e a lista, e a ligação direta abre nela", () => {
    meuPonto("horas-extra");
    expect(selecionada()).toHaveTextContent(/^Horas extra/);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText(/rhFluxosC\./)).not.toBeInTheDocument();
  });

  it("uma aba desconhecida no endereço abre a primeira", () => {
    meuPonto("nao-existe");
    expect(selecionada()).toHaveTextContent(/^Picar/);
  });

  it("o teclado segue o padrão das abas: setas, Home e End", async () => {
    meuPonto();
    const primeira = screen.getByRole("tab", { name: /^Picar/ });
    primeira.focus();
    fireEvent.keyDown(primeira, { key: "ArrowRight" });
    await waitFor(() => expect(selecionada()).toHaveTextContent(/^Calendário/));
    expect(document.activeElement).toBe(selecionada());
    fireEvent.keyDown(selecionada(), { key: "End" });
    await waitFor(() => expect(selecionada()).toHaveTextContent(/^Justificações/));
    fireEvent.keyDown(selecionada(), { key: "Home" });
    await waitFor(() => expect(selecionada()).toHaveTextContent(/^Picar/));
  });
});

describe("a ficha: sub-abas da Assiduidade", () => {
  const abrirAssiduidade = (id: string) => {
    noRouter(`/rh-exemplo/pessoas/${id}`, "/rh-exemplo/pessoas/:id", <PessoaRhDetalhe />);
    const ficha = screen.getByRole("dialog");
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Planeamento/ }), { button: 0 });
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: "Assiduidade" }), { button: 0 });
    return ficha;
  };

  it("com horário de banco de horas há Calendário, Horas extra e Banco de horas, e as horas extra saem de baixo do calendário", () => {
    const ficha = abrirAssiduidade("p-rui");
    const grupo = within(ficha).getByRole("tablist", { name: "Secções da assiduidade" });
    expect(within(grupo).getByRole("tab", { name: /^Calendário/ })).toBeInTheDocument();
    expect(within(grupo).getByRole("tab", { name: /^Horas extra/ })).toBeInTheDocument();
    expect(within(grupo).getByRole("tab", { name: /^Banco de horas/ })).toBeInTheDocument();
    const painel = (nome: RegExp) => document.getElementById(within(grupo).getByRole("tab", { name: nome }).getAttribute("aria-controls") ?? "") as HTMLElement;
    expect(painel(/^Horas extra/)).not.toBeVisible();
    fireEvent.mouseDown(within(grupo).getByRole("tab", { name: /^Horas extra/ }), { button: 0 });
    expect(painel(/^Horas extra/)).toBeVisible();
    expect(within(painel(/^Horas extra/)).getByRole("progressbar")).toBeInTheDocument();
    expect(painel(/^Banco de horas/)).not.toBeVisible();
    fireEvent.mouseDown(within(grupo).getByRole("tab", { name: /^Banco de horas/ }), { button: 0 });
    expect(painel(/^Banco de horas/)).toBeVisible();
    expect(within(painel(/^Banco de horas/)).getByTestId("rhd-banco-ficha")).toBeInTheDocument();
  });

  it("com horário padrão não existe a sub-aba de banco de horas", () => {
    const ficha = abrirAssiduidade("p-sofia");
    const grupo = within(ficha).getByRole("tablist", { name: "Secções da assiduidade" });
    expect(within(grupo).getByRole("tab", { name: /^Calendário/ })).toBeInTheDocument();
    expect(within(grupo).getByRole("tab", { name: /^Horas extra/ })).toBeInTheDocument();
    expect(within(grupo).queryByRole("tab", { name: /Banco de horas/ })).not.toBeInTheDocument();
  });

  it("para outra pessoa, quem vê não tem Picar nem Justificações", () => {
    render(
      <LanguageProvider>
        <MemoryRouter><PessoaAssiduidadeTab pessoaId="p-rui" pessoaNome="Rui Amaral" souAPessoa={false} permissoes={TUDO} /></MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.getAllByRole("tab").map((a) => a.textContent)).toEqual([expect.stringMatching(/^Calendário/), expect.stringMatching(/^Horas extra/), expect.stringMatching(/^Banco de horas/)]);
  });
});

describe("a ficha: o separador Custo está sempre alcançável", () => {
  it("existe, é focável e abre", async () => {
    noRouter("/rh-exemplo/pessoas/p-tiago", "/rh-exemplo/pessoas/:id", <PessoaRhDetalhe />);
    const ficha = screen.getByRole("dialog");
    const custo = within(ficha).getByRole("tab", { name: "Custo" });
    custo.focus();
    expect(document.activeElement).toBe(custo);
    // Pelo teclado: «End» na primeira aba leva ao Custo, que fica ativo e com o foco.
    const primeira = within(ficha).getAllByRole("tab")[0];
    primeira.focus();
    fireEvent.keyDown(primeira, { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(custo));
    expect(custo).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(custo, { button: 0 });
    expect(within(ficha).getByRole("tab", { name: "Custo", selected: true })).toBeInTheDocument();
    expect(within(ficha).getByText("Custo total do mês")).toBeInTheDocument();
  });

  it("com a barra mais estreita do que as abas aparece a seta das abas seguintes e rola a barra", () => {
    const contadores = { contratos: 1, documentos: 2, ausenciasPorDecidir: 0 } as Parameters<typeof ListaAbasFicha>[0]["contadores"];
    render(
      <LanguageProvider>
        <Tabs value="visaoGeral"><ListaAbasFicha contadores={contadores} abaAtiva="visaoGeral" /></Tabs>
      </LanguageProvider>,
    );
    const lista = screen.getByRole("tablist");
    const medidas = { clientWidth: 640, scrollWidth: 900, scrollLeft: 0 };
    for (const [k, v] of Object.entries(medidas)) Object.defineProperty(lista, k, { value: v, configurable: true, writable: true });
    const rolar = vi.fn();
    Object.defineProperty(lista, "scrollBy", { value: rolar, configurable: true });
    expect(screen.queryByRole("button", { name: "Mostrar as abas seguintes" })).not.toBeInTheDocument();
    fireEvent.scroll(lista);
    const seguinte = screen.getByRole("button", { name: "Mostrar as abas seguintes" });
    expect(screen.queryByRole("button", { name: "Mostrar as abas anteriores" })).not.toBeInTheDocument();
    fireEvent.click(seguinte);
    expect(rolar).toHaveBeenCalledWith(expect.objectContaining({ left: 384 }));
    (lista as HTMLElement & { scrollLeft: number }).scrollLeft = 260;
    fireEvent.scroll(lista);
    expect(screen.getByRole("button", { name: "Mostrar as abas anteriores" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mostrar as abas seguintes" })).not.toBeInTheDocument();
  });
});

describe("A minha área: o menu", () => {
  const grupo = () => menuSections.find((s) => s.id === "rh-exemplo-eu");
  const gestao = () => menuSections.find((s) => s.id === "rh-exemplo");

  it("o menu já não tem «As minhas horas extra» nem «Os meus custos» em A minha área", () => {
    expect(grupo()?.items?.some((i) => i.to === "/rh-exemplo/minhas-horas-extra")).toBe(false);
    expect(grupo()?.paths).not.toContain("/rh-exemplo/minhas-horas-extra");
    expect(grupo()?.items?.some((i) => i.to === "/rh-exemplo/meus-custos")).toBe(false);
    expect(grupo()?.paths).not.toContain("/rh-exemplo/meus-custos");
    expect(grupo()?.items?.map((i) => i.to)).toEqual([
      "/rh-exemplo/documentos", "/rh-exemplo/ausencias", "/rh-exemplo/assiduidade", "/rh-exemplo/minhas-denuncias",
    ]);
  });

  it("o módulo «Custos» está no grupo de Recursos Humanos, com o caminho em `paths`", () => {
    expect(gestao()?.items?.some((i) => i.to === "/rh-exemplo/custos" && i.labelKey === "rhCustos.menu")).toBe(true);
    expect(gestao()?.paths).toContain("/rh-exemplo/custos");
  });
});
