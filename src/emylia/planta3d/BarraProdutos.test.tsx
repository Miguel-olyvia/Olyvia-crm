// A lista «Produtos do catálogo» do protótipo mostra só os produtos com o modelo 3D do HTML (SO_COM_MODELO_HTML, catalogo3d.ts).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogo0 } from "../v2/catalogoModelo";
import { BarraProdutos } from "./BarraProdutos";
import { categoriaDoTipo, genericoServe } from "./categoriasGlb";
import { MOSTRAR_GENERICOS, SO_COM_MODELO_HTML, comDemonstracao, produtosParaEspaco, temModeloGenerico, temModeloHtml, type ProdutoModelo3D } from "./catalogo3d";
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
    const com = produtos.filter(temModeloHtml), gen = MOSTRAR_GENERICOS ? produtos.filter((m) => temModeloGenerico(m) && genericoServe(m.mockup3d.generico?.id ?? categoriaDoTipo(m.tipo, m.nome)?.id, "cozinha")) : [];
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
    // os «3D parecido» (lava-loiça LEMIS, placas TEKA e AEG) e os tampos fora das séries do HTML continuam fora
    for (const fora of [/LEMIS/, /CRISTAL PRETO/, /PLACA COM EXAUSTOR/, /BIANCO ORO/, /pladur/]) expect(nomes).not.toMatch(fora);
    // com MOSTRAR_GENERICOS, os que têm modelo genérico (frigoríficos, exaustores, misturadoras sem modelo do HTML) aparecem depois dos do HTML
    if (MOSTRAR_GENERICOS) expect(nomes.indexOf("VELAR 1 CUBA 50")).toBeLessThan(Math.max(nomes.search(/Frigorifico|Exaustor|SOPHIE|Armário Inferior/), 0) || Infinity);
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar no catálogo" }), { target: { value: "lemis" } });
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
    const todos = separadores().find((s) => s?.startsWith("Todos (")) ?? "";
    expect(Number(/\((\d+)\)/.exec(todos)?.[1])).toBeGreaterThan(100);
    expect(within(screen.getByRole("list", { name: "Produtos do catálogo" })).getAllByText("3D genérico").length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ o filtro «Modelo 3D»: Todos / Com modelo 3D / Genérico */
const grupoFiltro = () => within(screen.getByRole("group", { name: "Modelo 3D" }));
const botaoFiltro = (nome: string) => grupoFiltro().getByRole("button", { name: nome });
const genericosDe = (ps: readonly ProdutoModelo3D[], e: TipoEspaco) => ps.filter((m) => temModeloGenerico(m) && genericoServe(m.mockup3d.generico?.id ?? categoriaDoTipo(m.tipo, m.nome)?.id, e));
const FAMILIAS_TABS = ["Torneiras (7)", "Lava-loiças (6)", "Placas (3)", "Bancadas (1)"];
const ativo = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent;

describe("filtro «Modelo 3D»", () => {
  it("tem três botões com aria-pressed (Todos por omissão), junto à pesquisa, com área de toque de 44 px", () => {
    montar("cozinha");
    const g = screen.getByRole("group", { name: "Modelo 3D" });
    expect(within(g).getAllByRole("button").map((b) => b.textContent)).toEqual(["Todos", "Com modelo 3D", "Genérico"]);
    expect(botaoFiltro("Todos")).toHaveAttribute("aria-pressed", "true");
    expect(botaoFiltro("Com modelo 3D")).toHaveAttribute("aria-pressed", "false");
    expect(botaoFiltro("Genérico")).toHaveAttribute("aria-pressed", "false");
    for (const b of within(g).getAllByRole("button")) expect(b.className).toContain("min-h-11");
    fireEvent.click(botaoFiltro("Genérico"));
    expect(botaoFiltro("Genérico")).toHaveAttribute("aria-pressed", "true");
    expect(botaoFiltro("Todos")).toHaveAttribute("aria-pressed", "false");
  });

  it("a partição é limpa: nenhum produto tem ao mesmo tempo modelo do HTML e modelo genérico", () => {
    for (const e of ["cozinha", "casa_banho", "outro"] as const) for (const m of produtosParaEspaco(todos, K.arvore, e, { max: 100000 })) expect(temModeloHtml(m) && temModeloGenerico(m), m.nome).toBe(false);
  });

  it("«Com modelo 3D»: só os produtos do HTML; «Todos (N)» e as contagens saem dos filtrados", () => {
    const produtos = montar("cozinha");
    const com = produtos.filter(temModeloHtml);
    fireEvent.click(botaoFiltro("Com modelo 3D"));
    const s = separadores();
    expect(s[s.length - 1]).toBe(`Todos (${com.length})`);
    expect(s.slice(0, 4)).toEqual(["Torneiras (7)", "Lava-loiças (6)", "Placas (3)", "Bancadas (1)"]);
    fireEvent.click(screen.getByRole("tab", { name: /^Todos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    const nomes = nomesNaLista().join("\n");
    expect(nomes).toMatch(/VELAR 1 CUBA 50/);
    expect(nomes).not.toMatch(/Frigorifico|Exaustor/);
    expect(within(screen.getByRole("list", { name: "Produtos do catálogo" })).queryAllByText("3D genérico")).toHaveLength(0);
  });

  it("«Genérico»: só os de modelo genérico, os separadores de famílias desaparecem e o activo cai no de omissão", () => {
    const produtos = montar("cozinha");
    const gen = genericosDe(produtos, "cozinha");
    expect(gen.length).toBeGreaterThan(0);
    expect(ativo()).toBe("Torneiras (7)");
    fireEvent.click(botaoFiltro("Genérico"));
    const s = separadores();
    for (const f of FAMILIAS_TABS) expect(s).not.toContain(f);
    expect(s[s.length - 1]).toBe(`Todos (${gen.length})`);
    expect(ativo()).toBe(s[0]); // o primeiro grupo do catálogo
    fireEvent.click(screen.getByRole("tab", { name: /^Todos/ }));
    const lista = screen.getByRole("list", { name: "Produtos do catálogo" });
    expect(within(lista).queryAllByText("3D do catálogo")).toHaveLength(0);
    expect(within(lista).getAllByText("3D genérico").length).toBeGreaterThan(0);
  });

  it("voltar a «Todos» repõe os separadores de famílias e a contagem completa", () => {
    const produtos = montar("cozinha");
    fireEvent.click(botaoFiltro("Genérico"));
    fireEvent.click(botaoFiltro("Todos"));
    const s = separadores();
    expect(s.slice(0, 4)).toEqual(["Torneiras (7)", "Lava-loiças (6)", "Placas (3)", "Bancadas (1)"]);
    expect(s[s.length - 1]).toBe(`Todos (${produtos.filter(temModeloHtml).length + genericosDe(produtos, "cozinha").length})`);
  });

  it("mudar o filtro repõe o «Mostrar mais» ao primeiro passo (24)", () => {
    montar("cozinha");
    fireEvent.click(screen.getByRole("tab", { name: /^Todos/ }));
    expect(nomesNaLista()).toHaveLength(24);
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    expect(nomesNaLista().length).toBeGreaterThan(24);
    fireEvent.click(botaoFiltro("Com modelo 3D"));
    expect(nomesNaLista().length).toBeLessThanOrEqual(24);
    fireEvent.click(botaoFiltro("Todos"));
    expect(nomesNaLista()).toHaveLength(24);
  });

  it("sem nenhum produto para o filtro neste espaço, diz-se qual é o filtro", () => {
    montar("casa_banho"); // o HTML não cobre a casa de banho
    fireEvent.click(botaoFiltro("Com modelo 3D"));
    expect(screen.getByRole("status")).toHaveTextContent(/Com modelo 3D/);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    fireEvent.click(botaoFiltro("Todos"));
    expect(screen.getAllByRole("tab").length).toBeGreaterThan(0);
  });

  it("os cartões e os produtos com GLB do fabricante levam o selo «3D do fabricante»", () => {
    montar("cozinha");
    // a torneira Smooth tem GLB em cromo (a primeira acabamento da família na lista de torneiras)
    fireEvent.click(screen.getByRole("tab", { name: "Torneiras (7)" }));
    expect(screen.getAllByText("3D do fabricante").length).toBeGreaterThan(0);
  });
});
