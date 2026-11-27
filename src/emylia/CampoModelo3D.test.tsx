// O seletor «Modelo 3D» (produto, subcategoria e categoria): primeira opção «Automático (herda: …)», a lista agrupada, o texto «Herdado da subcategoria X: Y».
// É o dropdown com pesquisa do Catálogo (ComboPesquisa): o botão mostra a escolha atual e as opções só existem com o painel aberto.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampoModelo3D } from "./CampoModelo3D";
import { MODELOS_ESCOLHA } from "./planta3d/modelos3dEscolha";

afterEach(cleanup);

const AUTO = { modelo: null, origem: "automatico", de: null } as const;
const botao = () => screen.getByRole("combobox", { name: /^Modelo 3D/ });
const abrir = () => { fireEvent.click(botao()); return screen.getByRole("listbox", { name: "Modelo 3D" }); };

describe("CampoModelo3D", () => {
  it("o rótulo é «Modelo 3D» e, sem escolha, o botão mostra o «Automático (herda: …)»", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} />);
    expect(botao()).toHaveTextContent(/Automático \(herda: /);
  });

  it("a primeira opção da lista, a omissão, é o «Automático (herda: …)»", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} />);
    abrir();
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Automático (herda: o classificador, pelo nome e pela subcategoria)");
  });

  it("sem nada acima, diz que o 3D vem do classificador, pelo nome e pela subcategoria", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} />);
    expect(botao()).toHaveTextContent("Automático (herda: o classificador, pelo nome e pela subcategoria)");
    expect(screen.getByText(/Sem escolha: o 3D usa o classificador/)).toBeInTheDocument();
  });

  it("sem saber o que está acima (heranca null), não afirma o classificador: «Automático (herda do nível de cima)» e a nota recebida", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={null} semHeranca="Sem escolha: herda do nível de cima; não foi possível ler a escolha da subcategoria e da categoria." />);
    expect(botao()).toHaveTextContent("Automático (herda do nível de cima)");
    expect(screen.getByText(/não foi possível ler a escolha da subcategoria/)).toBeInTheDocument();
    expect(screen.queryByText(/classificador/)).toBeNull();
  });

  it("herdado da subcategoria: a omissão diz o modelo e de onde vem, e o texto «Herdado da subcategoria X: Y» aparece", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={{ modelo: "sanita", origem: "subcategoria", de: "Sanitas" }} />);
    expect(botao()).toHaveTextContent("Automático (herda: Sanita de chão, da subcategoria Sanitas)");
    expect(screen.getByText("Herdado da subcategoria Sanitas: Sanita de chão.")).toBeInTheDocument();
  });

  it("herdado do Modelo (27/11): «Herdado do modelo X: Y», no botão e na frase", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={{ modelo: "bide", origem: "modelo", de: "SMOOTH" }} nivel="produto" />);
    expect(botao()).toHaveTextContent("Automático (herda: Bidé, do modelo SMOOTH)");
    expect(screen.getByText("Herdado do modelo SMOOTH: Bidé.")).toBeInTheDocument();
  });

  it("escolhido no próprio Modelo: «Escolhido neste modelo: Y»", () => {
    render(<CampoModelo3D valor="bide" onChange={vi.fn()} heranca={AUTO} nivel="modelo" />);
    expect(screen.getByText("Escolhido neste modelo: Bidé.")).toBeInTheDocument();
  });

  it("herdado da categoria", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={{ modelo: "banheira", origem: "categoria", de: "Casa de banho" }} />);
    expect(screen.getByText("Herdado da categoria Casa de banho: Banheira.")).toBeInTheDocument();
  });

  it("com um modelo escolhido, o botão mostra-o e a frase diz que é deste nível (sem o texto de herança)", () => {
    render(<CampoModelo3D valor="bide" onChange={vi.fn()} heranca={{ modelo: "sanita", origem: "subcategoria", de: "Sanitas" }} nivel="produto" />);
    expect(botao()).toHaveTextContent("Bidé");
    expect(screen.queryByText(/^Herdado da/)).toBeNull();
    expect(screen.getByText("Escolhido neste produto: Bidé.")).toBeInTheDocument();
  });

  it("as frases mudam com o nível (subcategoria e categoria)", () => {
    const { rerender } = render(<CampoModelo3D valor="bide" onChange={vi.fn()} heranca={AUTO} nivel="subcategoria" />);
    expect(screen.getByText("Escolhido nesta subcategoria: Bidé.")).toBeInTheDocument();
    rerender(<CampoModelo3D valor="bide" onChange={vi.fn()} heranca={AUTO} nivel="categoria" />);
    expect(screen.getByText("Escolhido nesta categoria: Bidé.")).toBeInTheDocument();
  });

  it("a lista traz todos os modelos escolháveis, mais a omissão, e os cabeçalhos dos grupos (só visuais)", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} />);
    const lista = abrir();
    const opcoes = screen.getAllByRole("option");
    expect(opcoes).toHaveLength(MODELOS_ESCOLHA.length + 1);
    expect(screen.getByRole("option", { name: "Revestimento no chão" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Revestimento na parede" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sem modelo (caixa com as medidas)" })).toBeInTheDocument();
    const cabecalhos = Array.from(lista.querySelectorAll('li[role="presentation"]')).map((x) => x.textContent);
    expect(cabecalhos).toEqual(["Casa de banho", "Cozinha", "Eletrodomésticos", "Quarto, sala e decoração", "Modelos exactos do catálogo 3D", "Sem modelo e revestimentos"]);
    for (const c of lista.querySelectorAll('li[role="presentation"]')) expect(c).toHaveAttribute("aria-hidden", "true");
  });

  it("a lista tem pesquisa (são muitos modelos): escrever filtra e os cabeçalhos só ficam com grupos que têm resultados", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} />);
    const lista = abrir();
    fireEvent.change(screen.getByRole("combobox", { name: "Pesquisar Modelo 3D" }), { target: { value: "sanita" } });
    const nomes = screen.getAllByRole("option").map((o) => o.textContent);
    expect(nomes).toContain("Sanita de chão");
    expect(nomes).toContain("Sanita suspensa");
    expect(nomes).not.toContain("Cama");
    expect(Array.from(lista.querySelectorAll('li[role="presentation"]')).map((x) => x.textContent)).toEqual(["Casa de banho"]);
  });

  it("escolher um modelo chama onChange com o id; voltar à omissão chama com null (herda)", () => {
    const onChange = vi.fn();
    const { rerender } = render(<CampoModelo3D valor={null} onChange={onChange} heranca={AUTO} />);
    abrir();
    fireEvent.click(screen.getByRole("option", { name: "Sanita de chão" }));
    expect(onChange).toHaveBeenLastCalledWith("sanita");
    rerender(<CampoModelo3D valor="sanita" onChange={onChange} heranca={AUTO} />);
    abrir();
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("um id que a lista não conhece (vindo da base) continua visível, e não se perde", () => {
    render(<CampoModelo3D valor="modelo_novo" onChange={vi.fn()} heranca={AUTO} />);
    expect(botao()).toHaveTextContent("modelo_novo (modelo desconhecido)");
  });

  it("desativado (sem permissão ou a gravar): o botão fica desativado", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} desativado />);
    expect(botao()).toBeDisabled();
  });

  it("o erro aparece em português com role=alert", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} erro="Não foi possível gravar o modelo 3D." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível gravar o modelo 3D.");
  });

  it("o botão fica ligado (aria-describedby) à frase de herança e, se houver, ao erro", () => {
    const { rerender } = render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} />);
    const ids = () => (botao().getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    expect(ids()).toHaveLength(1);
    expect(document.getElementById(ids()[0])).toHaveTextContent(/Sem escolha/);
    rerender(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} erro="Não foi possível gravar o modelo 3D." />);
    expect(ids()).toHaveLength(2);
    expect(document.getElementById(ids()[1])).toHaveTextContent("Não foi possível gravar o modelo 3D.");
  });

  it("ocupado (a gravar): aria-disabled em vez de disabled, não abre a lista e mantém o foco", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} ocupado />);
    botao().focus();
    expect(botao()).toHaveAttribute("aria-disabled", "true");
    expect(botao()).not.toBeDisabled();
    fireEvent.click(botao());
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.keyDown(botao(), { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(botao()).toHaveFocus();
  });

  it("todas as frases acabam em ponto final", () => {
    const { rerender } = render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} />);
    expect(screen.getByText(/^Sem escolha/).textContent).toMatch(/\.$/);
    rerender(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={{ modelo: "sanita", origem: "subcategoria", de: "Sanitas" }} />);
    expect(screen.getByText(/^Herdado da/).textContent).toMatch(/\.$/);
    rerender(<CampoModelo3D valor="bide" onChange={vi.fn()} heranca={AUTO} />);
    expect(screen.getByText(/^Escolhido/).textContent).toMatch(/\.$/);
  });

  it("a frase de estado é uma região viva (aria-live) para o leitor de ecrã", () => {
    render(<CampoModelo3D valor={null} onChange={vi.fn()} heranca={AUTO} />);
    expect(screen.getByText(/Sem escolha: o 3D usa o classificador/)).toHaveAttribute("aria-live", "polite");
  });
});
