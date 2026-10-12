// A página de Pessoas da V2 funcional, no ecrã: o Hoje, registar uma chamada (com a memória do dia a dia a refletir-se na lista e na ficha),
// a Lista com seleção, ordem, colunas e exportação, a ficha com copiar, e os atalhos de teclado.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import { PessoasFunc, esquecerPessoasFunc } from "./PessoasFunc";
import { esquecerPessoas } from "./PessoasSimples";
import { esquecerDiaADia, lerRegistos } from "./diaADia";

const original = window.matchMedia;
const ecra = (largo: boolean): void => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: largo, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
};

function pagina() {
  const S = seed();
  const run = (fn: () => void) => fn();
  render(<PessoasFunc S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
  return S;
}

const grupo = (nome: string): HTMLElement => screen.getByRole("list", { name: nome });
const linhaDe = (nome: string): HTMLElement => document.querySelector<HTMLElement>(`[data-pessoa="${nome}"]`)!;
const tecla = (key: string, el: Element = document.body): void => { fireEvent.keyDown(el, { key }); };
const separador = (nome: string, raiz: HTMLElement = document.body): void => { fireEvent.mouseDown(within(raiz).getByRole("tab", { name: nome }), { button: 0 }); };

async function registarChamada(nome: string, resultado: string, passo: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: `Registar chamada de ${nome}` }));
  const pop = await screen.findByRole("dialog", { name: `Registar chamada de ${nome}` });
  expect(within(pop).getByRole("button", { name: "Guardar" })).toBeDisabled(); // sem resultado não se guarda
  fireEvent.click(within(pop).getByRole("button", { name: resultado }));
  fireEvent.click(within(pop).getByRole("button", { name: passo }));
  fireEvent.click(within(pop).getByRole("button", { name: "Guardar" }));
}

beforeEach(() => { esquecerPessoasFunc(); esquecerPessoas(); esquecerDiaADia(); ecra(true); });
/** Fecha os painéis que ficaram abertos antes de desmontar: um Sheet desmontado aberto deixa o Radix a pensar que ainda há uma camada modal. */
afterEach(async () => {
  if (screen.queryAllByRole("dialog").length) {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryAllByRole("dialog")).toHaveLength(0));
  }
  cleanup(); window.matchMedia = original; vi.restoreAllMocks();
});

describe("Pessoas funcional · Hoje", () => {
  it("abre no Hoje, com as quatro listas recolhíveis, as contagens e as razões", () => {
    pagina();
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas · dia a dia" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Hoje" })).toHaveAttribute("aria-selected", "true");
    const cabecalhos = ["Contactar hoje", "Visitas esta semana", "À espera de resposta", "Contratos e faturação"].map((n) => screen.getByRole("button", { name: new RegExp(`^${n}`) }));
    expect(cabecalhos.map((b) => b.textContent)).toEqual(["Contactar hoje7", "Visitas esta semana2", "À espera de resposta1", "Contratos e faturação4"]);
    expect(cabecalhos.every((b) => b.getAttribute("aria-expanded") === "true")).toBe(true);
    expect(screen.getByText("14 pessoas para hoje · hoje é 10/10")).toBeInTheDocument();
    expect(within(grupo("Contactar hoje")).getAllByRole("listitem")).toHaveLength(7);
    expect(linhaDe("Inês Carvalho")).toHaveTextContent("Voltou a contactar ontem");
    expect(linhaDe("Carla Nunes")).toHaveTextContent("Proposta enviada há 5 dias");
  });
  it("recolher uma lista esconde-a e diz-o no botão", () => {
    pagina();
    const b = screen.getByRole("button", { name: /^Visitas esta semana/ });
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Visitas esta semana" })).toBeNull();
  });
  it("cada linha tem as ações rápidas com nome: Ligar, WhatsApp, Email (links) e Registar chamada e Adiar", () => {
    pagina();
    const acoesInes = screen.getByRole("group", { name: "Ações rápidas: Inês Carvalho" });
    expect(within(acoesInes).getByRole("link", { name: "Ligar a Inês Carvalho" })).toHaveAttribute("href", "tel:932118450");
    expect(within(acoesInes).getByRole("link", { name: /WhatsApp para Inês Carvalho/ })).toHaveAttribute("href", "https://wa.me/351932118450");
    expect(within(acoesInes).getByRole("link", { name: "Email para Inês Carvalho" }).getAttribute("href")).toMatch(/^mailto:/);
    expect(within(acoesInes).getByRole("button", { name: "Registar chamada de Inês Carvalho" })).toBeInTheDocument();
    expect(within(acoesInes).getByRole("button", { name: "Adiar Inês Carvalho" })).toBeInTheDocument();
  });
  it("registar uma chamada tira a pessoa de Contactar hoje, anuncia-o e fica só na memória do dia a dia", async () => {
    const S = pagina(), antes = JSON.stringify(S);
    await registarChamada("Ricardo Nogueira", "Atendeu · interessado", "Sem próximo passo");
    await waitFor(() => expect(within(grupo("Contactar hoje")).queryByText("Ricardo Nogueira")).toBeNull());
    expect(screen.getByRole("button", { name: /^Contactar hoje/ })).toHaveTextContent("6");
    expect(await screen.findByText("Chamada registada: Ricardo Nogueira")).toBeInTheDocument();
    expect(lerRegistos()).toHaveLength(1);
    expect(JSON.stringify(S)).toBe(antes); // o Estado não mudou
  });
  it("adiar tira a pessoa do Hoje", async () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: "Adiar Luísa Freitas" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Adiar Luísa Freitas" })).getByRole("button", { name: /^Amanhã/ }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Visitas esta semana" })).not.toHaveTextContent("Luísa Freitas"));
    expect(await screen.findByText("Luísa Freitas: próximo contacto a 11/10")).toBeInTheDocument();
  });
  it("a linha abre a ficha no painel; a chamada registada aparece no topo da Atividade, e o aviso 'Voltou a contactar' desaparece", async () => {
    pagina();
    await registarChamada("Inês Carvalho", "Não atendeu", "Voltar a ligar hoje");
    await waitFor(() => expect(linhaDe("Inês Carvalho")).toHaveTextContent("Combinado ligar outra vez hoje"));
    fireEvent.click(linhaDe("Inês Carvalho"));
    const painel = await screen.findByRole("dialog", { name: /Inês Carvalho/ });
    expect(within(painel).queryByText(/Voltou a contactar: preencheu/)).toBeNull();
    separador("Atividade", painel);
    const primeira = within(painel).getByRole("list", { name: /Atividade/ }).querySelector("li")!;
    expect(primeira).toHaveTextContent("Chamada registada");
    expect(primeira).toHaveTextContent("registado agora");
    expect(primeira).toHaveTextContent("Não atendeu · Próximo passo: Voltar a ligar hoje");
  });
});

describe("Pessoas funcional · a ficha", () => {
  const abrir = async (nome: string): Promise<HTMLElement> => { fireEvent.click(linhaDe(nome)); return screen.findByRole("dialog", { name: new RegExp(nome) }); };
  it("a barra de ações fixa tem Ligar, WhatsApp, Email, Registar chamada, Nota, Adiar e, numa lead, Marcar como perdida", async () => {
    pagina();
    const barra = within(await abrir("Pedro Lopes")).getByRole("group", { name: "Ações" });
    expect(within(barra).getAllByRole("link").map((l) => l.textContent)).toEqual(["Ligar", "WhatsApp", "Email"]);
    expect(within(barra).getAllByRole("button").map((b) => b.textContent)).toEqual(["Registar chamada", "Nota", "Adiar", "Marcar como perdida"]);
  });
  it("um cliente não tem Marcar como perdida", async () => {
    pagina();
    const barra = within(await abrir("Joana Ribeiro")).getByRole("group", { name: "Ações" });
    expect(within(barra).queryByRole("button", { name: "Marcar como perdida" })).toBeNull();
  });
  it("Copiar o telefone diz 'Copiado'; se a área de transferência recusar, seleciona o texto e diz como copiar", async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escrever }, configurable: true });
    pagina();
    const painel = await abrir("Pedro Lopes");
    fireEvent.click(within(painel).getByRole("button", { name: "Copiar telefone" }));
    expect(await within(painel).findByText("Copiado: telefone")).toBeInTheDocument();
    expect(escrever).toHaveBeenCalledWith("927 118 300");
    escrever.mockRejectedValueOnce(new Error("recusado"));
    fireEvent.click(within(painel).getByRole("button", { name: "Copiar email" }));
    expect(await within(painel).findByText(/Não foi possível copiar\. O email ficou selecionado/)).toBeInTheDocument();
  });
  it("uma nota rápida entra nas notas do Resumo", async () => {
    pagina();
    const painel = await abrir("Pedro Lopes");
    fireEvent.click(within(within(painel).getByRole("group", { name: "Ações" })).getByRole("button", { name: "Nota" }));
    const pop = await screen.findByRole("dialog", { name: "Nota sobre Pedro Lopes" });
    fireEvent.change(within(pop).getByLabelText("Nota rápida"), { target: { value: "Prefere WhatsApp" } });
    fireEvent.click(within(pop).getByRole("button", { name: "Juntar nota" }));
    expect(await within(painel).findByText("Prefere WhatsApp")).toBeInTheDocument();
  });
});

describe("Pessoas funcional · Lista", () => {
  const irLista = (): void => separador("Lista");
  const linhasTabela = (): HTMLElement[] => within(screen.getByRole("table")).getAllByRole("row").slice(1);
  it("vistas rápidas com contagem; 'Contactar hoje' mostra as mesmas sete do Hoje", () => {
    pagina(); irLista();
    const vistas = within(screen.getByRole("group", { name: "Vistas rápidas" })).getAllByRole("button");
    expect(vistas.map((b) => b.textContent)).toEqual(["Contactar hoje 7", "Visitas esta semana 2", "À espera de resposta 1", "Voltaram a contactar 2", "Sem contacto 4", "Perdidas 2"]);
    fireEvent.click(vistas[0]);
    expect(vistas[0]).toHaveAttribute("aria-pressed", "true");
    expect(linhasTabela()).toHaveLength(7);
  });
  it("ordenar pelo cabeçalho Pessoa: aria-sort e a ordem mudam a cada clique", () => {
    pagina(); irLista();
    const cab = screen.getByRole("columnheader", { name: /^Pessoa/ });
    expect(cab).toHaveAttribute("aria-sort", "none");
    fireEvent.click(within(cab).getByRole("button"));
    expect(cab).toHaveAttribute("aria-sort", "ascending");
    expect(linhasTabela()[0]).toHaveTextContent("Ana Martins");
    fireEvent.click(within(cab).getByRole("button"));
    expect(cab).toHaveAttribute("aria-sort", "descending");
    expect(linhasTabela()[0]).toHaveTextContent("Sérgio Pinto");
  });
  it("as colunas escolhem-se num menu de caixas", async () => {
    pagina(); irLista();
    expect(screen.queryByRole("columnheader", { name: /^Origem/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Colunas" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Origem" }));
    expect(screen.getByRole("columnheader", { name: "Origem" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Valor" }));
    expect(screen.queryByRole("columnheader", { name: /^Valor/ })).toBeNull();
  });
  it("escolher pessoas mostra a barra da seleção; exportar as escolhidas descarrega um CSV com elas e anuncia-o", async () => {
    let blob: Blob | null = null;
    URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return "blob:x"; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    pagina(); irLista();
    expect(screen.queryByRole("region", { name: "Pessoas escolhidas" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Escolher Pedro Lopes" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Escolher Ana Martins" }));
    const barra = screen.getByRole("region", { name: "Pessoas escolhidas" });
    expect(barra).toHaveTextContent("2 selecionadas");
    fireEvent.click(within(barra).getByRole("button", { name: "Exportar selecionadas (CSV)" }));
    expect(await screen.findByText("Exportadas 2 pessoas")).toBeInTheDocument();
    const bytes = new Uint8Array(await blob!.arrayBuffer()), texto = new TextDecoder().decode(bytes);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // o BOM (o TextDecoder tira-o ao ler)
    expect(texto.split("\r\n").filter(Boolean)).toHaveLength(3);
    expect(texto).toContain("Pedro Lopes;Lead;");
    fireEvent.click(within(barra).getByRole("button", { name: "Limpar seleção" }));
    expect(screen.queryByRole("region", { name: "Pessoas escolhidas" })).toBeNull();
  });
  it("'Escolher todas' marca as da lista, e Exportar lista (CSV) exporta a lista filtrada", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    pagina(); irLista();
    fireEvent.click(screen.getByRole("checkbox", { name: "Escolher todas as pessoas da lista" }));
    expect(screen.getByRole("region", { name: "Pessoas escolhidas" })).toHaveTextContent("14 selecionadas");
    fireEvent.click(screen.getByRole("button", { name: "Exportar lista (CSV)" }));
    expect(await screen.findByText("Exportadas 14 pessoas")).toBeInTheDocument();
  });
  it("uma chamada registada no Hoje vê-se na Lista (resultado e 'há quanto tempo')", async () => {
    pagina();
    await registarChamada("Ricardo Nogueira", "Atendeu · interessado", "Ligar amanhã");
    irLista();
    const linha = linhaDe("Ricardo Nogueira").closest("tr")!;
    expect(linha).toHaveTextContent("Atendeu · interessado");
    expect(linha).not.toHaveTextContent("Voltou a contactar");
    expect(linha).toHaveTextContent("hoje");
  });
});

describe("Pessoas funcional · atalhos", () => {
  it("'/' vai para a pesquisa, '?' abre a ajuda, as setas movem entre linhas e Enter abre a ficha", async () => {
    pagina();
    tecla("/");
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Procurar no Hoje" }));
    tecla("j", document.activeElement!); // dentro do campo não faz nada
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Procurar no Hoje" }));
    (document.activeElement as HTMLElement).blur();
    tecla("ArrowDown");
    expect(document.activeElement).toBe(linhaDe("Pedro Lopes"));
    tecla("j", document.activeElement!);
    expect(document.activeElement).toBe(linhaDe("Ana Martins"));
    tecla("k", document.activeElement!);
    expect(document.activeElement).toBe(linhaDe("Pedro Lopes"));
    tecla("Enter", document.activeElement!);
    const painel = await screen.findByRole("dialog", { name: /Pedro Lopes/ });
    act(() => tecla("ArrowRight", document.activeElement ?? document.body));
    await waitFor(() => expect(within(painel).getByRole("heading", { name: "Ana Martins" })).toBeInTheDocument());
  });
  it("'?' abre a ajuda Atalhos; a dica também", async () => {
    pagina();
    tecla("?");
    const ajuda = await screen.findByRole("dialog", { name: "Atalhos" });
    expect(ajuda).toHaveTextContent("Ir para a pesquisa");
    fireEvent.click(within(ajuda).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Atalhos" })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Prima \? para ver atalhos/ }));
    expect(await screen.findByRole("dialog", { name: "Atalhos" })).toBeInTheDocument();
  });
});
