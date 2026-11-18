// Passo 3 do configurador: resumo derivado (nada se escreve), tabela «N produtos = N variantes», erros que bloqueiam, avisos e o cartão ao vivo.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AtributoProduto } from "../v2/catalogoModelo";
import { derivarFamilia, itensDosEscolhidos } from "./derivarFamilia";
import { PassoResumoFamilia } from "./PassoResumoFamilia";
import { DEFS, attrs, produto } from "./fixturesFamilias";

afterEach(cleanup);
const A = produto("a", "Lava-loiça Velar 50", { pvp: 150 }), B = produto("b", "Lava-loiça Velar 60", { pvp: 180 }), C = produto("c", "Lava-loiça Velar 60 preta", { pvp: 190 });
const LIDOS = new Map<string, AtributoProduto[]>([["a", attrs(50, "o-branco")], ["b", attrs(60, "o-branco")], ["c", attrs(60, "o-preto")]]);
const montar = (ps = [A, B, C], lidos = LIDOS, escolha: { cor: string | null; medida: string[] } | null = null, outros: string[] = []) => {
  const d = derivarFamilia(itensDosEscolhidos(ps, lidos, DEFS, () => "Louças"), escolha, outros);
  render(<PassoResumoFamilia familia={d.familia} problemas={d.problemas} />);
  return d;
};

describe("PassoResumoFamilia", () => {
  it("mostra os dados derivados em texto (nome, marca, categoria) sem campos para escrever", () => {
    montar();
    const dados = within(screen.getByRole("region", { name: "Dados da família" }));
    expect(dados.getByText("Lava-loiça Velar")).toBeInTheDocument();
    expect(dados.getByText("Cunha")).toBeInTheDocument();
    expect(dados.getByText("Louças")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/saem dos produtos escolhidos: não se escrevem aqui/)).toBeInTheDocument();
  });

  it("a tabela «N produtos geram N variantes»: uma linha por produto, com medida, cor, SKU e preço do produto", () => {
    montar();
    expect(screen.getByRole("status", { name: "Resumo da família" })).toHaveTextContent("3 produtos geram 3 variantes");
    const tabela = screen.getByRole("table", { name: "Variantes geradas" });
    expect(within(tabela).getAllByRole("row")).toHaveLength(4);
    const linha = within(tabela).getByRole("row", { name: /Velar 60 preta/ });
    expect(linha).toHaveTextContent("Largura 60 cm");
    expect(linha).toHaveTextContent("Preto");
    expect(linha).toHaveTextContent("SKU-c");
    expect(linha).toHaveTextContent("190,00 €");
    expect(within(tabela).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Produto", "Medida", "Cor", "SKU", "Preço"]);
  });

  it("os cabeçalhos seguem os eixos escolhidos (e a coluna da cor o atributo das bolinhas)", () => {
    const comCubas = new Map<string, AtributoProduto[]>([["a", [...attrs(50, "o-branco"), { atributoId: "a-cubas", opcaoId: "o-1" }]], ["b", [...attrs(50, "o-preto"), { atributoId: "a-cubas", opcaoId: "o-2" }]]]);
    montar([A, B], comCubas, { cor: "Cor", medida: ["Medida", "Nº de cubas"] });
    expect(within(screen.getByRole("table", { name: "Variantes geradas" })).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Produto", "Medida", "Nº de cubas", "Cor", "SKU", "Preço"]);
  });

  it("com erros mostra-os em role=alert, em português, e não mostra o cartão", () => {
    montar([A, B, C], LIDOS, { cor: null, medida: ["Medida"] });
    const alerta = screen.getByRole("list", { name: "Erros que bloqueiam o guardar" });
    expect(alerta).toHaveTextContent(/têm os mesmos valores em todos os atributos/);
    expect(screen.queryByRole("group", { name: "Pré-visualização da família" })).toBeNull();
    expect(screen.getByText(/aparece quando não houver erros/)).toBeInTheDocument();
  });

  it("uma família que já existe na sessão (mesmo identificador) é erro", () => {
    montar([A, B, C], LIDOS, null, ["fam:lava-loica-velar"]);
    expect(screen.getByRole("list", { name: "Erros que bloqueiam o guardar" })).toHaveTextContent(/Já existe uma família com o identificador/);
  });

  it("sem erros mostra o cartão ao vivo; os avisos (marcas várias) ficam numa lista à parte", () => {
    const outra = produto("c", "Lava-loiça Velar 60 preta", { pvp: 190, marca: "Roca" });
    montar([A, B, outra]);
    expect(screen.queryByRole("list", { name: "Erros que bloqueiam o guardar" })).toBeNull();
    expect(screen.getByRole("group", { name: "Pré-visualização da família" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Avisos da família" })).toHaveTextContent(/várias marcas/);
    expect(within(screen.getByRole("region", { name: "Dados da família" })).getByText("Várias marcas")).toBeInTheDocument();
  });

  it("uma cor sem hex é só aviso: o cartão continua", () => {
    const pedra = new Map(LIDOS).set("c", attrs(60, "o-pedra"));
    montar([A, B, C], pedra);
    expect(screen.getByRole("list", { name: "Avisos da família" })).toHaveTextContent(/A cor «Pedra» não tem cor definida/);
    expect(screen.getByRole("group", { name: "Pré-visualização da família" })).toBeInTheDocument();
  });

  it("os erros e os avisos vêm numa região viva educada (role=status), não em role=alert (já estão no ecrã quando o passo abre)", () => {
    montar([A, B, C], LIDOS, { cor: null, medida: ["Medida"] });
    expect(screen.queryByRole("alert")).toBeNull();
    const viva = screen.getByRole("status", { name: "Erros e avisos da família" });
    expect(within(viva).getByRole("list", { name: "Erros que bloqueiam o guardar" })).toBeInTheDocument();
  });

  it("a tabela rola dentro de uma região com nome, alcançável pelo teclado; a bolinha da cor é decorativa (o nome está em texto)", () => {
    montar();
    expect(screen.getByRole("region", { name: "Variantes geradas" })).toHaveAttribute("tabindex", "0");
    const linha = screen.getByRole("row", { name: /Velar 60 preta/ });
    expect(linha.querySelector("[data-hex]")).toHaveAttribute("aria-hidden", "true");
    expect(within(linha).queryByRole("img")).toBeNull();
  });
});
