// Testes da seleção guiada das Necessidades (14/10/2026): os cartões que ligam e desligam, o mapeamento serviço ↔ produto ↔ pergunta,
// os nomes curtos dos cartões, os filtros com a pesquisa, as Escolhas do cliente dentro da etapa e "O que o cliente fornece".
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useMemo, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, criarOrc, partes, seed, servicosVisita, tot, type Estado, type LinhaOrc, type Negocio } from "./motor";
import { ligarReceitas, itensReceita } from "./forneceCliente";
import { itensDaReceita } from "./v2/custosModelo";
import { lerCustos } from "./v2/custosStore";
import { resumoNecessidades } from "./necessidades";
import { FiltrosFila } from "./CartoesSelecao";
import { itemCatalogo } from "./catalogo";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, emFalta, type Grupo } from "./campos";
import { PREFIXO_CLIENTE, PREFIXO_PROD, ligarCatalogo, linhasDosProdutos, obrigacoes } from "./produtosVisita";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { Produto } from "./v2/catalogoModelo";
import { obrigacoesAMostrar, tilesServicos, tocarProdutoGuiado, type TileServico } from "./necessidades";
import {
  blocosFornece, contavel, encurtar, fornecerTodos, itensFornece, lerCores, escreverCores, marcarFornece, oficiosPorUso, poupanca, textoQtd, ordenarMobilidade, ordenarParaTroca, passosSelecao,
  responderTroca, servicosFiltrados, tocarServico, trocaResolvida, vizinho,
} from "./selecao";
import { SelecaoGuiada } from "./SelecaoGuiada";
import { MotionGlobalConfig } from "framer-motion";

// as animações (framer-motion) acabam logo nos testes: o passo que sai não fica no DOM e os números não contam
MotionGlobalConfig.skipAnimations = true;
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
beforeEach(() => { ligarCatalogo(lerCatalogo); ligarReceitas((sid, s) => itensDaReceita(lerCustos(), sid, s)); });
afterEach(() => { cleanup(); ligarCatalogo(null); ligarReceitas(null); reporCatalogo(); vi.useRealTimers(); });

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
  it("a quantidade em texto, sem fila de números: a da visita, senão 1 un", () => {
    expect(textoQtd({ q: 12, un: "m²", daMedida: true })).toBe("12 m² · da visita");
    expect(textoQtd({ q: 1, un: "un", daMedida: false })).toBe("1 un");
    expect(textoQtd({ q: 2.5, un: "m²", daMedida: false })).toBe("2,5 m²");
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
    expect(ps.map((p) => p.k)).toEqual(["servicos", "outros", "escolhas", "resumo"]);
    expect(vizinho(ps, "servicos", 1)).toBe("outros");
    expect(vizinho(ps, "q:sai", 1, 1)).toBe("outros");
    expect(vizinho(ps, "servicos", -1)).toBeNull();
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
  it("começa no que se faz; as Escolhas do cliente vêm depois de Mais produtos e o fornece só aparece com Sim", () => {
    const { S, d } = preparar();
    delete d.f.materiais_cliente; delete d.f.mobilidade_reduzida;
    const guia = { avancar: vi.fn(), recuar: vi.fn(), setGuiado: vi.fn() };
    render(<Montar S={S} d={d} guia={guia} />);
    expect(guia.setGuiado).toHaveBeenCalledWith(true);
    expect(titulo()).toBe("O que se faz");
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(guia.recuar).toHaveBeenCalled();
    seguinte(); seguinte(); seguinte(); // as duas trocas e Mais produtos
    expect(titulo()).toBe("Mais produtos");
    seguinte();
    expect(titulo()).toBe("Escolhas do cliente");
    const g = screen.getByRole("group", { name: /fornece materiais/i });
    fireEvent.click(within(g).getByRole("button", { name: "Sim" }));
    expect(d.f.materiais_cliente).toBe("Sim");
    expect(within(g).getByRole("button", { name: "Sim" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/de 7$/)).toBeInTheDocument(); // serviços, 2 trocas, mais produtos, escolhas, fornece, resumo
    expect(screen.getByText(/^5 de 7$/)).toBeInTheDocument();
    seguinte();
    expect(titulo()).toBe("O que o cliente fornece"); // logo a seguir ao "Sim"
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.click(within(screen.getByRole("group", { name: /fornece materiais/i })).getByRole("button", { name: "Não" }));
    expect(screen.getByText(/de 6$/)).toBeInTheDocument();
    seguinte();
    expect(titulo()).toBe("Resumo");
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
    // sem fila 1 · 2 · 3: a quantidade em texto ("1 un", não há medida) e um "Mudar" só no cartão escolhido
    const li = nicho.closest("li")!;
    expect(li).toHaveTextContent("1 un");
    expect(within(li).queryByRole("button", { name: "2" })).toBeNull();
    expect(within(li).queryByRole("button", { name: "3" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Mudar a quantidade/ })).toHaveLength(1);
    fireEvent.click(within(li).getByRole("button", { name: /Mudar a quantidade de Construção de nicho/i }));
    const campo = within(li).getByRole("textbox", { name: /Quantidade de Construção de nicho/i });
    fireEvent.change(campo, { target: { value: "2" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(d.visita.extra.c3).toBe(2);
    expect(li).toHaveTextContent("2 un");
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

/* ------------------------------------------------------------------ 2.ª volta (14/10): a ordem, as quantidades em texto e o fornece por serviço */
describe("a ordem dos passos (Escolhas do cliente depois dos produtos)", () => {
  it("O que se faz → trocas → Mais produtos → Escolhas → O que o cliente fornece → Resumo", () => {
    const { d } = preparar();
    const K = lerCatalogo();
    const obr = obrigacoes(K, servicosVisita(d), d.visita, true);
    expect(passosSelecao(obr, true).map((p) => p.tipo)).toEqual(["servicos", "pergunta", "pergunta", "outros", "escolhas", "fornece", "resumo"]);
    expect(passosSelecao(obr, false).map((p) => p.tipo)).toEqual(["servicos", "pergunta", "pergunta", "outros", "escolhas", "resumo"]);
  });
  it("a mobilidade reduzida pergunta-se num cartão rápido na troca e muda logo a ordem dos produtos", () => {
    const { S, d } = preparar();
    delete d.f.mobilidade_reduzida;
    d.visita.manter = { pav: "sim" };
    d.visita.extra = { c3: 1 }; // já mexido: abre na troca das louças
    render(<Montar S={S} d={d} />);
    expect(titulo()).toBe("O cliente mantém a sanita e a base de duche?");
    const mob = screen.getByRole("group", { name: /mobilidade reduzida/i });
    fireEvent.click(screen.getByRole("button", { name: /^Troca/ }));
    fireEvent.click(within(mob).getByRole("button", { name: "Sim" }));
    expect(d.f.mobilidade_reduzida).toBe("Sim");
    const primeiro = within(screen.getByRole("list", { name: /Produtos/ })).getAllByRole("listitem")[0];
    expect(primeiro.getAttribute("title")?.toLowerCase()).toMatch(/base|barra|banco|apoio|suspens/) // as regras de ordenarMobilidade;
  });
});

const comecaPor = (t: string) => new RegExp("^" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
describe("os serviços e os produtos sem '1 2 3'", () => {
  it("o serviço em m² mostra a quantidade da visita ('16 m² · da visita'); mudada, deixa de dizer 'da visita'", () => {
    const { S, d } = preparar();
    render(<Montar S={S} d={d} />);
    const n = itemCatalogo("c4")!.n;
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar serviço" }), { target: { value: n } });
    fireEvent.click(screen.getByRole("button", { name: comecaPor(n) }));
    expect(d.visita.extra.c4).toBe(16);
    const li = screen.getByRole("button", { name: comecaPor(n) }).closest("li")!;
    expect(li).toHaveTextContent("16 m² · da visita");
    expect(within(li).queryAllByRole("button", { name: /^[123]$/ })).toHaveLength(0);
    fireEvent.click(within(li).getByRole("button", { name: /^Mudar a quantidade/ }));
    const campo = within(li).getByRole("textbox");
    fireEvent.change(campo, { target: { value: "12,5" } });
    fireEvent.blur(campo);
    expect(d.visita.extra.c4).toBe(12.5);
    expect(li).toHaveTextContent("12,5 m²");
    expect(li).not.toHaveTextContent("da visita");
  });
  it("o produto escolhido mostra a quantidade em texto e 'Mudar' ajusta-a", () => {
    const { S, d } = preparar();
    d.visita.manter = { pav: "sim", loucas: "sim" };
    render(<Montar S={S} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: /^Mais produtos/ }));
    const lista = screen.getByRole("list", { name: "Mais produtos" });
    const b = within(lista).getAllByRole("button", { pressed: false })[0];
    fireEvent.click(b);
    const li = b.closest("li")!;
    const p = d.visita.prod!.at(-1)!;
    expect(li).toHaveTextContent(`${String(p.q).replace(".", ",")} ${p.un}`);
    expect(within(li).queryByRole("group", { name: /Quantidade/ })).toBeNull();
    fireEvent.click(within(li).getByRole("button", { name: /^Mudar a quantidade/ }));
    const campo = within(li).getByRole("textbox");
    fireEvent.change(campo, { target: { value: "3" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(d.visita.prod!.find((x) => x.id === p.id)!.q).toBe(3);
  });
});

/** Hugo Matos com "fornece materiais = Sim", a sanita compacta escolhida e a troca do pavimento mantida. */
function comFornece() {
  const r = preparar();
  const K = lerCatalogo();
  r.A.campo(r.d.id, "materiais_cliente", "Sim");
  r.d.visita.manter = { pav: "sim" };
  tocarProdutoGuiado(r.A, K, r.d, obrigacoes(K, ["loucas"], r.d.visita)[0], prodN("Sanita compacta"));
  const obr = () => obrigacoesAMostrar(obrigacoes(K, servicosVisita(r.d), r.d.visita, true), r.d);
  const blocos = () => blocosFornece(r.d, obr(), servicosVisita(r.d), { arvore: K.arvore, exige: K.exigeProduto ?? {}, nomeSvc: (s) => r.S.svc[s]?.n ?? s, svc: (s) => r.S.svc[s] });
  return { ...r, K, obr, blocos };
}
const linhaSvc = (ls: LinhaOrc[], sid: string) => ls.find((l): l is Extract<LinhaOrc, { t: "svc" }> => l.t === "svc" && l.sid === sid)!;

describe("o que o cliente fornece, por serviço", () => {
  it("um bloco por serviço com os produtos, os consumíveis e os equipamentos da receita, por ordem de custo", () => {
    const { d, blocos } = comFornece();
    const bs = blocos();
    const canal = bs.find((b) => b.sid === "canal")!;
    expect(canal.itens.map((x) => x.tipo).sort()).toEqual(["cons", "cons", "cons", "equip"]);
    const tubo = canal.itens.find((x) => x.n === "Tubo multicamada 16 mm")!;
    expect(tubo.q).toBe(3 * d.visita.med.pts); // 3 m por ponto × os pontos de água
    expect(tubo.valor).toBeCloseTo(3 * 1.9 * d.visita.med.pts, 2);
    const valores = canal.itens.map((x) => x.valor ?? 0);
    expect([...valores].sort((a, b) => b - a)).toEqual(valores);
    const loucas = bs.find((b) => b.sid === "loucas")!;
    expect(loucas.itens.some((x) => x.tipo === "produto" && x.n === "Sanita compacta")).toBe(true);
    expect(loucas.itens.some((x) => x.n === "Silicone sanitário")).toBe(true);
  });

  it("o produto, o consumível e o equipamento saem do custo; a mão de obra fica", () => {
    const { S, A, d, blocos } = comFornece();
    const antes = criarOrc(d, S), pAntes = partes({ ...d, orc: antes }, S);
    const canal = blocos().find((b) => b.sid === "canal")!;
    const prensa = canal.itens.find((x) => x.tipo === "equip")!, tubo = canal.itens.find((x) => x.n === "Tubo multicamada 16 mm")!;
    const sanita = blocos().find((b) => b.sid === "loucas")!.itens.find((x) => x.tipo === "produto")!;
    marcarFornece(A, d, prensa, true);
    marcarFornece(A, d, tubo, true);
    marcarFornece(A, d, sanita, true);
    expect([...(d.visita.fornece?.canal ?? [])].sort()).toEqual(["c:Tubo multicamada 16 mm", prensa.id].sort());
    const depois = criarOrc(d, S), pDepois = partes({ ...d, orc: depois }, S);
    const la = linhaSvc(antes.linhas, "canal"), ld = linhaSvc(depois.linhas, "canal");
    const porUn = itensReceita("canal", S.svc.canal).filter((x) => ["c:Tubo multicamada 16 mm", prensa.id].includes(x.k)).reduce((a, x) => a + x.cu, 0);
    expect(ld.cu).toBeCloseTo(la.cu - porUn, 2);
    expect(ld.pu).toBeCloseTo(la.pu - porUn, 2);
    expect(pDepois.mo).toBeCloseTo(pAntes.mo, 6); // a mão de obra fica
    expect(pDepois.cons).toBeLessThan(pAntes.cons);
    expect(pDepois.eq).toBeLessThan(pAntes.eq);
    // no orçamento, com a marca "fornecido pelo cliente"
    const marcas = depois.linhas.filter((l) => l.t === "mat" && l.d.startsWith(PREFIXO_CLIENTE)).map((l) => (l as { d: string }).d);
    expect(marcas).toEqual(expect.arrayContaining([PREFIXO_CLIENTE + "Sanita compacta", expect.stringContaining("Tubo multicamada 16 mm"), expect.stringContaining(prensa.n)]));
    // o produto fica a zero e a instalação mantém-se
    expect(servicosVisita(d)).toContain("c13");
    expect(depois.linhas.some((l) => l.t === "mat" && l.d === PREFIXO_PROD + "Sanita compacta")).toBe(false);
  });

  it("o custo do orçamento bate certo: baixa exatamente o que o passo diz", () => {
    const { S, A, d, blocos } = comFornece();
    const antes = criarOrc(d, S), tAntes = tot({ ...d, orc: antes }, S), rAntes = resumoNecessidades(S, d, servicosVisita(d)).total;
    const todos = blocos().flatMap((b) => b.itens);
    fornecerTodos(A, d, todos, true);
    const menos = poupanca(blocos().flatMap((b) => b.itens));
    const depois = criarOrc(d, S), tDepois = tot({ ...d, orc: depois }, S);
    expect(menos).toBeGreaterThan(0);
    expect(tAntes.preco - tDepois.preco).toBeCloseTo(menos, 1);
    expect(rAntes - resumoNecessidades(S, d, servicosVisita(d)).total).toBeCloseTo(menos, 1);
    // o custo baixa pelo custo dos produtos (não pelo preço de venda) e pelos consumíveis e equipamentos
    const custoProd = d.visita.prod!.reduce((a, p) => a + p.custo * p.q, 0);
    const recDesc = todos.filter((x) => x.tipo === "cons" || x.tipo === "equip").reduce((a, x) => a + (x.valor ?? 0), 0);
    expect(tAntes.custo - tDepois.custo).toBeCloseTo(custoProd + recDesc, 0);
  });

  it("os atalhos: 'Fornece tudo' e 'Nenhum', gerais e de um serviço", () => {
    const { A, d, blocos } = comFornece();
    const canal = blocos().find((b) => b.sid === "canal")!;
    fornecerTodos(A, d, canal.itens, true);
    expect(blocos().find((b) => b.sid === "canal")!.itens.every((x) => x.on)).toBe(true);
    expect(blocos().filter((b) => b.sid !== "canal").flatMap((b) => b.itens).some((x) => x.on)).toBe(false);
    fornecerTodos(A, d, blocos().flatMap((b) => b.itens), true);
    expect(blocos().flatMap((b) => b.itens).every((x) => x.on)).toBe(true);
    fornecerTodos(A, d, blocos().flatMap((b) => b.itens), false);
    expect(blocos().flatMap((b) => b.itens).some((x) => x.on)).toBe(false);
    expect(d.visita.fornece).toBeUndefined();
  });

  it("responder 'Não' a 'fornece materiais' limpa tudo (produtos, trocas, consumíveis e equipamentos)", () => {
    const { S, A, d, blocos } = comFornece();
    fornecerTodos(A, d, blocos().flatMap((b) => b.itens), true);
    A.campo(d.id, "materiais_cliente", "Não");
    expect(d.visita.fornece).toBeUndefined();
    expect(d.visita.prod!.some((p) => p.cliente)).toBe(false);
    expect(criarOrc(d, S).linhas.some((l) => l.t === "mat" && l.d.startsWith(PREFIXO_CLIENTE))).toBe(false);
  });

  it("no ecrã: um bloco por serviço, os 6 primeiros, os atalhos e o que baixa; sobrevive a voltar atrás", () => {
    const { S, d } = comFornece();
    d.visita.extra.c3 = 1;
    render(<Montar S={S} d={d} />);
    // tudo resolvido: abre no resumo; vai-se ao fornece
    fireEvent.click(screen.getByRole("button", { name: /^O que o cliente fornece/ }));
    expect(titulo()).toBe("O que o cliente fornece");
    const canal = () => screen.getByRole("region", { name: /Canaliza/i });
    const lista = within(canal()).getByRole("list");
    expect(within(lista).getAllByRole("listitem").length).toBeLessThanOrEqual(6);
    const prensa = within(lista).getByRole("button", { name: /^Prensa/ });
    fireEvent.click(prensa);
    expect(prensa).toHaveAttribute("aria-pressed", "true");
    expect(within(canal()).getByLabelText(/^Baixa .* euros$/)).toBeInTheDocument();
    // voltar atrás e regressar: o estado está na visita
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(titulo()).toBe("Escolhas do cliente");
    seguinte();
    expect(within(canal()).getByRole("button", { name: /^Prensa/ })).toHaveAttribute("aria-pressed", "true");
    // o atalho do serviço e o geral
    fireEvent.click(within(screen.getByRole("group", { name: /^Atalhos de Canaliza/ })).getByRole("button", { name: "Fornece tudo" }));
    expect(d.visita.fornece?.canal?.length).toBe(4);
    fireEvent.click(within(screen.getByRole("group", { name: "Atalhos para tudo" })).getByRole("button", { name: "Nenhum" }));
    expect(d.visita.fornece).toBeUndefined();
  });
});

describe("a fila de filtros arrasta-se com o rato", () => {
  function Fila() {
    const [a, setA] = useState<string | null>(null);
    return <FiltrosFila opcoes={["Canalização", "Revestimentos", "Pintura", "Eletricidade"]} ativo={a} onMudar={setA} rotulo="Filtros" />;
  }
  it("um arrasto não ativa o filtro; o clique simples ativa", () => {
    render(<Fila />);
    const fila = screen.getByRole("group", { name: "Filtros" });
    const pint = within(fila).getByRole("button", { name: "Pintura" });
    // arrastar 40 px com o rato a partir do filtro: o clique que fecha o arrasto não conta
    fireEvent.pointerDown(pint, { pointerType: "mouse", button: 0, clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(pint, { pointerType: "mouse", clientX: 160, pointerId: 1 });
    fireEvent.pointerUp(pint, { pointerType: "mouse", clientX: 160, pointerId: 1 });
    fireEvent.click(pint);
    expect(pint).toHaveAttribute("aria-pressed", "false");
    // um clique simples (menos de 5 px)
    fireEvent.pointerDown(pint, { pointerType: "mouse", button: 0, clientX: 200, pointerId: 2 });
    fireEvent.pointerMove(pint, { pointerType: "mouse", clientX: 203, pointerId: 2 });
    fireEvent.pointerUp(pint, { pointerType: "mouse", clientX: 203, pointerId: 2 });
    fireEvent.click(pint);
    expect(pint).toHaveAttribute("aria-pressed", "true");
    expect(fila.className).toContain("cursor-grab");
    expect(fila.className).toContain("[&::-webkit-scrollbar]:hidden");
  });
});
