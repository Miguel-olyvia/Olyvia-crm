import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { ligarCustos, reporCustos } from "./v2/custosStore";
import { reporCatalogo } from "./v2/catalogoStore";

afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

function pagina(S: Estado = seed()) {
  const run = (fn: () => void) => fn();
  ligarCustos(S);
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
  return S;
}
const escrever = (rot: string | RegExp, v: string) => fireEvent.change(screen.getByLabelText(rot), { target: { value: v } });

describe("Criar no Catálogo", () => {
  it("o botão Criar abre o criador no tipo do separador aberto, e «Voltar» fecha-o", () => {
    pagina();
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(screen.getByRole("heading", { level: 1, name: "Criar no Catálogo" })).toBeInTheDocument();
    const tipos = screen.getByRole("radiogroup", { name: "O que criar" });
    expect(within(tipos).getAllByRole("radio")).toHaveLength(5);
    expect(within(tipos).getByRole("radio", { name: /^Produto/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
  });

  it("serviço: a pré-visualização acompanha o que se escreve, o botão só liga quando está pronto e a ficha abre no fim", () => {
    const S = pagina();
    fireEvent.click(screen.getByRole("tab", { name: "Serviços" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    const previa = () => screen.getByRole("complementary", { name: "Pré-visualização" });
    const botao = () => within(previa()).getByRole("button", { name: "Criar o serviço" });
    expect(within(previa()).getByText("Serviço novo")).toBeInTheDocument();
    expect(botao()).toBeDisabled();
    expect(within(previa()).getByText("Escreva o nome do serviço.")).toBeInTheDocument();
    escrever("Nome do serviço", "Montagem de painel acústico");
    expect(within(previa()).getByText("Montagem de painel acústico")).toBeInTheDocument();
    // a unidade m² escolhe a medida «m² de pavimento»
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Unidade" })).getByRole("radio", { name: "m²" }));
    expect(within(screen.getByRole("radiogroup", { name: "A quantidade vem de" })).getByRole("radio", { name: /m² de pavimento/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("exemplo-criar")).toHaveTextContent("4 m² de pavimento");
    // preço de tabela: sem preço não se cria; com preço sim
    fireEvent.click(screen.getByRole("radio", { name: /Preço de tabela/ }));
    expect(botao()).toBeDisabled();
    escrever(/Preço de tabela por m²/, "38,50");
    expect(within(previa()).getByText(/38,50/)).toBeInTheDocument();
    expect(botao()).toBeEnabled();
    fireEvent.click(botao());
    expect(screen.getByRole("heading", { level: 1, name: "Montagem de painel acústico" })).toBeInTheDocument();
    expect(S.custos!.receitas["n-montagem-de-painel-acustico"]).toMatchObject({ modo: "tabela", precoTabela: 38.5, medida: "pav" });
    // de volta à lista, o serviço está lá com o selo
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    fireEvent.click(screen.getByRole("tab", { name: "Serviços" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar serviço" }), { target: { value: "painel acústico" } });
    expect(screen.getByText("Criado aqui")).toBeInTheDocument();
  });

  it("equipamento: o €/h aparece já e, criado, fica no topo do separador com o selo «Novo»", () => {
    pagina();
    fireEvent.click(screen.getByRole("tab", { name: "Equipamentos" }));
    // 27/10: o «Criar» do cabeçalho cria o tipo do separador aberto
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    escrever("Nome do equipamento", "Lixadora de parede");
    escrever("Preço de compra", "1000");
    escrever("Vida útil", "2000");
    expect(within(screen.getByRole("complementary", { name: "Pré-visualização" })).getByText("0,50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Criar o equipamento" }));
    const painel = screen.getByRole("tabpanel");
    expect(within(painel).getAllByRole("listitem")[0]).toHaveTextContent(/Lixadora de parede\s*Novo/);
    expect(screen.getByRole("status", { name: "Avisos" })).toHaveTextContent("Equipamento «Lixadora de parede» criado.");
  });
});
