// A vista da família com 3D (ecrã): o 3D grande (Previa3DProduto, simulado aqui), as escolhas só com valores que existem, o produto real, as outras medidas e a escolha no
// endereço. Caso real: «Sanita GLAMIC BTW» (Cor Branco/Cinza × Tonalidade Brilho/Mate; existem 3 produtos e NÃO existe Cinza Brilho).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const previa = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt", setLanguage: () => undefined }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ getPublicUrl: (c: string) => ({ data: { publicUrl: `https://cdn.teste/${c}` } }) }) } } }));
vi.mock("@/emylia/Previa3DProduto", () => ({ Previa3DProduto: (p: Record<string, unknown>) => { previa.props.push(p); return <div data-testid="previa3d" />; } }));

import type { FamiliaVista } from "./escolhaVariacao";
import { A_COR, A_MED, A_TEX, A_TON, EIXO_COR, EIXO_MED, EIXO_TEX, SANITA, produto, valor } from "./fixturesFamiliaVista";
import { VerFamilia3D } from "./VerFamilia3D";

const ARVORE = [{ id: "n-s1", n: "Sanitas", pai: null }];
const Local = () => <p data-testid="local">{useLocation().pathname + useLocation().search}</p>;
const montar = (familia: FamiliaVista, url = "/catalogo/produtos/familias/f-sanita") => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/catalogo/produtos/familias/:id" element={<><VerFamilia3D familia={familia} arvore={ARVORE} categoriasProduto={[{ id: "n-s1", origem: "s1" }]} /><Local /></>} /></Routes>
  </MemoryRouter>,
);
const ultima = () => previa.props[previa.props.length - 1]!;
const radios = (grupo: string) => within(screen.getByRole("radiogroup", { name: grupo })).getAllByRole("radio");
const marcado = (grupo: string) => { const r = radios(grupo).find((x) => x.getAttribute("aria-checked") === "true"); return r?.getAttribute("aria-label") ?? r?.textContent; };

beforeEach(() => { previa.props.length = 0; });
afterEach(cleanup);

describe("VerFamilia3D: o que se mostra", () => {
  it("o nome da família, quantos produtos tem e a ligação de volta às famílias", () => {
    montar(SANITA);
    expect(screen.getByRole("heading", { level: 1, name: "SANITA GLAMIC BTW" })).toBeTruthy();
    expect(screen.getByText("3 produtos")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Famílias/ }).getAttribute("href")).toBe("/catalogo/produtos/familias");
  });

  it("só os valores que existem: Cor com Branco e Cinza, Tonalidade com Brilho e Mate (e nenhuma combinação inventada)", () => {
    montar(SANITA);
    expect(radios("Cor").map((r) => r.getAttribute("aria-label"))).toEqual(["Branco", "Cinza"]);
    expect(radios("Tonalidade").map((r) => r.textContent)).toEqual(["Brilho", "Mate"]);
    expect(screen.queryByText(/Cinza Brilho/)).toBeNull();
  });

  it("abre na escolha por omissão (Branco Brilho) com o produto real no cartão: referência e preço", () => {
    montar(SANITA);
    expect(marcado("Cor")).toBe("Branco");
    expect(marcado("Tonalidade")).toBe("Brilho");
    expect(screen.getByRole("heading", { name: "SANITA GLAMIC BTW BRANCO BRILHO" })).toBeTruthy();
    expect(screen.getByText("LS-S-0003-B-B")).toBeTruthy();
    expect(screen.getByText(/280,00\s€/)).toBeTruthy();
    expect(screen.getByText("Em stock: 0 unidades")).toBeTruthy();
  });

  it("a etiqueta por cima do 3D diz a escolha atual separada por « · »", () => {
    montar(SANITA);
    expect(screen.getByTestId("etiqueta-escolha").textContent).toBe("Branco · Brilho");
  });

  it("a nota da textura só aparece no eixo «Textura» (a textura escolhe o produto, o 3D ainda não a mostra)", () => {
    montar(SANITA);
    expect(screen.queryByText("A textura escolhe o produto; o 3D ainda não a mostra nesta fase.")).toBeNull();
    const tex = [produto("1", { [A_TEX]: valor("Liso", { ordem: 1 }) }), produto("2", { [A_TEX]: valor("Pizarra", { ordem: 2 }) })];
    cleanup();
    montar({ ...SANITA, eixos: [EIXO_TEX], produtos: tex });
    expect(screen.getByText("A textura escolhe o produto; o 3D ainda não a mostra nesta fase.")).toBeTruthy();
  });

  it("uma família sem eixo de cor não mostra a secção «Cor»; os botões continuam a escolher o produto", () => {
    const tex = [produto("1", { [A_TEX]: valor("Liso", { ordem: 1 }) }, { sku: "S-1" }), produto("2", { [A_TEX]: valor("Pizarra", { ordem: 2 }) }, { sku: "S-2" })];
    montar({ ...SANITA, eixos: [EIXO_TEX], produtos: tex });
    expect(screen.queryByRole("radiogroup", { name: "Cor" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Pizarra" }));
    expect(screen.getByText("S-2")).toBeTruthy();
  });

  it("uma família vazia diz-o (sem 3D nem escolhas)", () => {
    montar({ ...SANITA, produtos: [] });
    expect(screen.getByText("Esta família ainda não tem produtos.")).toBeTruthy();
    expect(screen.queryByTestId("previa3d")).toBeNull();
  });

  it("sem PVP nem stock na leitura (sem permissão) o cartão não tem essas linhas", () => {
    montar({ ...SANITA, veValores: false, veStock: false, produtos: SANITA.produtos.map((p) => ({ ...p, pvp: null, stock: null })) });
    expect(screen.queryByText("Preço de venda")).toBeNull();
    expect(screen.queryByText(/Em stock/)).toBeNull();
  });
});

describe("VerFamilia3D: escolher", () => {
  it("de Branco Brilho escolher Cinza passa ao produto existente Cinza Mate e avisa numa linha", () => {
    montar(SANITA);
    fireEvent.click(screen.getByRole("radio", { name: "Cinza" }));
    expect(marcado("Cor")).toBe("Cinza");
    expect(marcado("Tonalidade")).toBe("Mate");
    expect(screen.getByText("Cinza só existe em Mate: mudamos para Mate.")).toBeTruthy();
    expect(screen.getByText("LS-S-0003-C-M")).toBeTruthy();
    expect(within(screen.getByRole("article")).getByText(/450,00\s€/)).toBeTruthy();
  });

  it("uma combinação que existe não avisa, e o aviso anterior desaparece", () => {
    montar(SANITA);
    fireEvent.click(screen.getByRole("radio", { name: "Cinza" }));
    expect(screen.queryByText(/só existe em/)).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Branco" }));
    expect(screen.queryByText(/só existe em/)).toBeNull();
    expect(screen.getByText("LS-S-0003-B-M")).toBeTruthy();
  });

  it("a escolha vai para o endereço (?cor=&tonalidade=), sem sair da página", () => {
    montar(SANITA);
    fireEvent.click(screen.getByRole("radio", { name: "Cinza" }));
    expect(screen.getByTestId("local").textContent).toBe("/catalogo/produtos/familias/f-sanita?cor=Cinza&tonalidade=Mate");
  });

  it("abre a escolha que o endereço traz; um valor que não existe na família ignora-se", () => {
    montar(SANITA, "/catalogo/produtos/familias/f-sanita?cor=Cinza&tonalidade=Mate");
    expect(screen.getByText("LS-S-0003-C-M")).toBeTruthy();
    cleanup();
    montar(SANITA, "/catalogo/produtos/familias/f-sanita?cor=Verde&tonalidade=Mate");
    expect(marcado("Tonalidade")).toBe("Mate");
    expect(screen.getByText("LS-S-0003-B-M")).toBeTruthy();
  });

  it("um endereço com uma combinação que não existe (cor e textura de outra medida) passa ao mais próximo e avisa ao abrir", () => {
    montar(SANITA, "/catalogo/produtos/familias/f-sanita?cor=Cinza&tonalidade=Brilho");
    expect(screen.getByText("LS-S-0003-C-M")).toBeTruthy();
    expect(screen.getByText("Cinza só existe em Mate: mudamos para Mate.")).toBeTruthy();
  });

  it("um leitor de ecrã ouve o produto escolhido: «Cinza, Mate: referência, preço»", () => {
    montar(SANITA);
    expect(screen.queryByText(/LS-S-0003-C-M, /)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Cinza" }));
    const regioes = screen.getAllByRole("status").map((s) => s.textContent);
    expect(regioes.some((x) => /^Cinza · Mate: LS-S-0003-C-M, 450,00\s€$/.test(x ?? ""))).toBe(true);
  });
});

describe("VerFamilia3D: o 3D", () => {
  it("monta o Previa3DProduto maior (alturaClasse) com o nome, a subcategoria, o nó e a árvore do produto", () => {
    const p = SANITA.produtos.map((x) => ({ ...x, subcategoriaId: "s1", subcategoria: "Sanitas", categoriaId: "c1", categoria: "Louças" }));
    montar({ ...SANITA, produtos: p });
    expect(ultima()).toMatchObject({ nome: "SANITA GLAMIC BTW BRANCO BRILHO", sub: "Sanitas", no: "n-s1", arvore: ARVORE, cor: "#FCFCFC" });
    expect(String(ultima().alturaClasse)).toMatch(/h-\[/);
    expect(ultima().painelMedidas).toBeUndefined();
    expect(ultima().config3d).toBeUndefined();
  });

  it("trocar a cor muda só a cor do 3D (o mesmo componente, sem o remontar)", () => {
    montar(SANITA);
    expect(ultima().cor).toBe("#FCFCFC");
    fireEvent.click(screen.getByRole("radio", { name: "Cinza" }));
    expect(ultima().cor).toBe("#A3A3A3");
    expect(screen.getAllByTestId("previa3d")).toHaveLength(1);
  });

  it("a medida e a «Aplicação» do produto vão para o 3D (um revestimento só é superfície com eles)", () => {
    const med = { atributoId: A_MED, valor: { tipo: "2D", largura: 60, comprimento: 120, unidade: "cm" }, unidade: "cm", texto: "60×120 cm" };
    const ps = [produto("1", { [A_COR]: valor("Cinza", { hex: "#A3A3A3" }) }, { medida: med, aplicacao: { valor: "PAVIMENTO", nome: "Pavimento" } })];
    montar({ ...SANITA, eixos: [EIXO_COR, EIXO_MED], produtos: ps });
    expect(ultima()).toMatchObject({ medida: { largura: 60, comprimento: 120 }, medidaRevestimento: { ladoCm: [60, 120] }, aplicacao: "Pavimento" });
  });
});

describe("VerFamilia3D: medidas", () => {
  const medida = (id: string, texto: string, atual = false) => ({ id, nome: `Sanita ${texto}`, atual, medida: texto, medidaValor: null, unidade: "cm" });
  const outras = [medida("f-sanita", "70×100 cm", true), medida("f-outra", "80×120 cm")];

  it("a medida desta família escreve-se e as outras são ligações com a cor e a tonalidade no endereço", () => {
    const com = { ...SANITA, produtos: SANITA.produtos.map((p) => ({ ...p, modelo: "GLAMIC", medida: { atributoId: A_MED, valor: { tipo: "2D", largura: 70, comprimento: 100, unidade: "cm" }, unidade: "cm", texto: "70×100 cm" } })), outrasMedidas: outras };
    montar(com);
    expect(screen.getByText("Medida desta família: 70×100 cm")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Outras medidas do modelo de catálogo GLAMIC" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Cinza" }));
    expect(screen.getByRole("link", { name: /80×120 cm/ }).getAttribute("href")).toBe("/catalogo/produtos/familias/f-outra?cor=Cinza&tonalidade=Mate");
  });

  it("«Abrir produto» leva à ficha do produto escolhido", () => {
    montar(SANITA);
    expect(screen.getByRole("link", { name: /Abrir o produto SANITA GLAMIC BTW BRANCO BRILHO/ }).getAttribute("href")).toBe("/catalogo/produtos/bb");
  });
});
