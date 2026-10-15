// A Frota no ecrã: o grupo Frota do menu lateral só na V2 (abrir a Frota fecha o Inventário e vice-versa), abrir uma viatura, o stock da carrinha
// lido do Inventário com "Pedir reposição" a criar transferências, atribuir recusando uma carta inválida, registar km que descem (erro) e o perfil técnico.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PrototipoNegocios from "../PrototipoNegocios";
import { esquecerPessoas } from "../PessoasSimples";
import { esquecerPessoasFunc } from "../PessoasFunc";
import { esquecerNegociosFunc } from "../NegociosFunc";
import { esquecerDiaADia } from "../diaADia";
import { esquecerInventario, lerInventario } from "../inventario/loja";
import { esquecerPerfil } from "../inventario/perfil";
import FrotaPagina from "./FrotaPagina";
import MenuFrota from "./MenuFrota";
import { esquecerFrota, lerFrota, type AbaFrota } from "./loja";
import { mudarPerfilFrota } from "./perfil";
import { definirMolduraFrota, lerPedidoFrota, pedirFrota } from "./pontes";
import { RecursosFrotaAgenda } from "./RecursosFrotaAgenda";
import { ViaturasObra } from "./ViaturasObra";

const LENTO = 30000;
function Casa({ inicio = "hoje" as AbaFrota }) {
  const [aba, setAba] = useState<AbaFrota>(inicio);
  return <><MenuFrota aba={aba} aoIr={setAba} /><FrotaPagina aba={aba} aoMudarAba={setAba} /></>;
}
const menu = (): HTMLElement => screen.getByTestId("menu-frota");
const ir = (nome: string): void => { fireEvent.click(within(menu()).getByRole("button", { name: new RegExp("^" + nome) })); };
const h1 = (): string => document.querySelector("#frota-painel h1")?.textContent ?? "";

beforeEach(() => { localStorage.clear(); esquecerFrota(); esquecerInventario(); esquecerPerfil(); esquecerPessoas(); esquecerPessoasFunc(); esquecerNegociosFunc(); esquecerDiaADia(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Frota no menu lateral do protótipo", () => {
  it("só aparece na V2, abre os ecrãs e abrir a Frota fecha o Inventário (e vice-versa)", async () => {
    localStorage.setItem("olyvia-prototipo-v2", "funcional");
    render(<PrototipoNegocios />);
    expect(screen.queryByTestId("menu-frota")).toBeNull();
    cleanup();
    localStorage.setItem("olyvia-prototipo-v2", "1");
    render(<PrototipoNegocios />);
    const grupo = (await screen.findAllByTestId("menu-frota"))[0];
    const botao = within(grupo).getByRole("button", { name: "Frota" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    fireEvent.click(within(grupo).getByRole("button", { name: /^Viaturas/ }));
    await waitFor(() => expect(document.querySelector("#frota-painel h1")?.textContent).toBe("Viaturas"), { timeout: 15000 });
    expect(screen.getByTestId("perfil-frota")).toBeInTheDocument();
    await waitFor(() => expect(document.getElementById("frota-gq")).not.toBeNull(), { timeout: 10000 }); // a pesquisa global no topo do protótipo
    // abrir o Inventário fecha a Frota
    const inv = screen.getAllByTestId("menu-inventario")[0];
    fireEvent.click(within(inv).getByRole("button", { name: "Inventário" }));
    fireEvent.click(within(inv).getByRole("button", { name: /^Hoje/ }));
    await waitFor(() => expect(document.getElementById("inv-painel")).not.toBeNull(), { timeout: 15000 });
    expect(document.getElementById("frota-painel")).toBeNull();
    expect(screen.queryByTestId("perfil-frota")).toBeNull();
    // fora da Frota o grupo recolhe; voltar à Frota fecha o Inventário
    const grupo2 = screen.getAllByTestId("menu-frota")[0];
    expect(within(grupo2).getByRole("button", { name: "Frota" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(within(grupo2).getByRole("button", { name: "Frota" }));
    fireEvent.click(within(grupo2).getByRole("button", { name: /^Atribuições/ }));
    await waitFor(() => expect(document.querySelector("#frota-painel h1")?.textContent).toBe("Atribuições"), { timeout: 10000 });
    expect(document.getElementById("inv-painel")).toBeNull();
  }, LENTO);
});

describe("ecrãs da Frota", () => {
  it("o Hoje tem a fila (cada cartão abre a lista filtrada) e quem está na estrada vem das obras do protótipo", () => {
    render(<Casa />);
    expect(h1()).toBe("Hoje");
    const painel = document.getElementById("frota-painel")!;
    expect(painel.querySelectorAll(".queue .qcard")).toHaveLength(8);
    expect(within(painel).getByText("Canalização · WC Marta Lima, Odivelas")).toBeInTheDocument();
    fireEvent.click(within(painel).getByText("Em oficina").closest("button")!);
    expect(h1()).toBe("Viaturas");
    expect(screen.getByRole("button", { name: /^Em oficina/, pressed: true })).toBeInTheDocument();
    expect(document.querySelectorAll("#frota-painel tbody tr")).toHaveLength(1);
  }, LENTO);

  it("abrir uma viatura: a ficha com 8 abas e o stock da carrinha lido do Inventário; pedir reposição cria transferências", async () => {
    render(<Casa inicio="viaturas" />);
    fireEvent.click(screen.getByRole("row", { name: /Abrir a AA-12-BC/ }));
    const folha = await screen.findByRole("dialog");
    expect(within(folha).getByRole("heading", { name: "Renault Master 2.3 dCi Furgão L2H2" })).toBeInTheDocument();
    const abas = within(folha).getAllByRole("tab").map((t) => t.textContent);
    expect(abas).toEqual(["Resumo", "Atribuições", "Manutenção", "Custos", "Ocorrências", "Documentos", "Stock na carrinha", "Ligações", "Histórico"]);
    fireEvent.click(within(folha).getByRole("tab", { name: "Stock na carrinha" }));
    expect(within(folha).getByText("Silicone neutro")).toBeInTheDocument();
    const antes = lerInventario().transfers.length;
    fireEvent.click(within(folha).getByRole("button", { name: /^Pedir reposição ao armazém central/ }));
    await waitFor(() => expect(lerInventario().transfers.length).toBe(antes + 2));
    expect(lerInventario().transfers.slice(-2).every((t) => t.from === "LIS" && t.to === "VIA-AA-12-BC" && t.state === "pending")).toBe(true);
    await waitFor(() => expect(within(folha).getAllByText("Pedido pendente")).toHaveLength(2));
    fireEvent.click(within(folha).getByRole("tab", { name: "Ligações" }));
    expect(within(folha).getByText(/Carrinha Renault Master · AA-12-BC · tipo veículo/)).toBeInTheDocument();
    expect(within(folha).getByText(/Demolição · WC Marta Lima/)).toBeInTheDocument();
  }, LENTO);

  it("atribuir recusa uma carta inválida e não grava nada", async () => {
    render(<Casa inicio="atribuicoes" />);
    fireEvent.click(screen.getByRole("button", { name: "Nova atribuição" }));
    const dlg = await screen.findByRole("dialog", { name: "Atribuir viatura" });
    fireEvent.change(within(dlg).getByLabelText("Viatura"), { target: { value: "v7" } });
    fireEvent.change(within(dlg).getByLabelText(/^Condutor/), { target: { value: "p7" } });
    expect(within(dlg).getByText("Paulo Mota não tem carta de condução registada no RH.")).toBeInTheDocument();
    const n = lerFrota().atrib.length;
    fireEvent.click(within(dlg).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(within(dlg).getAllByRole("alert").some((a) => a.textContent === "Paulo Mota não tem carta de condução registada no RH.")).toBe(true));
    expect(lerFrota().atrib).toHaveLength(n);
    // com uma pessoa com carta, uma reserva pontual só para hoje grava (a BX-55-RT está livre hoje; a 15/10 já está reservada)
    fireEvent.change(within(dlg).getByLabelText(/^Condutor/), { target: { value: "p8" } });
    fireEvent.change(within(dlg).getByLabelText("Tipo"), { target: { value: "pontual" } });
    fireEvent.change(within(dlg).getByLabelText(/^Fim/), { target: { value: "2026-10-14" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Atribuir" }));
    await waitFor(() => expect(lerFrota().atrib).toHaveLength(n + 1));
    expect(lerFrota().atrib[n]).toMatchObject({ vid: "v7", pid: "p8", tipo: "pontual", ini: "2026-10-14", fim: "2026-10-14" });
  }, LENTO);

  it("registar km que descem dá erro e os km ficam iguais", async () => {
    render(<Casa inicio="viaturas" />);
    fireEvent.click(screen.getByRole("row", { name: /Abrir a AA-12-BC/ }));
    const folha = await screen.findByRole("dialog");
    fireEvent.click(within(folha).getByRole("button", { name: "Registar km" }));
    const dlg = await screen.findByRole("dialog", { name: "Registar km" });
    fireEvent.change(within(dlg).getByLabelText("Km no conta-quilómetros"), { target: { value: "100" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Registar" }));
    await waitFor(() => expect(within(dlg).getByRole("alert").textContent).toMatch(/^Os km não podem descer\. Última leitura: 148.230 km\.$/));
    expect(lerFrota().viaturas.find((v) => v.id === "v1")!.km).toBe(148230);
  }, LENTO);

  it("o técnico (João Silva) só vê a sua viatura e não pode criar viaturas", () => {
    mudarPerfilFrota("tecnico");
    render(<Casa inicio="viaturas" />);
    expect(screen.getAllByRole("row", { name: /^Abrir a / })).toHaveLength(1);
    expect(screen.getByRole("row", { name: /Abrir a AA-12-BC/ })).toBeInTheDocument();
    const nova = screen.getByRole("button", { name: "Nova viatura" });
    expect(nova).toBeDisabled();
    expect(nova).toHaveAttribute("title", "Como técnico, só registas km, abastecimentos e ocorrências da tua viatura.");
  }, LENTO);
});

describe("a Frota vista de fora: Agenda e obra", () => {
  it("as viaturas ativas aparecem nos recursos da Agenda, com os bloqueios, e 'Abrir na Frota' pede a viatura", () => {
    // sem uma moldura que abra a Frota, não há "Abrir na Frota" e um pedido não fica pendente
    definirMolduraFrota(false);
    const { unmount } = render(<RecursosFrotaAgenda />);
    expect(screen.queryByRole("button", { name: "Abrir na Frota" })).toBeNull();
    expect(pedirFrota({ vid: "v1" })).toBe(false);
    expect(lerPedidoFrota()).toBeNull();
    unmount();
    definirMolduraFrota(true);
    render(<RecursosFrotaAgenda />);
    const lista = screen.getByRole("list", { name: "Veículos da Frota" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(7);
    const master = within(lista).getByRole("listitem", { name: /AA-12-BC/ });
    expect(master.textContent).toContain("É o recurso “Carrinha Renault Master”.");
    expect(within(lista).getByRole("listitem", { name: /12-TT-90/ }).textContent).toContain("16/10 IPO");
    expect(within(lista).getByRole("listitem", { name: /BX-55-RT/ }).textContent).toContain("15/10 reservada a Hugo Neves");
    fireEvent.click(within(master).getByRole("button", { name: "Abrir na Frota" }));
    expect(lerPedidoFrota()).toMatchObject({ vid: "v1" });
    definirMolduraFrota(false); // a moldura deixou de a poder abrir: o pedido pendente cai
    expect(lerPedidoFrota()).toBeNull();
  });

  it("a página da obra mostra as viaturas que lá foram, com o custo por km real", () => {
    definirMolduraFrota(true);
    render(<ViaturasObra obra={1022} />);
    const g = screen.getByRole("group", { name: "Viaturas da obra" });
    expect(within(g).getAllByRole("button").map((b) => b.textContent)).toEqual(["AA-12-BC", "12-TT-90", "BX-55-RT"]);
    expect(g.textContent).toContain("Hugo Neves, Revestimento e pavimento");
    expect(g.textContent).toMatch(/€\/km/);
  });

  it("um pedido de fora abre a Frota na viatura pedida (V2)", async () => {
    localStorage.setItem("olyvia-prototipo-v2", "1");
    render(<PrototipoNegocios />);
    await screen.findAllByTestId("menu-frota");
    act(() => pedirFrota({ aba: "viaturas", vid: "v4" }));
    expect(await screen.findByRole("heading", { name: "Ford Transit Custom 2.0 TDCi" }, { timeout: 15000 })).toBeInTheDocument();
    expect(document.querySelector("#frota-painel h1")?.textContent).toBe("Viaturas");
    expect(lerPedidoFrota()).toBeNull(); // tratado: não volta a abrir mais tarde
  }, LENTO);

  it("ao fechar a ficha, o foco volta ao elemento que a abriu", async () => {
    render(<Casa inicio="viaturas" />);
    const linha = screen.getByRole("row", { name: /Abrir a 45-XZ-78/ });
    linha.focus();
    fireEvent.click(linha);
    const folha = await screen.findByRole("dialog");
    fireEvent.click(within(folha).getAllByRole("button", { name: "Fechar" })[0]);
    await waitFor(() => expect(document.activeElement).toBe(linha));
  }, LENTO);
});
