// A lista «Produtos do catálogo» do protótipo mostra só os produtos com o modelo 3D do HTML (SO_COM_MODELO_HTML, catalogo3d.ts).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { BarraProdutos } from "./BarraProdutos";
import { MOSTRAR_GENERICOS, SO_COM_MODELO_HTML, comDemonstracao, produtosParaEspaco, temModeloGenerico, temModeloHtml } from "./catalogo3d";
import type { TipoEspaco } from "./modelo";

afterEach(cleanup);
const K = catalogo0();
const todos = comDemonstracao(K.produtos, K.arvore);
function montar(espaco: TipoEspaco) {
  const produtos = produtosParaEspaco(todos, K.arvore, espaco, { max: 100000 });
  const f = vi.fn();
  render(<BarraProdutos produtos={produtos} espaco={espaco} onEspaco={f} onPegar={f} onMover={f} onLargar={f} onCancelar={f} onJuntar={f} onConjunto={f} onBancada={f} />);
  return produtos;
}
const separadores = () => screen.getAllByRole("tab").map((t) => t.textContent);
const nomesNaLista = () => within(screen.getByRole("list", { name: "Produtos do catálogo" })).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");

describe("só os produtos com o modelo 3D do HTML", () => {
  it("o interruptor está ligado (um só sítio: catalogo3d.ts)", () => expect(SO_COM_MODELO_HTML).toBe(true));

  it("cozinha: os separadores contam os do HTML e, com MOSTRAR_GENERICOS, os de modelo genérico", () => {
    const produtos = montar("cozinha");
    const com = produtos.filter(temModeloHtml), gen = MOSTRAR_GENERICOS ? produtos.filter(temModeloGenerico) : [];
    const s = separadores();
    expect(s.slice(0, 4)).toEqual(["Torneiras (7)", "Lava-loiças (6)", "Placas (3)", "Bancadas (1)"]);
    expect(s).toContain(`Lava-loiças (${com.filter((m) => m.tipo === "lava_loica").length})`);
    expect(s[s.length - 1]).toBe(`Todos (${com.length + gen.length})`);
    expect(com.filter((m) => m.tipo === "lava_loica")).toHaveLength(32);
    // Round, Noah, Smooth, Stick, Cira, Alexia e as duas Granada do catálogo (abatível e extraível)
    expect(com.filter((m) => m.tipo === "torneira_cozinha")).toHaveLength(8);
    expect(com.filter((m) => m.tipo === "bancada")).toHaveLength(8);
  });

  it("os «3D parecido» e os «Sem modelo do HTML» não aparecem, nem na pesquisa", () => {
    montar("cozinha");
    fireEvent.click(screen.getByRole("tab", { name: /^Todos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    const nomes = nomesNaLista().join("\n");
    expect(nomes).toMatch(/VELAR 1 CUBA 50/);
    for (const fora of [/LEMIS/, /TEKA/, /AEG/, /SOPHIE/, /Bruma/, /Frigorífico/, /Forno/, /Exaustor/, /BIANCO ORO/, /pladur/]) expect(nomes).not.toMatch(fora);
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar no catálogo" }), { target: { value: "teka" } });
    expect(screen.getByText("Nenhum produto serve este espaço com este filtro.")).toBeInTheDocument();
  });

  it("as famílias sem modelo (móveis de cozinha, banho) e os conjuntos ficam fora", () => {
    montar("cozinha");
    expect(separadores().some((s) => /Móveis e acessórios|Conjuntos/.test(s ?? ""))).toBe(false);
  });

  it("casa de banho: o HTML não a cobre; com MOSTRAR_GENERICOS aparecem os produtos com modelo genérico (selo «3D genérico»)", () => {
    const produtos = montar("casa_banho");
    expect(MOSTRAR_GENERICOS).toBe(true);
    const gen = produtos.filter(temModeloGenerico);
    expect(gen.length).toBeGreaterThan(100);
    expect(separadores()).toContain(`Todos (${gen.length})`);
    expect(within(screen.getByRole("list", { name: "Produtos do catálogo" })).getAllByText("3D genérico").length).toBeGreaterThan(0);
  });
});
