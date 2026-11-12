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
