// Testes da seleção guiada das Necessidades (14/10/2026): os cartões que ligam e desligam, o mapeamento serviço ↔ produto ↔ pergunta,
// os nomes curtos dos cartões, os filtros com a pesquisa, as Escolhas do cliente dentro da etapa e "O que o cliente fornece".
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, servicosVisita, type Estado, type Negocio } from "./motor";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";
import { PREFIXO_CLIENTE, PREFIXO_PROD, ligarCatalogo, linhasDosProdutos, obrigacoes } from "./produtosVisita";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { Produto } from "./v2/catalogoModelo";
import { obrigacoesAMostrar, tilesServicos, tocarProdutoGuiado, type TileServico } from "./necessidades";
import {
  contavel, encurtar, fornecerTodos, itensFornece, lerCores, escreverCores, marcarFornece, mostraAjuste, oficiosPorUso, ordenarMobilidade, ordenarParaTroca, passosSelecao,
  responderTroca, servicosFiltrados, tocarServico, trocaResolvida, vizinho,
} from "./selecao";
import { SelecaoGuiada } from "./SelecaoGuiada";
import { GuiaPassoCtx } from "./guiaPasso";

const prodN = (n: string) => lerCatalogo().produtos.find((p) => p.n === n)!;
function preencher(d: Negocio, gs: Grupo[]) {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
}
function preparar() {
  const S = seed();
  const A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1035)!; // Hugo Matos, WC na Visita (pav 5, par 16, pts 3, pcs 3)
  preencher(d, [EXTERIOR, INTERIOR, AREA, ESCOLHAS]);
  return { S, A, d };
}
beforeEach(() => ligarCatalogo(lerCatalogo));
afterEach(() => { cleanup(); ligarCatalogo(null); reporCatalogo(); vi.useRealTimers(); });

/* ------------------------------------------------------------------ nomes curtos */
describe("os nomes nos cartões: no máximo o essencial, o resto na 2.ª linha", () => {
  it("tira as medidas e o que vem depois do separador", () => {
    const m = encurtar("Móvel BRAGA c/ lavatório 80x81x36 - 2 Portas c/ Prat + 2 Gav c/ Fundo Reduzido");
    expect(m.nome).toBe("Móvel BRAGA c/ lavatório");
    expect(m.detalhe).toContain("80x81x36");
    expect(m.detalhe).toContain("2 Portas");
  });
  it("tira a referência, as medidas e o prefixo da categoria (que passa ao detalhe)", () => {
    const b = encurtar("Base de Duche Extraplana Stone 80x120 cm Antiderrapante Branco REF. BDS80120", { categoria: "Bases de duche" });
    expect(b.nome).toBe("Extraplana Stone Antiderrapante Branco");
    expect(b.detalhe).toMatch(/^Bases de duche · /);
    expect(b.detalhe).toContain("REF. BDS80120");
    expect(b.detalhe).toContain("80x120 cm");
  });
  it("o prefixo da categoria fica quando sobraria uma só palavra", () => {
    expect(encurtar("Sanita compacta", { categoria: "Sanitas" }).nome).toBe("Sanita compacta");
  });
  it("o prefixo fica quando o resto começaria por 'de' ou 'para'", () => {
    expect(encurtar("Toalheiro DE MOVEL MOSS 26cm", { categoria: "Toalheiros" })).toEqual({ nome: "Toalheiro de movel moss", detalhe: "26cm" });
  });
  it("os nomes em maiúsculas passam a frase", () => {
    expect(encurtar("SANITA BOHEMIC BTW BRANCO BRILHO", { categoria: "Sanitas" })).toEqual({ nome: "Bohemic btw branco brilho", detalhe: "Sanitas" });
  });
  it("nos serviços: sem 'Instalação', sem as medidas e sem o resto depois do separador", () => {
    const s = encurtar("Instalação Janela Oscilobatente 1 folha 789mmx1100mm - Branco / Branco C/Perfil de união 140218 | Direita |", { servico: true });
    expect(s.nome).toBe("Janela oscilobatente 1 folha");
    expect(s.detalhe).toContain("789mmx1100mm");
  });
});

/* ------------------------------------------------------------------ filtros e pesquisa */
const tile = (sid: string, oficio: string, usos: number, o: Partial<TileServico> = {}): TileServico => ({
  sid, n: sid, curto: sid, oficio, icone: "outro", origem: "catalogo", on: false, qt: 0, un: "un", preco: 10, medida: null, usos, linhas: ["wc"], ...o,
});
describe("os filtros por baixo da pesquisa", () => {
  const ts = [
    tile("Nicho", "Revestimentos", 80), tile("Pintura teto", "Pintura", 10), tile("Torneira", "Canalização", 50),
    tile("Ralo", "Canalização", 40), tile("Demolição", "Demolições", 0, { origem: "pacote", on: true }),
  ];
  it("os ofícios pelos mais usados (os escolhidos e os do pacote primeiro)", () => {
    expect(oficiosPorUso(ts, "wc")).toEqual(["Demolições", "Canalização", "Revestimentos", "Pintura"]);
  });
  it("o filtro e a pesquisa juntam-se; sem filtro (Todos) volta tudo, os mais prováveis primeiro", () => {
    expect(servicosFiltrados(ts, { oficio: "Canalização", linha: "wc" }).map((t) => t.sid)).toEqual(["Torneira", "Ralo"]);
    expect(servicosFiltrados(ts, { oficio: "Canalização", q: "ralo", linha: "wc" }).map((t) => t.sid)).toEqual(["Ralo"]);
    expect(servicosFiltrados(ts, { oficio: "Pintura", q: "ralo", linha: "wc" })).toEqual([]);
    expect(servicosFiltrados(ts, { oficio: null, linha: "wc" }).map((t) => t.sid)).toEqual(["Demolição", "Nicho", "Torneira", "Ralo", "Pintura teto"]);
  });
});

/* ------------------------------------------------------------------ liga/desliga e quantidades */
describe("os cartões ligam e desligam ao toque", () => {
  it("um serviço do Catálogo: liga com 1 (sem medida) e desliga ao segundo toque", () => {
    const { S, A, d } = preparar();
    const t = () => tilesServicos(S, lerCatalogo(), d).find((x) => x.sid === "c3")!; // construção de nicho, por unidade
    expect(tocarServico(A, d, t())).toBe("ligou");
    expect(d.visita.extra.c3).toBe(1);
    expect(t().on).toBe(true);
    expect(tocarServico(A, d, t())).toBe("desligou");
    expect(d.visita.extra.c3).toBeUndefined();
  });
  it("um serviço em m² liga com a medida da visita", () => {
    const { S, A, d } = preparar();
    tocarServico(A, d, tilesServicos(S, lerCatalogo(), d).find((x) => x.sid === "c4")!); // revestimento m² → paredes
    expect(d.visita.extra.c4).toBe(16);
  });
  it("um serviço do pacote desliga e volta a ligar; o que só vem com um produto não se toca", () => {
    const { S, A, d } = preparar();
    const pav = () => tilesServicos(S, lerCatalogo(), d).find((x) => x.sid === "pav")!;
    expect(pav().on).toBe(true);
    expect(tocarServico(A, d, pav())).toBe("desligou");
    expect(d.visita.off).toContain("pav");
    expect(tocarServico(A, d, pav())).toBe("ligou");
    A.produto(d.id, prodN("Sanita compacta"), 1);
    const c13 = tilesServicos(S, lerCatalogo(), d).find((x) => x.sid === "c13")!;
    expect(c13.de).toEqual(["Sanita compacta"]);
    expect(tocarServico(A, d, c13)).toBeNull();
  });
  it("o ajuste só aparece quando faz sentido", () => {
    expect(mostraAjuste({ un: "un", q: 1, daMedida: false })).toBe(true);
    expect(mostraAjuste({ un: "m²", q: 6, daMedida: true })).toBe(false);
    expect(mostraAjuste({ un: "un", q: 3, daMedida: true })).toBe(true);
    expect(contavel("un")).toBe(true);
    expect(contavel("m²")).toBe(false);
  });
});

/* ------------------------------------------------------------------ o mapeamento serviço ↔ produto ↔ pergunta */
describe("o mapeamento: o produto traz o serviço, sem voltar a perguntar", () => {
  it("escolher a sanita junta a instalação; tirá-la tira a instalação", () => {
    const { A, d } = preparar();
    const K = lerCatalogo();
    const loucas = obrigacoes(K, servicosVisita(d), d.visita)[1] ?? obrigacoes(K, ["loucas"], d.visita)[0];
    expect(servicosVisita(d)).not.toContain("c13");
    tocarProdutoGuiado(A, K, d, loucas, prodN("Sanita compacta"));
    expect(servicosVisita(d)).toContain("c13");
    // a instalação da sanita pergunta "O cliente mantém a sanita?", mas a sanita já resolve: não se pergunta outra vez
    const todas = obrigacoes(K, servicosVisita(d), d.visita);
    expect(todas.map((o) => o.sid)).toContain("c13");
    expect(obrigacoesAMostrar(todas, d).map((o) => o.sid)).not.toContain("c13");
    expect(passosSelecao(obrigacoesAMostrar(todas, d), false).map((p) => p.k)).not.toContain("q:c13");
    tocarProdutoGuiado(A, K, d, loucas, prodN("Sanita compacta"));
    expect(servicosVisita(d)).not.toContain("c13");
  });
  it("'Mantém' tira os produtos que se tinham escolhido para a troca (e a instalação que traziam)", () => {
    const { A, d } = preparar();
    const K = lerCatalogo();
    const o = obrigacoes(K, ["loucas"], d.visita)[0];
    tocarProdutoGuiado(A, K, d, o, prodN("Sanita compacta"));
    responderTroca(A, K, d, o, "sim");
    expect(d.visita.manter?.loucas).toBe("sim");
    expect(d.visita.prod).toEqual([]);
    expect(servicosVisita(d)).not.toContain("c13");
  });
  it("a troca 'a sanita e a base de duche' só fica resolvida com as duas", () => {
    const o = { pergunta: "O cliente mantém a sanita e a base de duche?" };
    const ramo = [{ n: "Sanita compacta" }, { n: "Base de duche 80×120" }, { n: "Lavatório" }];
    expect(trocaResolvida(o, [ramo[0]], ramo)).toBe(false);
    expect(trocaResolvida(o, [ramo[0], ramo[1]], ramo)).toBe(true);
    expect(trocaResolvida(o, [{ n: "Sanita X" }], [{ n: "Sanita X" }])).toBe(true); // o ramo não tem bases: não conta
    expect(trocaResolvida({ pergunta: "O cliente mantém a sanita?" }, [ramo[0]], ramo)).toBe(true);
    expect(trocaResolvida(o, [], ramo)).toBe(false);
  });
  it("numa troca de duas coisas, os primeiros cartões mostram um pouco de cada (intercalados)", () => {
    const ps = ["Base A", "Base B", "Base C", "Sanita X", "Sanita Y", "Torneira"].map((n, i) => ({ id: "p" + i, n: n.startsWith("Base") ? "Base de duche " + n : n, custo: 1, un: "un", no: null } as Produto));
    expect(ordenarParaTroca(ps, "a sanita e a base de duche", []).map((p) => p.id)).toEqual(["p3", "p0", "p4", "p1", "p2", "p5"]);
  });
  it("com mobilidade reduzida, as bases de duche e as barras à frente; as banheiras para o fim", () => {
    const ps = [{ n: "Banheira acrílica" }, { n: "Sanita compacta" }, { n: "Base de duche 80×120" }, { n: "Barra de apoio" }];
    expect(ordenarMobilidade(ps, true).map((p) => p.n)).toEqual(["Base de duche 80×120", "Barra de apoio", "Sanita compacta", "Banheira acrílica"]);
    expect(ordenarMobilidade(ps, false)).toBe(ps);
  });
  it("o passo seguinte, mesmo quando a pergunta de onde se vinha saiu", () => {
    const ps = passosSelecao([], false);
    expect(ps.map((p) => p.k)).toEqual(["escolhas", "servicos", "outros", "resumo"]);
    expect(vizinho(ps, "servicos", 1)).toBe("outros");
    expect(vizinho(ps, "q:sai", 1, 2)).toBe("outros");
    expect(vizinho(ps, "escolhas", -1)).toBeNull();
  });
});

/* ------------------------------------------------------------------ o que o cliente fornece */
describe("o que o cliente fornece", () => {
  it("o passo só aparece com 'fornece materiais = Sim'", () => {
    expect(passosSelecao([], true).map((p) => p.k)).toContain("fornece");
    expect(passosSelecao([], false).map((p) => p.k)).not.toContain("fornece");
  });
  it("ligar 'fornece' tira o valor do produto e mantém a instalação", () => {
    const { A, d } = preparar();
    const K = lerCatalogo();
    A.campo(d.id, "materiais_cliente", "Sim");
    tocarProdutoGuiado(A, K, d, obrigacoes(K, ["loucas"], d.visita)[0], prodN("Sanita compacta"));
    const it = itensFornece(d, [], (s) => s).find((x) => x.tipo === "produto")!;
    marcarFornece(A, d, it, true);
    expect(linhasDosProdutos(d.visita.prod!)).toEqual([{ t: "mat", d: PREFIXO_CLIENTE + "Sanita compacta", custo: 0, preco: 0 }]);
    expect(servicosVisita(d)).toContain("c13");
  });
  it("os atalhos 'Fornece tudo' e 'Nenhum', também no material das trocas sem produto", () => {
    const { A, d } = preparar();
    const K = lerCatalogo();
    A.campo(d.id, "materiais_cliente", "Sim");
    A.produto(d.id, prodN("Sanita compacta"), 1);
    const obr = obrigacoes(K, ["pav"], d.visita, true); // o pavimento ainda sem produto
    const itens = itensFornece(d, obr, (s) => s);
    expect(itens.map((x) => x.tipo)).toEqual(["produto", "servico"]);
    fornecerTodos(A, d, itens, true);
    expect(d.visita.prod![0].cliente).toBe(true);
    expect(d.visita.clienteCompra?.pav).toBeTruthy();
    expect(obrigacoes(K, ["pav"], d.visita, true)[0].estado).toBe("cliente");
    fornecerTodos(A, d, itensFornece(d, obrigacoes(K, ["pav"], d.visita, true), (s) => s), false);
    expect(d.visita.prod![0].cliente).toBeUndefined();
    expect(d.visita.clienteCompra?.pav).toBeUndefined();
  });
  it("responder 'Não' depois de 'Sim' limpa as marcas", () => {
    const { A, d } = preparar();
    A.campo(d.id, "materiais_cliente", "Sim");
    A.produto(d.id, prodN("Sanita compacta"), 1);
    A.produtoCliente(d.id, d.visita.prod![0].id, true);
    A.clienteCompra(d.id, "pav", "Pavimento, para pavimento");
    A.campo(d.id, "materiais_cliente", "Não");
    expect(d.visita.prod![0].cliente).toBeUndefined();
    expect(d.visita.clienteCompra).toBeUndefined();
    expect(linhasDosProdutos(d.visita.prod!)[0]).toMatchObject({ d: PREFIXO_PROD + "Sanita compacta" });
  });
  it("as cores: escolhas rápidas e o 'Outro'", () => {
    expect(lerCores("Branco mate e madeira clara")).toEqual({ escolhidas: ["Madeira clara"], outro: "Branco mate" });
    expect(escreverCores(["Preto", "Branco"], "verde-água")).toBe("Branco, Preto, verde-água");
  });
});

/* ------------------------------------------------------------------ no ecrã */
function Montar({ S, d, guia }: { S: Estado; d: Negocio; guia?: { avancar: () => void; recuar: () => void; setGuiado: (b: boolean) => void } }) {
  const [, setN] = useState(0);
  const run = useMemo(() => (fn: () => void) => { fn(); setN((x) => x + 1); }, []);
  const A = useMemo(() => acoes(S, vi.fn(), run), [S, run]);
  const corpo = <SelecaoGuiada S={S} A={A} run={run} go={(fn) => () => run(fn)} q="" repor={vi.fn()} d={d} simples />;
  return guia ? <GuiaPassoCtx.Provider value={guia}>{corpo}</GuiaPassoCtx.Provider> : corpo;
}
const seguinte = () => fireEvent.click(screen.getByRole("button", { name: /^Seguinte/ }));
const titulo = () => screen.getByRole("heading", { level: 3 }).textContent;

describe("a seleção guiada no ecrã", () => {
  it("começa nas Escolhas do cliente (Sim/Não com um toque) e o fornece só aparece com Sim", () => {
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    const guia = { avancar: vi.fn(), recuar: vi.fn(), setGuiado: vi.fn() };
    render(<Montar S={S} d={d} guia={guia} />);
    expect(guia.setGuiado).toHaveBeenCalledWith(true);
    expect(titulo()).toBe("Escolhas do cliente");
    const g = screen.getByRole("group", { name: /fornece materiais/i });
    fireEvent.click(within(g).getByRole("button", { name: "Sim" }));
    expect(d.f.materiais_cliente).toBe("Sim");
    expect(within(g).getByRole("button", { name: "Sim" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/de 7$/)).toBeInTheDocument(); // escolhas, serviços, 2 trocas, mais produtos, fornece, resumo
    fireEvent.click(within(g).getByRole("button", { name: "Não" }));
    expect(screen.getByText(/de 6$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(guia.recuar).toHaveBeenCalled();
  });

  it("os cartões dos serviços: aria-pressed, liga e desliga ao toque e pelo teclado; sem '+'", () => {
    const { S, d } = preparar();
    render(<Montar S={S} d={d} />);
    expect(titulo()).toBe("O que se faz"); // as Escolhas já respondidas e nada mexido: abre nos serviços
    fireEvent.click(screen.getByRole("button", { name: "Revestimentos" }));
    const nicho = screen.getByRole("button", { name: /Construção de Nicho/i });
    expect(nicho).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(nicho);
    expect(nicho).toHaveAttribute("aria-pressed", "true");
    expect(d.visita.extra.c3).toBe(1);
    // o ajuste 1 · 2 · 3 · outro aparece dentro do cartão escolhido (não há medida)
    const q = screen.getByRole("group", { name: /Quantidade de Construção de nicho/i });
    fireEvent.click(within(q).getByRole("button", { name: "2" }));
    expect(d.visita.extra.c3).toBe(2);
    // pelo teclado: é um botão (Enter e Espaço ativam-no)
    nicho.focus();
    expect(document.activeElement).toBe(nicho);
    expect(nicho.tagName).toBe("BUTTON");
    fireEvent.click(nicho);
    expect(nicho).toHaveAttribute("aria-pressed", "false");
    expect(d.visita.extra.c3).toBeUndefined();
    expect(screen.queryByText("+")).toBeNull();
  });

  it("o filtro junta-se à pesquisa e tocar no ativo volta a 'Todos'", () => {
    const { S, d } = preparar();
    render(<Montar S={S} d={d} />);
    const filtros = screen.getByRole("group", { name: "Filtrar por área" });
    const todos = within(filtros).getByRole("button", { name: "Todos" });
    expect(todos).toHaveAttribute("aria-pressed", "true");
    const lista = () => within(screen.getByRole("list", { name: "Serviços" })).getAllByRole("listitem");
    fireEvent.click(within(filtros).getByRole("button", { name: "Canalização" }));
    expect(within(filtros).getByRole("button", { name: "Canalização" })).toHaveAttribute("aria-pressed", "true");
    expect(todos).toHaveAttribute("aria-pressed", "false");
    for (const li of lista()) expect(li.querySelector("[aria-pressed], [role=group]")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar serviço" }), { target: { value: "torneira" } });
    expect(lista().length).toBeGreaterThan(0);
    for (const li of lista()) expect(li.getAttribute("title")?.toLowerCase()).toContain("torneira");
    fireEvent.click(within(filtros).getByRole("button", { name: "Canalização" })); // o ativo outra vez: Todos
    expect(todos).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar serviço" }), { target: { value: "" } });
    expect(lista().length).toBeGreaterThanOrEqual(6);
  });

  it("a troca: 'Troca' mostra logo os produtos; escolher a sanita e a base avança sozinho", () => {
    vi.useFakeTimers();
    const { S, d } = preparar();
    render(<Montar S={S} d={d} />);
    seguinte(); // dos serviços → a primeira troca
    expect(titulo()).toMatch(/mantém o pavimento/);
    fireEvent.click(screen.getByRole("button", { name: /^Mantém/ })); // "Mantém" avança sozinho
    act(() => { vi.advanceTimersByTime(800); });
    expect(d.visita.manter?.pav).toBe("sim");
    expect(titulo()).toBe("O cliente mantém a sanita e a base de duche?");
    expect(screen.queryByRole("list", { name: /Produtos/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Troca/ }));
    const lista = () => screen.getByRole("list", { name: /Produtos/ });
    const procurar = (t: string) => fireEvent.change(screen.getByRole("searchbox", { name: /Procurar em/ }), { target: { value: t } });
    procurar("sanita compacta"); // com o catálogo real (centenas de louças), procura-se
    fireEvent.click(within(lista()).getByRole("button", { name: /^Sanita compacta/ }));
    expect(within(lista()).getByRole("button", { name: /^Sanita compacta/ })).toHaveAttribute("aria-pressed", "true");
    act(() => { vi.advanceTimersByTime(800); });
    expect(titulo()).toBe("O cliente mantém a sanita e a base de duche?"); // falta a base de duche
    procurar("base de duche 80×120");
    fireEvent.click(within(lista()).getByRole("button", { name: /^Base de duche 80×120/ }));
    act(() => { vi.advanceTimersByTime(800); });
    expect(titulo()).toBe("Mais produtos");
    expect(servicosVisita(d)).toContain("c13"); // a instalação veio com a sanita
  });

  it("o resumo mostra o escolhido e um toque volta ao passo", () => {
    const { S, d } = preparar();
    const K = lerCatalogo();
    d.visita.manter = { pav: "sim" };
    tocarProdutoGuiado(acoes(S, vi.fn(), (fn) => fn()), K, d, obrigacoes(K, ["loucas"], d.visita)[0], prodN("Sanita compacta"));
    render(<Montar S={S} d={d} />);
    // tudo mexido e a troca das louças resolvida: abre no resumo
    expect(titulo()).toBe("Resumo");
    expect(screen.getByRole("button", { name: /^Sanita e base de duche/ })).toHaveTextContent("Sanita compacta");
    fireEvent.click(screen.getByRole("button", { name: /^Sanita e base de duche/ }));
    expect(titulo()).toBe("O cliente mantém a sanita e a base de duche?");
  });

  it("aguenta 2.200 produtos: mostra os primeiros 6 e o resto com 'Ver mais' ou a pesquisa", () => {
    mudarCatalogo((k) => {
      for (let i = 0; i < 2200; i++) k.produtos.push({ id: `x${i}`, n: `Toalheiro modelo ${i}`, sub: "Toalheiros", custo: 10, un: "un", no: null, sku: `SKU-${i}` } as Produto);
    });
    const { S, d } = preparar();
    d.visita.manter = { pav: "sim", loucas: "sim" };
    render(<Montar S={S} d={d} />);
    expect(titulo()).toBe("Resumo");
    fireEvent.click(screen.getByRole("button", { name: /^Mais produtos/ }));
    expect(titulo()).toBe("Mais produtos");
    const lista = () => within(screen.getByRole("list", { name: "Mais produtos" })).getAllByRole("listitem");
    expect(lista()).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: /^Ver mais 12/ }));
    expect(lista()).toHaveLength(18);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sku-1999" } });
    expect(lista()).toHaveLength(1);
    expect(lista()[0]).toHaveAttribute("title", "Toalheiro modelo 1999"); // o nome completo no title; no cartão, "Modelo 1999"
  });
});
