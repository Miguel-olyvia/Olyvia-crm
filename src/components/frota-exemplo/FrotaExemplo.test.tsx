// A Frota de exemplo na app real (/frota/*): abre as viaturas e a ficha (8 abas), recusa uma atribuição a quem não tem
// carta, recusa km que descem, os cartões do Hoje abrem listas filtradas, sem inventory.edit fica só de consulta, a base
// de exemplo é própria (não a do protótipo) e por organização, as ações não mexem no perfil simulado do protótipo, as obras
// abrem nas Operações, cancelar/resolver pedem confirmação e o grupo Frota está no menu lateral a seguir ao Inventário.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { menuSections } from "@/components/sidebar/menuConfig";
import FrotaExemplo from "@/pages/frota-exemplo/FrotaExemplo";
import { esquecerPerfilFrota, lerPerfilFrota, mudarPerfilFrota } from "@/pages/prototipo-negocios/frota/perfil";
import { chaveFrotaExemplo, definirOrganizacaoFrotaExemplo, executarFrotaExemplo, lerFrotaExemplo, reporFrotaExemplo } from "./dados/loja";
import { linkObra } from "./dados/exemplo";
import { gravarRenovar } from "./dados";
import { segundaFeira } from "./ecras/AtribuicoesFrota";
import type { EcraFrota } from "./contexto";

const TODAS = ["inventory.view", "inventory.edit", "warehouses.view", "users.view", "operations.view", "scheduling.view"];
let permissoes = new Set(TODAS);
let aCarregar = false;
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => !aCarregar && permissoes.has(p),
    hasAnyPermission: (l: string[]) => !aCarregar && l.some((p) => permissoes.has(p)),
    permissions: aCarregar ? [] : [...permissoes],
    loading: aCarregar,
  }),
}));
const ORG = "org-teste";
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-teste" }, isLoading: false }) }));

const ECRAS: EcraFrota[] = ["hoje", "viaturas", "atribuicoes", "condutores", "manutencao", "custos", "ocorrencias", "documentos", "relatorios", "ligacoes"];
const abrirEm = (caminho: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[caminho]}>
        <Routes>
          {ECRAS.map((e) => <Route key={e} path={`/frota/${e}`} element={<FrotaExemplo key={e} ecra={e} />} />)}
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
const titulo = (): string => screen.getByRole("heading", { level: 1 }).textContent ?? "";

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("language", "pt");
  permissoes = new Set(TODAS);
  aCarregar = false;
  esquecerPerfilFrota();
  definirOrganizacaoFrotaExemplo(ORG);
  reporFrotaExemplo();
});
afterEach(() => { cleanup(); window.localStorage.clear(); esquecerPerfilFrota(); });

describe("Frota de exemplo: ecrãs e ficha", () => {
  it("todos os ecrãs abrem com o título, o selo e o aviso de dados de exemplo, sem chaves por traduzir", () => {
    for (const e of ECRAS) {
      abrirEm(`/frota/${e}`);
      expect(titulo()).toContain("Dados de exemplo");
      expect(screen.getByTestId("frota-aviso-exemplo")).toHaveTextContent("A Frota ainda não tem tabelas");
      expect(document.body.textContent ?? "").not.toMatch(/\b(?:sidebar|frotaExemplo)\.[A-Za-z]+/);
      cleanup();
    }
  });

  it("abre /frota/viaturas, a ficha da AA-12-BC com 8 abas e o stock da carrinha", async () => {
    abrirEm("/frota/viaturas");
    expect(titulo()).toMatch(/^Viaturas/);
    fireEvent.click(screen.getByRole("row", { name: "Abrir a AA-12-BC" }));
    const ficha = await screen.findByRole("dialog");
    expect(within(ficha).getByRole("heading", { name: /AA-12-BC.*Renault Master 2\.3 dCi Furgão L2H2/ })).toBeInTheDocument();
    const abas = within(ficha).getAllByRole("tab");
    expect(abas.map((a) => a.textContent)).toEqual(["Resumo", "Atribuições", "Manutenção", "Custos", "Ocorrências", "Documentos", "Stock na carrinha", "Ligações"]);
    fireEvent.click(within(ficha).getByRole("tab", { name: "Stock na carrinha" }));
    expect(within(ficha).getByText("Tubo multicamada 16 mm (metro)")).toBeInTheDocument();
    expect(within(ficha).getByRole("link", { name: /Ver os armazéns no Inventário/ })).toHaveAttribute("href", "/warehouses");
    fireEvent.click(within(ficha).getByRole("tab", { name: "Ligações" }));
    expect(within(ficha).getByRole("link", { name: /Abrir a Agenda/ })).toHaveAttribute("href", "/scheduling");
  });

  it("recusa a atribuição a quem não tem carta e não grava nada", async () => {
    abrirEm("/frota/hoje");
    const antes = lerFrotaExemplo().atrib.length;
    fireEvent.click(screen.getByRole("button", { name: "Nova atribuição" }));
    const dlg = await screen.findByRole("dialog", { name: "Atribuir viatura" });
    fireEvent.change(within(dlg).getByLabelText("Viatura"), { target: { value: "v7" } });
    fireEvent.change(within(dlg).getByLabelText("Condutor"), { target: { value: "p7" } });
    fireEvent.change(within(dlg).getByLabelText("Tipo"), { target: { value: "pontual" } });
    fireEvent.change(within(dlg).getByLabelText("Início"), { target: { value: "2026-10-17" } });
    fireEvent.change(within(dlg).getByLabelText("Fim"), { target: { value: "2026-10-18" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(within(dlg).getAllByText("Paulo Mota não tem carta de condução registada no RH.").length).toBeGreaterThan(0));
    expect(within(dlg).getByLabelText("Condutor")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog", { name: "Atribuir viatura" })).toBeInTheDocument();
    expect(lerFrotaExemplo().atrib.length).toBe(antes);
    // com um condutor com carta, a reserva grava (na base de exemplo própria, não na do protótipo)
    fireEvent.change(within(dlg).getByLabelText("Condutor"), { target: { value: "p8" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Atribuir viatura" })).toBeNull());
    expect(lerFrotaExemplo().atrib.length).toBe(antes + 1);
    expect(screen.getByTestId("aviso-frota")).toHaveTextContent("BX-55-RT atribuída a Sofia Martins.");
    expect(window.localStorage.getItem(chaveFrotaExemplo(ORG))).not.toBeNull();
    expect(window.localStorage.getItem("olyvia-frota-exemplo")).toBeNull();
    expect(window.localStorage.getItem("olyvia-prototipo-frota")).toBeNull();
  });

  it("km que descem dão erro e não mudam a viatura; km válidos gravam", async () => {
    abrirEm("/frota/viaturas");
    fireEvent.click(screen.getByRole("row", { name: "Abrir a AA-12-BC" }));
    const ficha = await screen.findByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Registar km" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar km" });
    fireEvent.change(within(dlg).getByLabelText("Km no conta-quilómetros"), { target: { value: "1000" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Registar" }));
    expect(await within(dlg).findByText(/Os km não podem descer\. Última leitura: 148.230 km\./)).toBeInTheDocument();
    expect(lerFrotaExemplo().viaturas.find((v) => v.id === "v1")?.km).toBe(148230);
    fireEvent.change(within(dlg).getByLabelText("Km no conta-quilómetros"), { target: { value: "148500" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Registar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registar km" })).toBeNull());
    expect(lerFrotaExemplo().viaturas.find((v) => v.id === "v1")?.km).toBe(148500);
  });

  it("um cartão do Hoje abre a lista já filtrada", async () => {
    abrirEm("/frota/hoje");
    fireEvent.click(screen.getByRole("button", { name: /Documentos vencidos/ }));
    await waitFor(() => expect(titulo()).toMatch(/^Documentos/));
    expect(screen.getByRole("button", { name: /^Vencidos/ })).toHaveAttribute("aria-pressed", "true");
    // a IPO da 12-TT-90 venceu a 05/10
    expect(screen.getByRole("button", { name: "Renovar Inspeção (IPO) da 12-TT-90" })).toBeInTheDocument();
  });

  it("sem inventory.edit é só de consulta: os botões de escrita não abrem diálogos", () => {
    permissoes = new Set(["inventory.view"]);
    abrirEm("/frota/hoje");
    const botao = screen.getByRole("button", { name: "Nova atribuição" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(botao);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/Só consulta/)).toBeInTheDocument();
  });
});

describe("Frota de exemplo: correções", () => {
  it("uma ação em /frota corre como gestor e não muda o perfil simulado do protótipo", async () => {
    mudarPerfilFrota("tecnico");
    // o técnico do protótipo não pode renovar documentos; na app real a ação passa (decide a permissão real)
    const r = executarFrotaExemplo((G) => gravarRenovar(G, { vid: "v4", k: "ipo", data: "2027-10-05", valor: "" }));
    expect(r.ok).toBe(true);
    expect(lerPerfilFrota()).toBe("tecnico");
    // e pela UI: registar km na ficha
    abrirEm("/frota/viaturas");
    fireEvent.click(screen.getByRole("row", { name: "Abrir a 45-XZ-78" }));
    const ficha = await screen.findByRole("dialog");
    fireEvent.click(within(ficha).getByRole("button", { name: "Registar km" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar km" });
    fireEvent.change(within(dlg).getByLabelText("Km no conta-quilómetros"), { target: { value: "61500" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Registar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Registar km" })).toBeNull());
    expect(lerFrotaExemplo().viaturas.find((v) => v.id === "v2")?.km).toBe(61500);
    expect(lerPerfilFrota()).toBe("tecnico");
  });

  it("as obras abrem nas Operações (lista, por serem de exemplo) e sem operations.view são texto", () => {
    expect(linkObra(1022)).toBe("/operacao/obras");
    expect(linkObra("OB-77", true)).toBe("/operacao/obras/OB-77");
    abrirEm("/frota/hoje");
    const ligacoes = screen.getAllByRole("link", { name: "Obra #1022" });
    expect(ligacoes.length).toBeGreaterThan(0);
    for (const l of ligacoes) {
      expect(l).toHaveAttribute("href", "/operacao/obras");
      expect(l.getAttribute("title")).toMatch(/obra de exemplo/);
    }
    cleanup();
    permissoes = new Set(TODAS.filter((p) => p !== "operations.view"));
    abrirEm("/frota/hoje");
    expect(screen.queryAllByRole("link", { name: "Obra #1022" })).toHaveLength(0);
    expect(screen.getAllByText("Obra #1022").length).toBeGreaterThan(0);
  });

  it("enquanto as permissões carregam não diz 'Só consulta' e os botões dizem que estão a carregar", () => {
    aCarregar = true;
    abrirEm("/frota/hoje");
    expect(screen.queryByText(/Só consulta/)).toBeNull();
    const botao = screen.getByRole("button", { name: "Nova atribuição" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAttribute("title", "A carregar permissões…");
  });

  it("cancelar uma reserva pede confirmação", async () => {
    abrirEm("/frota/atribuicoes?vista=res");
    const antes = lerFrotaExemplo().atrib.length;
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);
    const conf = await screen.findByRole("alertdialog", { name: "Cancelar a reserva" });
    fireEvent.click(within(conf).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(lerFrotaExemplo().atrib.length).toBe(antes);
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar reserva" }));
    await waitFor(() => expect(lerFrotaExemplo().atrib.length).toBe(antes - 1));
  });

  it("marcar uma ocorrência resolvida pede confirmação", async () => {
    abrirEm("/frota/ocorrencias");
    fireEvent.click(screen.getAllByRole("button", { name: "Marcar resolvida" })[0]);
    const conf = await screen.findByRole("alertdialog", { name: "Marcar a ocorrência como resolvida" });
    fireEvent.click(within(conf).getByRole("button", { name: "Marcar resolvida" }));
    await waitFor(() => expect(screen.getByTestId("aviso-frota")).toHaveTextContent("Ocorrência marcada como resolvida."));
  });

  it("a semana do calendário começa na segunda-feira de HOJE", () => {
    expect(segundaFeira("2026-10-14")).toBe("2026-10-12");
    expect(segundaFeira("2026-10-12")).toBe("2026-10-12");
    expect(segundaFeira("2026-10-18")).toBe("2026-10-12");
  });

  it("a base é por organização e recarrega quando outro separador grava a mesma chave", async () => {
    abrirEm("/frota/viaturas");
    const outra = structuredClone(lerFrotaExemplo());
    outra.viaturas = outra.viaturas.filter((v) => v.mat !== "AA-12-BC");
    const valor = JSON.stringify(outra);
    window.localStorage.setItem(chaveFrotaExemplo(ORG), valor);
    window.dispatchEvent(new StorageEvent("storage", { key: chaveFrotaExemplo(ORG), newValue: valor }));
    await waitFor(() => expect(screen.queryByRole("row", { name: "Abrir a AA-12-BC" })).toBeNull());
    // outra organização tem a sua base (os dados de exemplo de origem)
    definirOrganizacaoFrotaExemplo("outra-org");
    expect(lerFrotaExemplo().viaturas.some((v) => v.mat === "AA-12-BC")).toBe(true);
    definirOrganizacaoFrotaExemplo(ORG);
  });

  it("a pesquisa é uma caixa combinada que fecha ao clicar fora", () => {
    abrirEm("/frota/hoje");
    const caixa = screen.getByRole("combobox", { name: "Procurar na frota" });
    fireEvent.change(caixa, { target: { value: "master" } });
    expect(caixa).toHaveAttribute("aria-expanded", "true");
    const lista = document.getElementById(caixa.getAttribute("aria-controls")!)!;
    expect(lista).toHaveAttribute("role", "listbox");
    expect(within(lista).getByRole("option", { name: /AA-12-BC/ })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(caixa).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Frota no menu lateral", () => {
  it("é um grupo a seguir ao Inventário, com a permissão inventory.view e o prefixo /frota só seu", () => {
    const i = menuSections.findIndex((s) => s.id === "inventory");
    const frota = menuSections[i + 1];
    expect(frota.id).toBe("frota-exemplo");
    expect(frota.labelKey).toBe("sidebar.frotaExemplo");
    expect(frota.items.map((x) => x.to)).toEqual(ECRAS.map((e) => `/frota/${e}`));
    expect(frota.items.every((x) => x.permission === "inventory.view")).toBe(true);
    for (const s of menuSections) if (s.id !== "frota-exemplo") expect(s.paths.some((p) => p.startsWith("/frota") || "/frota/hoje".startsWith(p + "/"))).toBe(false);
  });
});
