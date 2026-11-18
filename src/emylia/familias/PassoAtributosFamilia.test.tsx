// Passo 2 do configurador: o utilizador escolhe que atributo faz as bolinhas de cor e quais compõem o seletor de medida, e exclui produtos.
// Os atributos de cada produto vêm da leitura (a ler / erro / ok); os avisos e erros vêm do núcleo.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { derivarFamilia, itensDosEscolhidos } from "./derivarFamilia";
import { PassoAtributosFamilia } from "./PassoAtributosFamilia";
import type { EstadoAtributos } from "./usarAtributosEscolhidos";
import { DEFS, attrs, produto } from "./fixturesFamilias";

afterEach(cleanup);
const A = produto("a", "Lava-loiça Velar 50", { pvp: 150 }), B = produto("b", "Lava-loiça Velar 60", { pvp: undefined, custo: 100 }), C = produto("c", "Lava-loiça Velar 70");
const LIDOS = new Map<string, AtributoProduto[]>([["a", attrs(50, "o-branco")], ["b", attrs(60, "o-preto")], ["c", attrs(70, "o-pedra")]]);

interface Opc { produtos?: ReturnType<typeof produto>[]; estados?: Map<string, EstadoAtributos>; escolha?: { cor: string | null; medida: string[] } | null }
function montar(o: Opc = {}) {
  const produtos = o.produtos ?? [A, B, C];
  const estados = o.estados ?? new Map(produtos.map((p) => [p.id, { k: "ok", attrs: LIDOS.get(p.id) ?? [] } as EstadoAtributos]));
  const lidos = new Map([...estados].flatMap(([id, e]) => (e.k === "ok" ? [[id, e.attrs] as const] : [])));
  const itens = itensDosEscolhidos(produtos, lidos, DEFS, () => "Louças");
  const d = derivarFamilia(itens, o.escolha ?? null);
  const fn = { onEixos: vi.fn(), onExcluir: vi.fn(), onTentar: vi.fn() };
  render(<PassoAtributosFamilia produtos={produtos} estados={estados} itens={itens} nomes={d.nomes} eixos={d.eixos} problemas={d.problemas} resumo={`${produtos.length} produtos geram ${d.familia.variantes.length} variantes`} {...fn} />);
  return { ...fn, d };
}

describe("PassoAtributosFamilia: os eixos", () => {
  it("oferece como cor cada atributo e «Nenhum»; a omissão (Cor) vem marcada", () => {
    montar();
    const grupo = screen.getByRole("group", { name: "Atributo das bolinhas de cor" });
    expect(within(grupo).getAllByRole("radio").map((r) => (r as HTMLInputElement).labels?.[0].textContent)).toEqual(["Medida", "Cor", "Nenhum (sem bolinhas)"]);
    expect(within(grupo).getByRole("radio", { name: "Cor" })).toBeChecked();
  });

  it("escolher outro atributo para a cor entrega os eixos (e tira esse atributo da medida)", () => {
    const { onEixos } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Nenhum (sem bolinhas)" }));
    expect(onEixos).toHaveBeenLastCalledWith({ cor: null, medida: ["Medida"] });
    fireEvent.click(screen.getByRole("radio", { name: "Medida" }));
    expect(onEixos).toHaveBeenLastCalledWith({ cor: "Medida", medida: [] });
  });

  it("a medida: caixas para os atributos (sem a cor); juntar põe no fim, tirar respeita a ordem", () => {
    const { onEixos } = montar({ escolha: { cor: "Cor", medida: ["Medida"] } });
    const grupo = screen.getByRole("group", { name: "Atributos do seletor de medida" });
    expect(within(grupo).getAllByRole("checkbox").map((c) => (c as HTMLInputElement).labels?.[0].textContent)).toEqual(["Medida"]);
    expect(within(grupo).getByRole("checkbox", { name: "Medida" })).toBeChecked();
    fireEvent.click(within(grupo).getByRole("checkbox", { name: "Medida" }));
    expect(onEixos).toHaveBeenLastCalledWith({ cor: "Cor", medida: [] });
  });

  it("a medida pode ter vários atributos pela ordem escolhida", () => {
    const comCubas = new Map<string, AtributoProduto[]>([["a", [...attrs(50, "o-branco"), { atributoId: "a-cubas", opcaoId: "o-1" }]], ["b", [...attrs(50, "o-branco"), { atributoId: "a-cubas", opcaoId: "o-2" }]]]);
    const estados = new Map<string, EstadoAtributos>([...comCubas].map(([id, a]) => [id, { k: "ok", attrs: a }]));
    const itens = itensDosEscolhidos([A, B], comCubas, DEFS, () => undefined);
    const d = derivarFamilia(itens, { cor: "Cor", medida: ["Nº de cubas", "Medida"] });
    const onEixos = vi.fn();
    render(<PassoAtributosFamilia produtos={[A, B]} estados={estados} itens={itens} nomes={d.nomes} eixos={d.eixos} problemas={d.problemas} resumo="2 produtos geram 2 variantes" onEixos={onEixos} onExcluir={vi.fn()} onTentar={vi.fn()} />);
    expect(screen.getByText(/O seletor mostra os valores juntos, por exemplo «1 cuba · Largura 50 cm»/)).toBeInTheDocument();
  });

  it("sem atributos nenhuns, diz-o", () => {
    montar({ estados: new Map([["a", { k: "ok", attrs: [] }]]), produtos: [A] });
    expect(screen.getByText(/não têm atributos reconhecidos/)).toBeInTheDocument();
  });
});

describe("PassoAtributosFamilia: a tabela dos produtos", () => {
  it("mostra por produto os atributos lidos, o SKU e o preço (só leitura); a cor com a bolinha do hex (decorativa, o nome vai em texto)", () => {
    montar();
    const linha = screen.getByRole("row", { name: /Lava-loiça Velar 50/ });
    expect(linha).toHaveTextContent("Largura 50 cm");
    expect(linha).toHaveTextContent("SKU-a");
    expect(linha).toHaveTextContent("150,00 €");
    expect(linha).toHaveTextContent("Branco");
    const bolinha = linha.querySelector("[data-hex]") as HTMLElement;
    expect(bolinha).toHaveAttribute("aria-hidden", "true");
    expect(bolinha).toHaveStyle({ backgroundColor: "#F5F5F0" });
    expect(within(linha).queryByRole("img")).toBeNull();
    expect(screen.getByRole("row", { name: /Velar 60/ })).toHaveTextContent("sem PVP: custo + margem");
  });


  it("uma cor sem hex diz «sem hex» (não inventa cor) e não bloqueia", () => {
    montar();
    const linha = screen.getByRole("row", { name: /Velar 70/ });
    expect(linha).toHaveTextContent("Pedra");
    expect(linha).toHaveTextContent("sem hex");
    expect(linha.querySelector("[data-hex]")).toBeNull();
  });


  it("«Excluir» entrega o id do produto", () => {
    const { onExcluir } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Excluir Lava-loiça Velar 60 da família" }));
    expect(onExcluir).toHaveBeenCalledWith("b");
  });

  it("enquanto se lê, a linha diz «A ler os atributos…» e não oferece valores", () => {
    montar({ estados: new Map<string, EstadoAtributos>([["a", { k: "a-ler" }], ["b", { k: "ok", attrs: LIDOS.get("b") ?? [] }]]), produtos: [A, B] });
    const linha = screen.getByRole("row", { name: /Velar 50/ });
    expect(linha).toHaveTextContent("A ler os atributos…");
    expect(linha).toHaveAttribute("aria-busy", "true");
  });

  it("um erro de leitura mostra a causa em alerta, com «Tentar de novo: <produto>» só desse produto, e o foco fica na linha", () => {
    const { onTentar } = montar({ estados: new Map<string, EstadoAtributos>([["a", { k: "erro", erro: "Sem permissão." }], ["b", { k: "ok", attrs: LIDOS.get("b") ?? [] }]]), produtos: [A, B] });
    const linha = screen.getByRole("row", { name: /Velar 50/ });
    expect(within(linha).getByRole("alert")).toHaveTextContent("Não foi possível ler os atributos: Sem permissão.");
    fireEvent.click(within(linha).getByRole("button", { name: "Tentar de novo: Lava-loiça Velar 50" }));
    expect(onTentar).toHaveBeenCalledWith("a");
    expect(linha).toHaveFocus();
    expect(within(screen.getByRole("row", { name: /Velar 60/ })).queryByRole("button", { name: /Tentar de novo/ })).toBeNull();
  });

});

describe("PassoAtributosFamilia: o que o núcleo diz", () => {
  it("o resumo «N produtos geram N variantes» está sempre à vista", () => {
    montar();
    expect(screen.getByRole("status", { name: "Resumo da atribuição" })).toHaveTextContent("3 produtos geram 3 variantes");
  });

  it("os erros (valor em falta, medida em intervalo, repetido) vêm em role=alert, em português", () => {
    const iv = new Map<string, AtributoProduto[]>([["a", attrs(50, "o-branco")], ["b", [{ atributoId: "a-medida", medida: { tipo: "1D", dimensao: "largura", valor: { de: 90, ate: 100 }, unidade: "cm" } }, { atributoId: "a-cor", opcaoId: "o-preto" }]], ["c", attrs(null, "o-preto")]]);
    const estados = new Map<string, EstadoAtributos>([...iv].map(([id, a]) => [id, { k: "ok", attrs: a }]));
    montar({ estados });
    const alerta = screen.getByRole("list", { name: "Erros dos atributos" });
    expect(alerta).toHaveTextContent(/medida em intervalo/);
    expect(alerta).toHaveTextContent(/Este produto não tem Medida/);
  });

  it("os avisos (cor sem hex, medida mista) vêm numa lista própria, sem role=alert", () => {
    montar();
    const avisos = screen.getByRole("list", { name: "Avisos dos atributos" });
    expect(avisos).toHaveTextContent(/A cor «Pedra» não tem cor definida \(hex\)/);
    expect(screen.queryByRole("list", { name: "Erros dos atributos" })).toBeNull();
  });

  it("uma medida mista é avisada", () => {
    const mista = new Map<string, AtributoProduto[]>([["a", attrs(50, "o-branco")], ["b", [{ atributoId: "a-medida", medida: { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } }, { atributoId: "a-cor", opcaoId: "o-preto" }]]]);
    montar({ produtos: [A, B], estados: new Map<string, EstadoAtributos>([...mista].map(([id, a]) => [id, { k: "ok", attrs: a }])) });
    expect(screen.getByRole("list", { name: "Avisos dos atributos" })).toHaveTextContent(/A medida mistura/);
  });
});

describe("PassoAtributosFamilia: acessibilidade (A7, A8, A9, A11)", () => {
  const comIntervalo = () => {
    const iv = new Map<string, AtributoProduto[]>([["a", attrs(50, "o-branco")], ["b", [{ atributoId: "a-medida", medida: { tipo: "1D", dimensao: "largura", valor: { de: 90, ate: 100 }, unidade: "cm" } }, { atributoId: "a-cor", opcaoId: "o-preto" }]]]);
    return new Map<string, EstadoAtributos>([...iv].map(([id, a]) => [id, { k: "ok", attrs: a }]));
  };

  it("os erros vêm num contentor role=alert que contém a lista com nome (e não a lista como alerta)", () => {
    montar({ produtos: [A, B], estados: comIntervalo() });
    const alerta = screen.getByRole("alert");
    expect(alerta.tagName).toBe("DIV");
    expect(within(alerta).getByRole("list", { name: "Erros dos atributos" })).toHaveTextContent(/medida em intervalo/);
  });

  it("os erros estão ligados (aria-describedby) aos dois grupos de escolha dos eixos", () => {
    montar({ produtos: [A, B], estados: comIntervalo() });
    expect(screen.getByRole("group", { name: "Atributo das bolinhas de cor" })).toHaveAccessibleDescription(/medida em intervalo/);
    expect(screen.getByRole("group", { name: "Atributos do seletor de medida" })).toHaveAccessibleDescription(/medida em intervalo/);
  });

  it("sem erros, os grupos não têm descrição de erro", () => {
    montar();
    expect(screen.getByRole("group", { name: "Atributos do seletor de medida" })).not.toHaveAccessibleDescription(/Erro/);
  });

  it("há sempre a nota de que o atributo das bolinhas não aparece na medida; e quando a escolha da cor retira um atributo da medida, anuncia-o em role=status", () => {
    montar();
    expect(screen.getByText(/O atributo escolhido para as bolinhas não aparece aqui/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Alteração dos eixos" })).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("radio", { name: "Medida" }));
    expect(screen.getByRole("status", { name: "Alteração dos eixos" })).toHaveTextContent("«Medida» passou a ser o atributo das bolinhas e deixou de fazer parte do seletor de medida.");
    fireEvent.click(screen.getByRole("radio", { name: "Nenhum (sem bolinhas)" }));
    expect(screen.getByRole("status", { name: "Alteração dos eixos" })).toBeEmptyDOMElement();
  });

  it("a tabela rola dentro de uma região com nome, alcançável pelo teclado", () => {
    montar();
    expect(screen.getByRole("region", { name: "Atributos dos produtos" })).toHaveAttribute("tabindex", "0");
  });
});
