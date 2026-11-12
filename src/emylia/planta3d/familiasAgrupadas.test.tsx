// Uma família feita de produtos que já existem no catálogo aparece UM cartão na barra de produtos, e esses produtos deixam de aparecer soltos na lista.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { BarraProdutos } from "./BarraProdutos";
import { comNome, criarFamiliaVazia, familiaDeProdutos, palpiteDoProduto, paraFamilia, refDoProduto } from "./configurador";
import { registarFamilias } from "./familias";
import { comDemonstracao, produtosParaEspaco } from "./catalogo3d";

afterEach(() => { cleanup(); registarFamilias([]); });

const K = catalogo0();
const VELAR = K.produtos.filter((p) => /lava-lou.as VELAR 1 CUBA/i.test(p.n));
const todos = comDemonstracao(K.produtos, K.arvore);

function montar() {
  const produtos = produtosParaEspaco(todos, K.arvore, "cozinha", { max: 100000 }), f = vi.fn();
  const ui = <BarraProdutos produtos={produtos} espaco="cozinha" onEspaco={f} onPegar={f} onMover={f} onLargar={f} onCancelar={f} onJuntar={f} onConjunto={f} onBancada={f} />;
  const r = render(ui);
  return { ...r, rerenderComVersao: (v: unknown) => r.rerender(<BarraProdutos produtos={produtos} espaco="cozinha" versaoFamilias={v} onEspaco={f} onPegar={f} onMover={f} onLargar={f} onCancelar={f} onJuntar={f} onConjunto={f} onBancada={f} />) };
}
const tabsLava = () => screen.getAllByRole("tab").filter((t) => /^Lava-loiças/.test(t.textContent ?? ""));
/** o separador das famílias (o primeiro) e o do catálogo solto (o segundo) */
const verFamilias = () => fireEvent.click(tabsLava()[0]);
const verSoltos = () => { fireEvent.click(tabsLava()[1]); fireEvent.change(screen.getByLabelText("Procurar no catálogo"), { target: { value: "velar" } }); };
const nomesSoltos = () => within(screen.getByRole("list", { name: "Produtos do catálogo" })).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");
const soltosDaVelar = () => nomesSoltos().filter((n) => /VELAR 1 CUBA/i.test(n));

function registarVelar() {
  const refs = VELAR.map((p) => refDoProduto(p));
  const atrib = VELAR.map((p) => { const a = palpiteDoProduto(p.n, { sub: p.sub, tipo: "lava_loica" }); return { produtoId: p.id, medida: a.medida, dim: a.dim, acabamento: a.acabamento, cor: a.cor, codigo: a.codigo }; });
  const { familia } = familiaDeProdutos({ ...comNome(criarFamiliaVazia(), "Lava-louças VELAR"), marca: "FRASA" }, refs, atrib);
  registarFamilias([paraFamilia(familia)]);
  return familia;
}

describe("barra de produtos: família agrupada de produtos do catálogo", () => {
  it("o catálogo de exemplo tem as 5 lava-loiças Velar (a base destes testes)", () => {
    expect(VELAR).toHaveLength(5);
  });

  it("antes de agrupar, as 5 Velar aparecem soltas na lista «Todos»", () => {
    montar();
    verSoltos();
    expect(soltosDaVelar()).toHaveLength(5);
  });

  it("depois de agrupar: UM cartão da família com as 5 medidas, e nenhuma das 5 solta na lista", () => {
    const { rerenderComVersao } = montar();
    const familia = registarVelar();
    rerenderComVersao(familia);
    verFamilias();
    const cartoes = within(screen.getByRole("list", { name: "Famílias de produtos" })).getAllByRole("listitem").filter((li) => within(li).queryByText("Lava-louças VELAR"));
    expect(cartoes).toHaveLength(1);
    expect(within(cartoes[0]).getByText(/5 variantes/)).toBeInTheDocument();
    expect(within(cartoes[0]).getAllByRole("option")).toHaveLength(5);
    verSoltos();
    expect(screen.queryByRole("list", { name: "Produtos do catálogo" })).not.toBeInTheDocument();
  });

  it("a variante escolhida no cartão mostra o SKU e o preço do produto real", () => {
    const { rerenderComVersao } = montar();
    const familia = registarVelar();
    rerenderComVersao(familia);
    verFamilias();
    const p = VELAR.find((x) => /CUBA 50$/.test(x.n))!;
    const cartao = within(screen.getByRole("list", { name: "Famílias de produtos" })).getAllByRole("listitem").find((li) => within(li).queryByText("Lava-louças VELAR"))!;
    const select = within(cartao).getByRole("combobox", { name: "Medida" });
    fireEvent.change(select, { target: { value: familia.medidas.find((m) => m.rotulo === "50 cm")!.id } });
    expect(within(cartao).getByText(new RegExp(`SKU ${p.sku}\\b`))).toBeInTheDocument();
  });

  it("os outros produtos (não agrupados) continuam na lista", () => {
    const { rerenderComVersao } = montar();
    rerenderComVersao(registarVelar());
    fireEvent.click(screen.getByRole("tab", { name: /^Todos/ }));
    expect(nomesSoltos().length).toBeGreaterThan(5);
  });
});

describe("barra de produtos: atributos extra no cartão da família", () => {
  const ref = (id: string, n: string, preco: number) => ({ id, n, marca: "FRASA", sku: id.toUpperCase(), preco, semPvp: false });
  const atr = (produtoId: string, medida: string, acabamento: string, cubas: string) =>
    ({ produtoId, medida, dim: [54, 44, 20] as [number, number, number], acabamento, cor: acabamento === "Inox" ? "#c3c7ca" : "#151617", codigo: acabamento.slice(0, 2).toUpperCase(), extras: { "Nº de cubas": cubas } });
  const registarComCubas = () => {
    const refs = [ref("a", "Velar 50 1 cuba", 100), ref("b", "Velar 50 2 cubas", 120), ref("c", "Velar 50 2 cubas Negro", 130)];
    const atrs = [atr("a", "50 cm", "Inox", "1 cuba"), atr("b", "50 cm", "Inox", "2 cubas"), atr("c", "50 cm", "Negro", "2 cubas")];
    const { familia, conflitos } = familiaDeProdutos({ ...comNome(criarFamiliaVazia(), "Velar com cubas"), marca: "FRASA", atributos: ["Nº de cubas"] }, refs, atrs);
    expect(conflitos).toEqual([]);
    registarFamilias([paraFamilia(familia)]);
    return familia;
  };

  it("o seletor de medida mostra «50 cm · 2 cubas» e só as combinações que existem (as bolinhas são a cor)", () => {
    const { rerenderComVersao } = montar();
    rerenderComVersao(registarComCubas());
    verFamilias();
    const cartao = within(screen.getByRole("list", { name: "Famílias de produtos" })).getAllByRole("listitem").find((li) => within(li).queryByText("Velar com cubas"))!;
    const select = within(cartao).getByRole("combobox", { name: "Medida" });
    expect(within(cartao).getAllByRole("option").map((o) => o.textContent)).toEqual(["50 cm · 1 cuba · A", "50 cm · 2 cubas · B"]);
    // «1 cuba» só existe em Inox; «2 cubas» existe em Inox e Negro
    expect(within(cartao).getAllByRole("button", { name: /^Acabamento / })).toHaveLength(1);
    fireEvent.change(select, { target: { value: (within(cartao).getAllByRole("option")[1] as HTMLOptionElement).value } });
    expect(within(cartao).getAllByRole("button", { name: /^Acabamento / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Acabamento Inox", "Acabamento Negro"]);
    fireEvent.click(within(cartao).getByRole("button", { name: "Acabamento Negro" }));
    expect(within(cartao).getByText(/SKU C\b/)).toBeInTheDocument();
  });
});
