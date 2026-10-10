import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "./motor";
import PrototipoNegocios from "./PrototipoNegocios";
import { PessoasSimples, esquecerPessoas } from "./PessoasSimples";
import { SepNegocios } from "./SepNegocios";
import { todosApp } from "./pessoasDocs";

const original = window.matchMedia;
const ecra = (largo: boolean): void => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: largo, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
};

function pagina() {
  const S = seed();
  const run = (fn: () => void) => fn();
  const A = acoes(S, vi.fn(), run);
  return render(<PessoasSimples S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} />);
}

const linha = (nome: string): HTMLElement => screen.getByRole("button", { name: new RegExp(nome) });
const separador = (painel: HTMLElement, nome: string): void => { fireEvent.mouseDown(within(painel).getByRole("tab", { name: nome }), { button: 0 }); };
/** Como o utilizador carrega em Esc: no elemento que tem o foco (o user-event não está instalado, por isso fireEvent no elemento focado). */
const esc = (): void => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); };
/** Visível e clicável para quem usa leitor de ecrã ou rato: nenhum ancestral aria-hidden ou inert, e o primeiro pointer-events explícito não é "none" (herda-se). */
function acessivel(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) if (n.getAttribute("aria-hidden") === "true" || n.hasAttribute("inert")) return false;
  for (let n: HTMLElement | null = el; n; n = n.parentElement) if (n.style.pointerEvents) return n.style.pointerEvents !== "none";
  return true;
}

beforeEach(() => { esquecerPessoas(); ecra(true); });
afterEach(() => { cleanup(); window.matchMedia = original; });

describe("Pessoas · lista primeiro", () => {
  it("no computador é uma tabela com cabeçalhos de coluna, uma linha por pessoa, e nada vem aberto", () => {
    pagina();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(
      ["Pessoa", "Serviço · localidade", "Etapa", "Origem", "Último contacto", "Próximo passo", "Valor"]);
    expect(within(tabela).getAllByRole("row")).toHaveLength(9);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Pessoas" })).toBeInTheDocument();
    expect(screen.queryByText("Escolhe uma pessoa")).toBeNull();
  });
  it("abaixo de lg a lista são cartões, sem tabela", () => {
    ecra(false);
    pagina();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("list", { name: "Leads" }).querySelectorAll("li")).toHaveLength(8);
  });
  it("o cabeçalho tem os separadores com contagens e uma só fila de chips", () => {
    pagina();
    expect(screen.getByRole("tab", { name: /Leads/ })).toHaveTextContent("8");
    expect(screen.getByRole("tab", { name: /Clientes/ })).toHaveTextContent("3");
    expect(screen.getByRole("tab", { name: /Todos/ })).toHaveTextContent("11");
    const chips = within(screen.getByRole("group", { name: "Mostrar" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent?.replace(/\s*\d+$/, ""))).toEqual(["Todas", "Por contactar", "Atrasadas", "Só as minhas"]);
  });
  it("clicar na linha abre a ficha num painel, com o foco no nome e a posição; Esc fecha e devolve o foco à linha da pessoa certa", async () => {
    pagina();
    fireEvent.click(linha("Pedro Lopes"));
    const painel = await screen.findByRole("dialog");
    const titulo = within(painel).getByRole("heading", { name: "Pedro Lopes" });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    expect(within(painel).getByText("1 de 8")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(within(painel).getByRole("button", { name: /^Seguinte: / }));
    expect(within(painel).getByText("2 de 8")).toBeInTheDocument();
    expect(within(painel).getByRole("heading", { name: "Ana Martins" })).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: /^Anterior: Pedro Lopes/ })).toBeEnabled();
    esc();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect((document.activeElement as HTMLElement)?.dataset.pessoa).toBe("Ana Martins"));
  });
  it("ao carregar em Seguinte ou Anterior o foco fica na seta usada; se ela deixa de poder usar-se (primeira ou última pessoa), passa ao nome", async () => {
    pagina();
    fireEvent.click(linha("Pedro Lopes"));
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: /^Seguinte: Ana Martins/ }));
    await waitFor(() => expect(document.activeElement).toBe(within(painel).getByRole("button", { name: /^Seguinte: Rita Sousa/ })));
    fireEvent.click(within(painel).getByRole("button", { name: /^Anterior: Pedro Lopes/ }));
    await waitFor(() => expect(within(painel).getByRole("heading", { name: "Pedro Lopes" })).toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(within(painel).getByRole("heading", { name: "Pedro Lopes" })));
  });
  it("o botão Fechar fecha o painel", async () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Pedro Lopes/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect((document.activeElement as HTMLElement)?.dataset.pessoa).toBe("Pedro Lopes"));
  });
  it("com um filtro, as setas só percorrem a lista filtrada e o Seguinte desativa-se na última pessoa", async () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /^Por contactar/ }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(4);
    fireEvent.click(linha("Ana Martins"));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByText("2 de 3")).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: /^Seguinte: Rita Sousa/ }));
    expect(within(painel).getByText("3 de 3")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: "Seguinte" })).toBeDisabled();
    fireEvent.click(within(painel).getByRole("button", { name: /^Anterior: Ana Martins/ }));
    fireEvent.click(within(painel).getByRole("button", { name: /^Anterior: Pedro Lopes/ }));
    expect(within(painel).getByText("1 de 3")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: "Anterior" })).toBeDisabled();
  });
  it("sem resultados diz-se, anuncia-se, e Limpar filtros devolve a lista e põe o foco na pesquisa", () => {
    pagina();
    const pesquisa = screen.getByRole("searchbox");
    fireEvent.change(pesquisa, { target: { value: "zzzz" } });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Nenhuma pessoa com este filtro.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Nenhuma pessoa");
    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(9);
    expect(screen.queryByText("Nenhuma pessoa com este filtro.")).toBeNull();
    expect(document.activeElement).toBe(pesquisa);
  });
});

describe("Pessoas · a memória ao abrir um negócio e voltar", () => {
  it("ao voltar a montar a página, o painel reabre na mesma pessoa e no mesmo separador; esquecerPessoas limpa tudo", async () => {
    const primeira = pagina();
    fireEvent.click(linha("Pedro Lopes"));
    separador(await screen.findByRole("dialog"), "Negócios");
    await screen.findByRole("list", { name: "Negócios desta pessoa" });
    primeira.unmount();
    pagina();
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByRole("heading", { name: "Pedro Lopes" })).toBeInTheDocument();
    expect(within(painel).getByRole("tab", { name: "Negócios" })).toHaveAttribute("aria-selected", "true");
    cleanup();
    esquecerPessoas();
    pagina();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("o negócio escolhido também se lembra, e esquecerPessoas apaga-o", async () => {
    const primeira = pagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Clientes/ }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: /Marta Lima/ }));
    separador(await screen.findByRole("dialog"), "Negócios");
    const escolher = async (): Promise<HTMLElement> => within(await screen.findByRole("list", { name: "Negócios desta pessoa" })).findByRole("button", { name: /Pavimento exterior/ });
    fireEvent.click(await escolher()); // o por defeito seria a Cozinha nova
    primeira.unmount();
    pagina();
    const painel = await screen.findByRole("dialog");
    const lista = await within(painel).findByRole("list", { name: "Negócios desta pessoa" });
    expect(within(lista).getByRole("button", { name: /Pavimento exterior/ })).toHaveAttribute("aria-pressed", "true");
    cleanup();
    esquecerPessoas();
    pagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Clientes/ }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: /Marta Lima/ }));
    separador(await screen.findByRole("dialog"), "Negócios");
    expect(await escolher()).toHaveAttribute("aria-pressed", "false");
  });
});

describe("Pessoas · o separador Negócios da ficha", () => {
  it("mostra o negócio com o seu ícone e, com um só, a informação dele ao lado, sem escolher", async () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Pedro Lopes/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: "Negócios" }), { button: 0 });
    const linha = await within(painel).findByRole("button", { name: /WC social/ });
    expect(linha).toHaveAttribute("aria-pressed", "true");
    expect(linha).toHaveTextContent("Em preparação");
    expect(linha).toHaveTextContent("Sem valor ainda");
    expect(linha.querySelector("svg.lucide-handshake")).not.toBeNull();
    const detalhe = within(painel).getByRole("region", { name: "Negócio: WC social" });
    expect(within(detalhe).getByText("O que falta para o orçamento")).toBeInTheDocument();
    expect(within(detalhe).getByText("Documentos")).toBeInTheDocument();
    expect(within(detalhe).getByText("Levantamento")).toBeInTheDocument();
  });
  it("com vários negócios abre o mais avançado em curso; ao clicar noutro, a informação dele aparece ao lado (Marta Lima)", async () => {
    pagina();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Clientes/ }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: /Marta Lima/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.mouseDown(within(painel).getByRole("tab", { name: "Negócios" }), { button: 0 });
    const linhas = within(await within(painel).findByRole("list", { name: "Negócios desta pessoa" })).getAllByRole("button");
    expect(linhas).toHaveLength(3);
    // O perdido (Pavimento exterior) e o concluído da seed não contam: sobra a Cozinha nova, em curso.
    expect(linhas.filter((l) => l.getAttribute("aria-pressed") === "true")).toHaveLength(1);
    expect(within(painel).getByRole("region", { name: "Negócio: Cozinha nova" })).toBeInTheDocument();
    expect(within(painel).queryByText("Escolhe um negócio")).toBeNull();
    const cozinha = linhas.find((l) => /Cozinha nova/.test(l.textContent ?? ""))!;
    fireEvent.click(cozinha);
    expect(cozinha).toHaveAttribute("aria-pressed", "true");
    const detalhe = within(painel).getByRole("region", { name: "Negócio: Cozinha nova" });
    expect(within(detalhe).getByRole("list", { name: "Documentos do negócio" })).toHaveTextContent("Orçamento");
  });
  it("uma pessoa sem negócios diz-o, em vez de uma lista vazia", () => {
    const S = seed();
    const p = { ...todosApp(S)[0], negocios: [], todos: [] };
    render(<SepNegocios S={S} p={p} abrir={() => () => undefined} />);
    expect(screen.getByText("Esta pessoa ainda não tem negócios.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Negócios desta pessoa" })).toBeNull();
  });
  it("com o detalhe por baixo da lista o botão usa aria-expanded e aria-controls (e leva o foco ao detalhe); ao lado usa só aria-pressed", async () => {
    const medida = estreito();
    try {
      pagina();
      fireEvent.mouseDown(screen.getByRole("tab", { name: /Clientes/ }), { button: 0 });
      fireEvent.click(await screen.findByRole("button", { name: /Marta Lima/ }));
      const painel = await screen.findByRole("dialog");
      separador(painel, "Negócios");
      const cozinha = await within(painel).findByRole("button", { name: /Cozinha nova/ });
      expect(cozinha).toHaveAttribute("aria-expanded", "false"); // por baixo da lista não abre nenhum por defeito
      expect(cozinha).not.toHaveAttribute("aria-pressed");
      fireEvent.click(cozinha);
      const detalhe = await within(painel).findByRole("region", { name: "Negócio: Cozinha nova" });
      await waitFor(() => expect(cozinha).toHaveAttribute("aria-expanded", "true"));
      expect(cozinha).not.toHaveAttribute("aria-pressed");
      expect(cozinha).toHaveAttribute("aria-controls", detalhe.id);
      await waitFor(() => expect(document.activeElement).toBe(detalhe));
    } finally { medida.mockRestore(); }
  });
  /** Simula o separador Negócios estreito (400 px, abaixo dos 640 px da container query): o detalhe fica por baixo da lista. */
  function estreito() {
    const rect = (largura: number): DOMRect => ({ top: 0, bottom: 0, height: 0, left: 0, right: largura, width: largura, x: 0, y: 0, toJSON: () => ({}) });
    return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return rect(this.matches(".negocios-cx") ? 400 : 0);
    });
  }
  /** Abre a ficha de uma pessoa (no separador certo da lista) e o separador Negócios; devolve o painel e a lista dos negócios. */
  async function negociosDe(nome: string, cliente = false): Promise<{ painel: HTMLElement; lista: HTMLElement }> {
    pagina();
    if (cliente) fireEvent.mouseDown(screen.getByRole("tab", { name: /Clientes/ }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(nome) }));
    const painel = await screen.findByRole("dialog");
    separador(painel, "Negócios");
    return { painel, lista: await within(painel).findByRole("list", { name: "Negócios desta pessoa" }) };
  }
  it("a Carla Nunes tem 3 negócios (não 5), o mais avançado (a Cozinha, em Proposta) aberto por defeito, e cada linha diz o estado e o valor total", async () => {
    const { painel, lista } = await negociosDe("Carla Nunes");
    const linhas = within(lista).getAllByRole("button");
    expect(linhas).toHaveLength(3);
    expect(linhas.map((l) => l.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    expect(within(painel).queryByText("Escolhe um negócio")).toBeNull();
    expect(linhas[0]).toHaveTextContent("Proposta");
    expect(linhas[0]).toHaveTextContent("8.126,60 €");
    expect(linhas[0]).not.toHaveTextContent("orçamentos");
    expect(linhas[1]).toHaveTextContent("Casa de banho e pintura");
    expect(linhas[1]).toHaveTextContent("Orçamento · 2 orçamentos");
    expect(linhas[1]).toHaveTextContent("6.770,00 €");
    expect(linhas[2]).toHaveTextContent("Varanda fechada");
    expect(linhas[2]).toHaveTextContent("Proposta · 2 orçamentos");
    expect(linhas[2]).toHaveTextContent("7.740,00 €");
    expect(within(painel).getByRole("region", { name: "Negócio: Cozinha" })).toBeInTheDocument();
  });
  it("o detalhe de um negócio com 2 orçamentos mostra os documentos reais: os dois orçamentos e a proposta que os junta, e nenhum contrato", async () => {
    const { painel, lista } = await negociosDe("Carla Nunes");
    fireEvent.click(within(lista).getByRole("button", { name: /Varanda fechada/ }));
    const detalhe = within(painel).getByRole("region", { name: "Negócio: Varanda fechada" });
    expect(within(detalhe).getByText("Valor total").nextSibling).toHaveTextContent("7.740,00 €");
    const docs = within(within(detalhe).getByRole("list", { name: "Documentos do negócio" })).getAllByRole("listitem");
    expect(docs).toHaveLength(3);
    expect(docs[0]).toHaveTextContent(/Orçamento.*Caixilharia em alumínio.*3\.480,00 €/);
    expect(docs[1]).toHaveTextContent(/Orçamento.*Caixilharia com corte térmico.*4\.260,00 €/);
    expect(docs[2]).toHaveTextContent(/Proposta.*Enviada.*inclui 2 orçamentos.*7\.740,00 €/);
    expect(within(detalhe).queryByText("Contrato")).toBeNull();
    const passos = within(within(detalhe).getByRole("list", { name: "Percurso do negócio" })).getAllByRole("listitem");
    expect(passos.map((x) => x.textContent)).toEqual([expect.stringContaining("Levantamento"), expect.stringContaining("(2 orçamentos)"), expect.stringContaining("Proposta"), expect.stringContaining("Financeiro")]);
    expect(within(detalhe).getAllByText("exemplo").length).toBeGreaterThanOrEqual(1);
  });
  it("um negócio com contrato mostra o contrato, com o seu estado, e o percurso de cinco passos (Joana Ribeiro)", async () => {
    const { painel, lista } = await negociosDe("Joana Ribeiro", true);
    fireEvent.click(within(lista).getByRole("button", { name: /WC de serviço e lavandaria/ }));
    const detalhe = within(painel).getByRole("region", { name: "Negócio: WC de serviço e lavandaria" });
    const docs = within(within(detalhe).getByRole("list", { name: "Documentos do negócio" })).getAllByRole("listitem");
    expect(docs.map((x) => /^(Orçamento|Proposta|Contrato)/.exec(x.textContent ?? "")?.[1])).toEqual(["Orçamento", "Orçamento", "Proposta", "Contrato"]);
    expect(docs[3]).toHaveTextContent("Enviado ao cliente");
    expect(within(within(detalhe).getByRole("list", { name: "Percurso do negócio" })).getAllByRole("listitem")).toHaveLength(5);
  });
  it("um negócio com um só orçamento não diz '2 orçamentos' (Sérgio Pinto, Pintura interior)", async () => {
    const { painel, lista } = await negociosDe("Sérgio Pinto");
    expect(within(lista).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(within(lista).getByRole("button", { name: /Pintura interior/ }));
    const detalhe = within(painel).getByRole("region", { name: "Negócio: Pintura interior" });
    expect(detalhe).not.toHaveTextContent("orçamentos");
    expect(within(within(detalhe).getByRole("list", { name: "Documentos do negócio" })).getAllByRole("listitem")).toHaveLength(2);
  });
  it("um negócio perdido aparece a cinzento, com 'Perdido' e o motivo, sem próximo passo nem percurso (Marta Lima)", async () => {
    const { painel, lista } = await negociosDe("Marta Lima", true);
    const linha = within(lista).getByRole("button", { name: /Pavimento exterior/ });
    expect(linha).toHaveTextContent("Perdido · preço");
    expect(within(linha).getByText("Pavimento exterior")).toHaveClass("text-muted-foreground");
    fireEvent.click(linha);
    const detalhe = within(painel).getByRole("region", { name: "Negócio: Pavimento exterior" });
    expect(within(detalhe).getByText("Estado").nextSibling).toHaveTextContent("Perdido");
    expect(within(detalhe).getByText("Motivo").nextSibling).toHaveTextContent("preço");
    expect(within(detalhe).queryByText("Próximo passo")).toBeNull();
    expect(within(detalhe).queryByRole("list", { name: "Percurso do negócio" })).toBeNull();
    expect(within(detalhe).queryByText(/Probabilidade/)).toBeNull();
  });
  it("com o detalhe por baixo da lista não abre nenhum negócio por defeito (Carla Nunes), e a lista fica sem espaço vazio visível", async () => {
    const medida = estreito();
    try {
      const { painel, lista } = await negociosDe("Carla Nunes");
      const linhas = within(lista).getAllByRole("button");
      expect(linhas.every((l) => l.getAttribute("aria-expanded") === "false")).toBe(true);
      expect(within(painel).queryByRole("region", { name: /^Negócio: / })).toBeNull();
    } finally { medida.mockRestore(); }
  });
  it("um negócio perdido por baixo da lista: abre, mostra o motivo e leva o foco ao detalhe (Marta Lima)", async () => {
    const medida = estreito();
    try {
      const { painel, lista } = await negociosDe("Marta Lima", true);
      fireEvent.click(within(lista).getByRole("button", { name: /Pavimento exterior/ }));
      const detalhe = await within(painel).findByRole("region", { name: "Negócio: Pavimento exterior" });
      expect(within(detalhe).getByText("Motivo").nextSibling).toHaveTextContent("preço");
      expect(within(detalhe).queryByRole("list", { name: "Percurso do negócio" })).toBeNull();
      expect(within(detalhe).queryByText("Próximo passo")).toBeNull();
      await waitFor(() => expect(document.activeElement).toBe(detalhe));
    } finally { medida.mockRestore(); }
  });
  it("uma lead sem orçamentos diz que os documentos aparecem quando existirem (Rita Sousa, e o WC social perdido)", async () => {
    const { painel, lista } = await negociosDe("Rita Sousa");
    expect(within(lista).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(within(lista).getByRole("button", { name: /Cozinha nova/ }));
    expect(within(painel).getByText("Orçamento, proposta e contrato aparecem aqui quando existirem.")).toBeInTheDocument();
  });
});

describe("Pessoas · os avisos com o painel aberto", () => {
  const abrirPessoas = async (): Promise<HTMLElement> => {
    localStorage.clear();
    localStorage.setItem("olyvia-prototipo-v2", "1");
    render(<PrototipoNegocios />);
    fireEvent.click(screen.getAllByRole("button", { name: "Pessoas" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /Pedro Lopes/ }));
    return screen.findByRole("dialog");
  };
  it("uma ação do painel mostra o aviso dentro dele, legível e clicável (não fica sob o aria-hidden do Radix)", async () => {
    const painel = await abrirPessoas();
    fireEvent.click(within(painel).getByRole("button", { name: "Registar chamada" }));
    const aviso = await within(painel).findByText("Chamada registada");
    expect(acessivel(aviso)).toBe(true);
    expect(document.querySelectorAll(".toasts")).toHaveLength(1);
  });
  it("marcar como perdida deixa o botão Anular acessível, e Anular repõe a lead na lista", async () => {
    const painel = await abrirPessoas();
    fireEvent.click(within(painel).getByRole("button", { name: "Marcar como perdida" }));
    fireEvent.click(await within(painel).findByRole("button", { name: /^Sim, marcar como perdida/ }));
    const anular = await screen.findByRole("button", { name: "Anular" });
    expect(acessivel(anular)).toBe(true);
    expect(document.querySelectorAll(".toasts")).toHaveLength(1);
    fireEvent.click(anular);
    fireEvent.click(await screen.findByRole("button", { name: /Pedro Lopes/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
