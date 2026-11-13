// O painel «Configurador de famílias» (protótipo, só em memória): UMA família é sempre um agrupamento de produtos que já existem no catálogo.
// Fluxo único de 3 passos: Escolher produtos, Atribuir atributos (medida, cor e atributos extra livres), Resumo e pré-visualização.
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { No, Produto } from "../v2/catalogoModelo";
import { PainelConfigurador } from "./PainelConfigurador";
import { linhasDeVariantes, type FamiliaCfg } from "./configurador";

afterEach(cleanup);

const produto = (id: string, n: string, pvp: number | undefined, extra: Partial<Produto> = {}): Produto => ({ id, n, custo: 80, un: "un", marca: "FRASA", fornecedor: "Forn", data: "2026-10-01", no: null, sku: `SKU-${id}`, sub: "Cubas inox", ...(pvp !== undefined ? { pvp } : {}), ...extra });
const LODY: Produto[] = [];
for (const [i, tam] of [40, 50, 70].entries()) for (const [j, ac] of ["Cobre", "Gold", "Gunmetal"].entries()) LODY.push(produto(`l${tam}${ac.slice(0, 2)}`, `Lava-louças Lody ${tam} - ${ac}`, 139 + i * 20 + j));
const VELARES: Produto[] = [34, 40, 45, 50, 70].map((t, i) => produto(`v${t}`, `Lava-louças VELAR 1 CUBA ${t}`, 149 + i));
const BETAS: Produto[] = [["b1", "Lava-louças Beta 1 CUBA 50", 100], ["b2", "Lava-louças Beta 2 CUBAS 50", 120], ["b3", "Lava-louças Beta 2 CUBAS 70", 150]].map(([id, n, pvp]) => produto(String(id), String(n), Number(pvp)));
const OUTROS: Produto[] = [produto("s1", "Sanita compacta", 165, { sub: "Sanitas", marca: "Roca" }), produto("t1", "Misturadora de bidé X - Cromo", 99, { sub: "Torneiras", marca: "Rodi" })];
const CATALOGO = { produtos: [...OUTROS, ...LODY, ...VELARES, ...BETAS], arvore: [] };

let ultima: FamiliaCfg[] = [];
function Casa({ inicial = [], catalogo = CATALOGO }: { inicial?: FamiliaCfg[]; catalogo?: typeof CATALOGO }) {
  const [lista, setLista] = useState<FamiliaCfg[]>(inicial);
  ultima = lista;
  return <PainelConfigurador familias={lista} onFamilias={setLista} catalogo={catalogo} />;
}
const NOVA = "Nova família (juntar produtos do catálogo)", EXEMPLO_VELAR = "Exemplo: agrupar as lava-loiças Velar do catálogo";
const estado = () => screen.getByText(/^Passo \d de \d · /).textContent;
const seguinte = () => screen.getByRole("button", { name: "Seguinte" });
const ir = (n: number) => { for (let i = 0; i < n; i++) fireEvent.click(seguinte()); };
const clicar = (nome: string) => fireEvent.click(screen.getByRole("button", { name: nome }));
const escrever = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const valor = (rotulo: string) => (screen.getByLabelText(rotulo) as HTMLInputElement).value;
const abrirNova = (catalogo = CATALOGO) => { render(<Casa catalogo={catalogo} />); clicar(NOVA); };
const abrirVelar = () => { render(<Casa />); clicar(EXEMPLO_VELAR); };
const caixa = (nome: RegExp) => screen.getByRole("checkbox", { name: nome });
const escolherLody = () => { for (const p of LODY) fireEvent.click(caixa(new RegExp(`${p.n}$|${p.n}[ ,]`))); };
const tabela = () => screen.getByRole("table", { name: "Variantes geradas" });
const corpoDaTabela = () => within(tabela()).getAllByRole("row").slice(1).map((l) => within(l).getAllByRole("cell").map((c) => c.textContent));
const cabecalhos = () => within(tabela()).getAllByRole("columnheader").map((c) => c.textContent);
const resumoAtribuicao = () => screen.getByRole("status", { name: "Resumo da atribuição" });
/** as 3 Beta (50 cm 1 cuba, 50 cm 2 cubas, 70 cm 2 cubas), já no passo de atribuição */
const betasNaAtribuicao = () => {
  abrirNova();
  for (const p of BETAS) fireEvent.click(caixa(new RegExp(`${p.n}[ ,]|${p.n}$`)));
  ir(1);
};
const acrescentarAtributo = (nome: string) => { escrever("Nome do novo atributo", nome); clicar("Acrescentar atributo"); };

describe("PainelConfigurador: lista", () => {
  it("mostra o aviso do protótipo, a lista vazia e só o percurso de juntar produtos do catálogo (sem «Do zero» nem exemplos feitos à mão)", () => {
    render(<Casa />);
    expect(screen.getByText(/Protótipo: só dura nesta sessão; nada é guardado\. Uma peça posta na planta com uma família configurada perde-se ao recarregar/)).toBeInTheDocument();
    expect(screen.getByText("Ainda sem famílias configuradas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: NOVA })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: EXEMPLO_VELAR })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Começar pelo exemplo|Lody, FRASA|^Nova família$/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Do zero/)).not.toBeInTheDocument();
  });

  it("o botão do exemplo só aparece se o catálogo tiver lava-loiças Velar", () => {
    render(<Casa catalogo={{ produtos: OUTROS, arvore: [] }} />);
    expect(screen.queryByRole("button", { name: /agrupar as lava-loiças Velar/ })).not.toBeInTheDocument();
  });
});

describe("PainelConfigurador: fluxo único (escolher, atribuir, resumo)", () => {
  it("«Nova família» abre direto a escolha de produtos: sem a pergunta «Como quer criar?», sem «Do zero» e sem passos de criação manual", () => {
    abrirNova();
    expect(estado()).toBe("Passo 1 de 3 · Escolher produtos");
    expect(screen.queryByRole("group", { name: "Como quer criar a família?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText(/Do zero/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adicionar (produto|acabamento)/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Preço base|Referência do produto/)).not.toBeInTheDocument();
  });

  it("um passo visível de cada vez, Anterior e um só Seguinte com o motivo escrito; o foco vai para o título de cada passo", () => {
    abrirNova();
    expect(screen.getByRole("heading", { name: "Escolher produtos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Seguinte" })).toHaveLength(1);
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText("Para continuar: escolha pelo menos um produto do catálogo.")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("Nenhum produto escolhido");
    fireEvent.click(caixa(/Sanita compacta/));
    expect(seguinte()).toBeEnabled();
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("1 escolhido");
    ir(1);
    expect(estado()).toBe("Passo 2 de 3 · Atribuir atributos");
    expect(screen.getByRole("heading", { name: "Atribuir atributos" })).toHaveFocus();
    expect(screen.queryByRole("checkbox", { name: /Sanita compacta/ })).not.toBeInTheDocument();
    ir(1);
    expect(estado()).toBe("Passo 3 de 3 · Resumo e pré-visualização");
    expect(screen.getByRole("heading", { name: "Resumo e pré-visualização" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Seguinte" })).not.toBeInTheDocument();
    clicar("Anterior");
    expect(estado()).toBe("Passo 2 de 3 · Atribuir atributos");
  });

  it("a pesquisa filtra por nome, marca, referência e categoria; o que já foi escolhido mantém-se; a lista tem altura limitada e rola", () => {
    abrirNova();
    const pesquisa = screen.getByLabelText("Procurar produtos do catálogo");
    fireEvent.change(pesquisa, { target: { value: "lody" } });
    const lista = screen.getByRole("list", { name: "Produtos do catálogo" });
    expect(within(lista).getAllByRole("checkbox")).toHaveLength(9);
    expect(lista).toHaveClass("overflow-y-auto");
    expect(lista.className).toMatch(/max-h-/);
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    fireEvent.change(pesquisa, { target: { value: "roca" } });
    expect(within(lista).getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("1 escolhido");
    fireEvent.change(pesquisa, { target: { value: "SKU-s1" } });
    expect(within(lista).getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.change(pesquisa, { target: { value: "sanitas" } });
    expect(within(lista).getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.change(pesquisa, { target: { value: "xyz inexistente" } });
    expect(screen.getByText(/Nenhum produto do catálogo corresponde/)).toBeInTheDocument();
  });

  it("cada produto mostra o nome, a referência e o preço em texto (não só pela cor)", () => {
    abrirNova();
    expect(caixa(/Sanita compacta/).closest("label")).toHaveTextContent(/Sanita compacta.*SKU-s1.*165,00/);
  });

  it("os 9 produtos Lody: palpite por nome, SKU e preço só de leitura, nome/marca sugeridos no resumo, tabela «9 produtos = 9 variantes» e guardar", () => {
    abrirNova();
    escolherLody();
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("9 escolhidos");
    ir(1);
    expect(valor("Medida do produto 1")).toBe("40 cm"); expect(valor("Acabamento do produto 1")).toBe("Cobre");
    expect(valor("Medida do produto 5")).toBe("50 cm"); expect(valor("Acabamento do produto 5")).toBe("Gold");
    expect(valor("Largura do produto 1 (cm)")).toBe("44");
    expect(resumoAtribuicao()).toHaveTextContent("9 produtos = 3 medidas × 3 acabamentos");
    const prod1 = screen.getByRole("group", { name: /^Produto 1:/ });
    expect(within(prod1).getByText(/SKU-l40C.*139,00.*vem do produto do catálogo/)).toBeInTheDocument();
    expect(within(prod1).queryByLabelText(/SKU|Preço/)).not.toBeInTheDocument();
    ir(1);
    expect(estado()).toBe("Passo 3 de 3 · Resumo e pré-visualização");
    // o nome, a marca e a categoria sugeridos pelos produtos, editáveis, ficam no resumo
    expect(valor("Nome da família")).toBe("Lava-louças Lody");
    expect(valor("Marca")).toBe("FRASA");
    expect((screen.getByLabelText("Categoria") as HTMLSelectElement).value).toBe("lavaloicas");
    expect(screen.getByText("9 produtos = 9 variantes")).toBeInTheDocument();
    expect(cabecalhos()).toEqual(["Produto", "Medida", "Cor", "SKU", "Preço", "3D do fabricante"]);
    const linhas = corpoDaTabela();
    expect(linhas).toHaveLength(9);
    expect(linhas.map((c) => c[3]).sort()).toEqual(LODY.map((p) => p.sku!).sort());
    expect(linhas.find((c) => c[3] === "SKU-l40Co")).toEqual(["Lava-louças Lody 40 - Cobre", "40 cm", "Cobre", "SKU-l40Co", expect.stringMatching(/139,00/), expect.stringMatching(/^(Sim|Não)$/)]);
    expect(within(screen.getByRole("list", { name: "Pré-visualização da família" })).getAllByRole("listitem")).toHaveLength(1);
    clicar("Guardar na sessão");
    expect(ultima).toHaveLength(1);
    const f = ultima[0];
    expect(Object.values(f.celulas).filter((c) => c.produtoId)).toHaveLength(9);
    expect(linhasDeVariantes(f).map((l) => l.sku).sort()).toEqual(LODY.map((p) => p.sku!).sort());
    expect(f.medidas).toHaveLength(3); expect(f.acabamentos).toHaveLength(3);
    expect(screen.getByText("Lava-louças Lody")).toBeInTheDocument();
  });

  it("o palpite é editável: mudar a medida muda a família; os mesmos valores em todos os atributos são um erro que bloqueia o Seguinte", () => {
    abrirNova();
    fireEvent.click(caixa(/Lody 40 - Cobre/)); fireEvent.click(caixa(/Lody 40 - Gold/));
    ir(1);
    expect(resumoAtribuicao()).toHaveTextContent("2 produtos = 1 medida × 2 acabamentos");
    escrever("Medida do produto 2", "45 cm");
    expect(resumoAtribuicao()).toHaveTextContent("2 produtos = 2 medidas × 2 acabamentos");
    escrever("Medida do produto 2", "40 cm"); escrever("Acabamento do produto 2", "Cobre");
    expect(screen.getByRole("alert")).toHaveTextContent(/mesmos valores em todos os atributos \(Medida: 40 cm; Cor: Cobre\)/);
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/Para continuar: .*mesmos valores/, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    escrever("Acabamento do produto 2", "Gold");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(seguinte()).toBeEnabled();
  });

  it("produto sem preço de venda: erro visível por escrito, e o Seguinte fica bloqueado", () => {
    abrirNova({ produtos: [...CATALOGO.produtos, produto("x1", "Lava-louças Zeta 40 - Cobre", undefined, { custo: 0 })], arvore: [] });
    fireEvent.click(caixa(/Zeta 40 - Cobre/));
    ir(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/«Lava-louças Zeta 40 - Cobre» não tem preço de venda/);
    expect(screen.getByText(/sem preço de venda/i, { selector: "fieldset p" })).toBeInTheDocument();
    expect(seguinte()).toBeDisabled();
  });

  it("produto sem PVP mas com custo: o preço é o calculado pelo catálogo e diz-se por escrito", () => {
    abrirNova({ produtos: [produto("c1", "Lava-louças Alfa 40 - Inox", undefined, { custo: 65 })], arvore: [] });
    fireEvent.click(caixa(/Alfa 40/));
    ir(1);
    expect(screen.getByRole("group", { name: /^Produto 1:/ })).toHaveTextContent(/100,00.*sem PVP.*custo/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tirar um produto da família na atribuição desmarca-o; sem produtos volta a pedir a escolha", () => {
    abrirNova();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(1);
    clicar("Tirar o produto 1 da família");
    expect(estado()).toBe("Passo 1 de 3 · Escolher produtos");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("Nenhum produto escolhido");
  });

  it("Anterior volta atrás e as escolhas mantêm-se; Cancelar sai", () => {
    abrirNova();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(1);
    clicar("Anterior");
    expect(caixa(/Lody 40 - Cobre/)).toBeChecked();
    clicar("Cancelar");
    expect(screen.getByRole("button", { name: NOVA })).toBeInTheDocument();
  });

  it("sem nome o Guardar fica desligado e diz porquê por escrito; escrever o nome desbloqueia", () => {
    abrirNova();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(2);
    escrever("Nome da família", "  ");
    expect(screen.getByRole("button", { name: "Guardar na sessão" })).toBeDisabled();
    expect(screen.getByText(/Para guardar: Escreva o nome da família/, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    escrever("Nome da família", "Lava-loiça Nova");
    expect(screen.getByRole("button", { name: "Guardar na sessão" })).toBeEnabled();
    expect(screen.getByRole("list", { name: "Pré-visualização da família" })).toBeInTheDocument();
  });
});

describe("PainelConfigurador: atributos livres", () => {
  it("acrescentar «Nº de cubas»: aparece um campo por produto; sem valores os dois produtos de 50 cm colidem (erro visível), com valores distinguem-se", () => {
    betasNaAtribuicao();
    expect(resumoAtribuicao()).toHaveTextContent("3 produtos = 2 medidas × 1 acabamento");
    expect(screen.getByRole("alert")).toHaveTextContent(/«Lava-louças Beta 1 CUBA 50» e «Lava-louças Beta 2 CUBAS 50» têm os mesmos valores em todos os atributos/);
    acrescentarAtributo("Nº de cubas");
    expect(within(screen.getByRole("list", { name: "Atributos extra" })).getByText("Nº de cubas")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Nº de cubas do produto \d$/)).toHaveLength(3);
    expect(seguinte()).toBeDisabled();
    escrever("Nº de cubas do produto 1", "1 cuba"); escrever("Nº de cubas do produto 2", "2 cubas"); escrever("Nº de cubas do produto 3", "2 cubas");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(resumoAtribuicao()).toHaveTextContent("3 produtos = 3 medidas × 1 acabamento");
    expect(seguinte()).toBeEnabled();
  });

  it("dois produtos com os mesmos valores em todos os atributos extra e na medida: erro com os valores, e o Seguinte desliga-se", () => {
    betasNaAtribuicao();
    acrescentarAtributo("Nº de cubas");
    escrever("Nº de cubas do produto 1", "2 cubas"); escrever("Nº de cubas do produto 2", "2 cubas"); escrever("Nº de cubas do produto 3", "2 cubas");
    expect(screen.getByRole("alert")).toHaveTextContent(/Medida: 50 cm; Nº de cubas: 2 cubas; Cor: Inox/);
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/Para continuar: .*mesmos valores/, { selector: "#motivo-seguinte" })).toBeInTheDocument();
  });

  it("os valores já usados num atributo são sugeridos nos outros produtos (datalist)", () => {
    betasNaAtribuicao();
    acrescentarAtributo("Nº de cubas");
    escrever("Nº de cubas do produto 2", "2 cubas");
    const campo = screen.getByLabelText("Nº de cubas do produto 3") as HTMLInputElement;
    const lista = document.getElementById(campo.getAttribute("list")!);
    expect(Array.from(lista!.querySelectorAll("option")).map((o) => o.getAttribute("value"))).toEqual(["2 cubas"]);
  });

  it("o nome do atributo é validado: vazio, repetido e os que já existem (medida, cor) dão um erro escrito e não se acrescentam", () => {
    betasNaAtribuicao();
    clicar("Acrescentar atributo");
    expect(screen.getByText(/Erro: Escreva o nome do atributo/)).toBeInTheDocument();
    acrescentarAtributo("Medida");
    expect(screen.getByText(/«Medida» já existe em cada produto/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Atributos extra" })).not.toBeInTheDocument();
    acrescentarAtributo("Material");
    acrescentarAtributo("material");
    expect(screen.getByText(/Já há um atributo «material»/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Atributos extra" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("remover um atributo tira o campo de cada produto e deixa de contar na combinação", () => {
    betasNaAtribuicao();
    acrescentarAtributo("Nº de cubas");
    escrever("Nº de cubas do produto 1", "1 cuba"); escrever("Nº de cubas do produto 2", "2 cubas"); escrever("Nº de cubas do produto 3", "2 cubas");
    clicar("Remover o atributo Nº de cubas");
    expect(screen.queryByLabelText(/^Nº de cubas do produto/)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/mesmos valores em todos os atributos/);
    acrescentarAtributo("Nº de cubas");
    expect(valor("Nº de cubas do produto 1")).toBe("");
  });

  it("o resumo tem uma coluna por atributo (Medida, Cor, extras) e o cartão mostra «50 cm · 2 cubas»; só há as combinações que existem", () => {
    betasNaAtribuicao();
    acrescentarAtributo("Nº de cubas");
    escrever("Nº de cubas do produto 1", "1 cuba"); escrever("Nº de cubas do produto 2", "2 cubas"); escrever("Nº de cubas do produto 3", "2 cubas");
    ir(1);
    expect(screen.getByText("3 produtos = 3 variantes")).toBeInTheDocument();
    expect(cabecalhos()).toEqual(["Produto", "Medida", "Cor", "Nº de cubas", "SKU", "Preço", "3D do fabricante"]);
    expect(corpoDaTabela().map((c) => [c[1], c[2], c[3], c[4]])).toEqual([["50 cm", "Inox", "1 cuba", "SKU-b1"], ["50 cm", "Inox", "2 cubas", "SKU-b2"], ["70 cm", "Inox", "2 cubas", "SKU-b3"]]);
    const cartao = within(screen.getByRole("list", { name: "Pré-visualização da família" }));
    expect(cartao.getAllByRole("option").map((o) => o.textContent)).toEqual(["50 cm · 1 cuba · SKU-b1", "50 cm · 2 cubas · SKU-b2", "70 cm · 2 cubas · SKU-b3"]);
    expect(cartao.getAllByRole("button", { name: /^Acabamento / })).toHaveLength(1);
  });

  it("guardar na sessão grava os atributos extra; editar volta a mostrar os atributos e os valores de cada produto", () => {
    betasNaAtribuicao();
    acrescentarAtributo("Nº de cubas");
    escrever("Nº de cubas do produto 1", "1 cuba"); escrever("Nº de cubas do produto 2", "2 cubas"); escrever("Nº de cubas do produto 3", "2 cubas");
    ir(1);
    clicar("Guardar na sessão");
    expect(ultima).toHaveLength(1);
    expect(ultima[0].atributos).toEqual(["Nº de cubas"]);
    expect(linhasDeVariantes(ultima[0]).map((l) => [l.sku, l.medida, l.valores["Nº de cubas"]])).toEqual([["SKU-b1", "50 cm", "1 cuba"], ["SKU-b2", "50 cm", "2 cubas"], ["SKU-b3", "70 cm", "2 cubas"]]);
    clicar(`Editar ${ultima[0].nome}`);
    expect(estado()).toBe("Passo 1 de 3 · Escolher produtos");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("3 escolhidos");
    ir(1);
    expect(within(screen.getByRole("list", { name: "Atributos extra" })).getByText("Nº de cubas")).toBeInTheDocument();
    expect(valor("Nº de cubas do produto 2")).toBe("2 cubas");
    expect(valor("Medida do produto 3")).toBe("70 cm");
    expect(seguinte()).toBeEnabled();
  });
});

describe("PainelConfigurador: exemplo Velar, editar e remover", () => {
  it("«Exemplo: agrupar as lava-loiças Velar do catálogo» pré-seleciona as 5 Velar e abre a escolha (passo 1)", () => {
    abrirVelar();
    expect(estado()).toBe("Passo 1 de 3 · Escolher produtos");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("5 escolhidos");
    ir(1);
    expect(resumoAtribuicao()).toHaveTextContent("5 produtos = 5 medidas × 1 acabamento");
    expect(valor("Acabamento do produto 1")).toBe("Inox");
    ir(1);
    expect(valor("Nome da família")).toBe("Lava-louças VELAR");
  });

  it("a Velar 70 propõe o 3D do fabricante (velar71) e o resumo conta-o", () => {
    abrirVelar();
    ir(2);
    expect(screen.getByText("5 produtos = 5 variantes")).toBeInTheDocument();
    expect(corpoDaTabela().map((c) => c[c.length - 1])).toEqual(["Sim", "Sim", "Sim", "Sim", "Sim"]);
  });

  it("Guardar entrega a família a quem usa o painel (onFamilias) e fica na lista com Editar e Remover", () => {
    abrirVelar();
    ir(2);
    expect(ultima).toEqual([]);
    clicar("Guardar na sessão");
    expect(ultima.map((f) => f.id)).toEqual(["cfg:lava-loucas-velar"]);
    const lista = screen.getByRole("list", { name: "Famílias configuradas" });
    expect(within(lista).getByText(/Lava-louças VELAR/)).toBeInTheDocument();
    expect(within(lista).getByText(/5 variantes/)).toBeInTheDocument();
    fireEvent.click(within(lista).getByRole("button", { name: /^Remover/ }));
    expect(ultima).toEqual([]);
  });

  it("editar e guardar substitui a família (não duplica) e não pisa o nome nem a marca com novas sugestões; a segunda com o mesmo nome é recusada", () => {
    abrirVelar();
    ir(2); clicar("Guardar na sessão");
    clicar("Editar Lava-louças VELAR");
    expect(estado()).toBe("Passo 1 de 3 · Escolher produtos");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("5 escolhidos");
    ir(2);
    expect(valor("Nome da família")).toBe("Lava-louças VELAR");
    escrever("Marca", "OUTRA");
    clicar("Guardar na sessão");
    expect(ultima).toHaveLength(1);
    expect(ultima[0].marca).toBe("OUTRA");
    clicar(EXEMPLO_VELAR);
    ir(2);
    expect(screen.getByRole("button", { name: "Guardar na sessão" })).toBeDisabled();
    expect(screen.getByText(/Para guardar: .*identificador/i, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    escrever("Nome da família", "Lava-louças VELAR 2");
    expect(screen.getByRole("button", { name: "Guardar na sessão" })).toBeEnabled();
  });

  it("editar uma família agrupada mostra a atribuição de cada produto (SKU e preço só de leitura, vêm do catálogo)", () => {
    abrirVelar();
    ir(2); clicar("Guardar na sessão");
    clicar("Editar Lava-louças VELAR");
    ir(1);
    expect(valor("Medida do produto 1")).toBe("34 cm");
    expect(screen.getAllByText(/vem do produto do catálogo/)).toHaveLength(5);
    expect(screen.queryByLabelText(/^SKU|^Preço/)).not.toBeInTheDocument();
  });
});

describe("PainelConfigurador: 400 px", () => {
  it("os campos da atribuição quebram (min-w-0, grelha) e a tabela do resumo fica num contentor com scroll horizontal (a página não rola)", () => {
    betasNaAtribuicao();
    acrescentarAtributo("Nº de cubas");
    const g = screen.getByRole("group", { name: /^Produto 1:/ });
    expect(g.className).toMatch(/min-w-0/);
    expect(g.querySelector(".grid")).not.toBeNull();
    expect(screen.getByRole("group", { name: "Atributos extra da família" }).className).toMatch(/min-w-0/);
    escrever("Nº de cubas do produto 1", "1 cuba"); escrever("Nº de cubas do produto 2", "2 cubas"); escrever("Nº de cubas do produto 3", "2 cubas");
    ir(1);
    expect(tabela().closest("div")).toHaveClass("overflow-x-auto");
  });
});

/* ------------------------------------------------------------------ passo «Escolher produtos»: filtros, seleção em massa e bandeja */
const ARVORE: No[] = [{ id: "o1", n: "Canalização", pai: null }, { id: "n1", n: "Lava-loiças", pai: "o1" }, { id: "n2", n: "Torneiras", pai: "o1" }];
const TOTAL_PRODUTOS = CATALOGO.produtos.length;
const resultados = () => screen.getByRole("status", { name: "Resultados" });
const listaProdutos = () => screen.getByRole("list", { name: "Produtos do catálogo" });
const marcar = (nome: string | RegExp) => fireEvent.click(screen.getByRole("checkbox", { name: nome }));
const pesquisar = (v: string) => fireEvent.change(screen.getByLabelText("Procurar produtos do catálogo"), { target: { value: v } });
const escolhidosTexto = () => screen.getByRole("status", { name: "Produtos escolhidos" }).textContent;
const comArvore = () => ({
  produtos: [produto("k1", "Lava-loiça K1", 100, { no: "n1", marca: "Alfa" }), produto("k2", "Lava-loiça K2", 100, { no: "n1", marca: "Beta" }), produto("k3", "Torneira K3", 100, { no: "n2", marca: "Alfa" }), produto("k4", "Torneira K4 sem preço", undefined, { no: "n2", marca: "Beta", custo: 0 })],
  arvore: ARVORE,
});

describe("PassoEscolher: filtros", () => {
  it("«N de M produtos» começa com todos; marcar uma marca filtra a lista e actualiza a contagem; as contagens de marca vêm no rótulo", () => {
    abrirNova();
    expect(resultados()).toHaveTextContent(`${TOTAL_PRODUTOS} de ${TOTAL_PRODUTOS} produtos`);
    expect(screen.getByRole("checkbox", { name: "Roca (1)" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: `FRASA (${TOTAL_PRODUTOS - 2})` })).toBeInTheDocument();
    marcar("Roca (1)");
    expect(resultados()).toHaveTextContent(`1 de ${TOTAL_PRODUTOS} produtos`);
    expect(within(listaProdutos()).getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: "Roca (1)" })).toBeChecked();
  });
  it("as contagens das marcas acompanham a pesquisa (facetas): só ficam as marcas com resultados", () => {
    abrirNova();
    pesquisar("lody");
    expect(screen.getByRole("checkbox", { name: "FRASA (9)" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Roca (1)" })).not.toBeInTheDocument();
    expect(resultados()).toHaveTextContent(`9 de ${TOTAL_PRODUTOS} produtos`);
  });
  it("cada filtro ativo é um chip removível com aria-label «Remover filtro Marca: X»; «Limpar filtros» tira todos", () => {
    abrirNova();
    marcar("Roca (1)");
    const chips = screen.getByRole("list", { name: "Filtros ativos" });
    expect(within(chips).getByText("Marca: Roca")).toBeInTheDocument();
    clicar("Remover filtro Marca: Roca");
    expect(resultados()).toHaveTextContent(`${TOTAL_PRODUTOS} de ${TOTAL_PRODUTOS} produtos`);
    expect(screen.queryByRole("list", { name: "Filtros ativos" })).not.toBeInTheDocument();
    marcar("Roca (1)"); pesquisar("sanita");
    clicar("Limpar filtros");
    expect(resultados()).toHaveTextContent(`${TOTAL_PRODUTOS} de ${TOTAL_PRODUTOS} produtos`);
    expect(screen.getByLabelText("Procurar produtos do catálogo")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).not.toBeInTheDocument();
  });
  it("sem resultados: diz o que está ativo e oferece «Remover filtro X» e «Limpar filtros» (não um ecrã vazio)", () => {
    abrirNova();
    marcar("Roca (1)"); pesquisar("lody");
    expect(screen.getByText(/Nenhum produto do catálogo corresponde a «lody» com os filtros ativos/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Produtos do catálogo" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remover filtro Marca: Roca" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Remover filtro Pesquisa: lody" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Limpar filtros" })).toHaveLength(1);
    clicar("Remover filtro Marca: Roca");
    expect(within(listaProdutos()).getAllByRole("checkbox")).toHaveLength(9);
  });
  it("«Limpar filtros» no estado vazio devolve a lista toda", () => {
    abrirNova();
    marcar("Roca (1)"); pesquisar("lody");
    clicar("Limpar filtros");
    expect(resultados()).toHaveTextContent(`${TOTAL_PRODUTOS} de ${TOTAL_PRODUTOS} produtos`);
  });
  it("categoria: o ramo do catálogo (ofício › sub) filtra, com contagem, e combina com a marca", () => {
    abrirNova(comArvore());
    expect(screen.getByRole("checkbox", { name: "Canalização › Lava-loiças (2)" })).toBeInTheDocument();
    marcar("Canalização › Torneiras (2)");
    expect(resultados()).toHaveTextContent("2 de 4 produtos");
    marcar("Alfa (1)");
    expect(resultados()).toHaveTextContent("1 de 4 produtos");
    expect(screen.getByRole("checkbox", { name: "Canalização › Lava-loiças (1)" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Filtros ativos" })).toHaveTextContent("Categoria: Canalização › Torneiras");
  });
  it("«Só com preço de venda» tira os produtos sem preço", () => {
    abrirNova(comArvore());
    marcar("Só com preço de venda");
    expect(resultados()).toHaveTextContent("3 de 4 produtos");
    expect(screen.queryByRole("checkbox", { name: /Torneira K4/ })).not.toBeInTheDocument();
  });
  it("«Ainda sem família» esconde os produtos já agrupados noutra família da sessão", () => {
    abrirVelar();
    ir(2); clicar("Guardar na sessão"); clicar(NOVA);
    marcar("Ainda sem família");
    expect(resultados()).toHaveTextContent(`${TOTAL_PRODUTOS - 5} de ${TOTAL_PRODUTOS} produtos`);
    expect(screen.queryByRole("checkbox", { name: /VELAR 1 CUBA 34/ })).not.toBeInTheDocument();
  });
  it("«Só os escolhidos» mostra só a seleção", () => {
    abrirNova();
    fireEvent.click(caixa(/Sanita compacta/));
    marcar("Só os escolhidos");
    expect(resultados()).toHaveTextContent(`1 de ${TOTAL_PRODUTOS} produtos`);
    expect(within(listaProdutos()).getAllByRole("checkbox")).toHaveLength(1);
  });
  it("em ecrã estreito os filtros ficam num bloco recolhível «Filtros (n)» com aria-expanded", () => {
    abrirNova();
    const botao = () => screen.getByRole("button", { name: /^Filtros \(\d+\)$/ });
    expect(botao()).toHaveAttribute("aria-expanded", "false");
    expect(botao()).toHaveTextContent("Filtros (0)");
    fireEvent.click(botao());
    expect(botao()).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(botao().getAttribute("aria-controls")!)).toContainElement(screen.getByRole("checkbox", { name: "Roca (1)" }));
    marcar("Roca (1)");
    expect(botao()).toHaveTextContent("Filtros (1)");
    fireEvent.click(botao());
    expect(botao()).toHaveAttribute("aria-expanded", "false");
  });
  it("a marca tem pesquisa própria só quando há mais de 12 valores", () => {
    abrirNova();
    expect(screen.queryByLabelText("Procurar marca")).not.toBeInTheDocument();
    cleanup();
    const muitas = { produtos: Array.from({ length: 14 }, (_, i) => produto(`m${i}`, `Produto ${i}`, 10, { marca: `Marca${String.fromCharCode(65 + i)}` })), arvore: [] };
    abrirNova(muitas);
    fireEvent.change(screen.getByLabelText("Procurar marca"), { target: { value: "marcab" } });
    expect(screen.getByRole("checkbox", { name: "MarcaB (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "MarcaC (1)" })).not.toBeInTheDocument();
  });
  it("«Ver parecidos» pesquisa pelo nome-base (sem medida nem cor) e junta a família", () => {
    abrirNova();
    marcar("FRASA (" + (TOTAL_PRODUTOS - 2) + ")");
    clicar("Ver parecidos com Lava-louças Lody 40 - Cobre");
    expect(screen.getByLabelText("Procurar produtos do catálogo")).toHaveValue("Lava-louças Lody");
    expect(within(listaProdutos()).getAllByRole("checkbox")).toHaveLength(9);
    expect(screen.queryByRole("button", { name: /^Remover filtro Marca/ })).not.toBeInTheDocument();
  });
});

describe("PassoEscolher: seleção e bandeja", () => {
  it("«Selecionar os N resultados» escolhe só os visíveis pelo filtro (N no rótulo) e «Limpar seleção» tira-os", () => {
    abrirNova();
    pesquisar("lody");
    clicar("Selecionar os 9 resultados");
    expect(escolhidosTexto()).toBe("9 escolhidos");
    pesquisar("roca");
    clicar("Selecionar o resultado");
    expect(escolhidosTexto()).toBe("10 escolhidos");
    clicar("Limpar seleção");
    expect(escolhidosTexto()).toBe("Nenhum produto escolhido");
    expect(screen.queryByRole("button", { name: "Limpar seleção" })).not.toBeInTheDocument();
  });
  it("nunca seleciona mais de 200 sem avisar: o rótulo diz «os primeiros 200 dos N» e há uma nota", () => {
    const muitos = { produtos: Array.from({ length: 250 }, (_, i) => produto(`q${i}`, `Peça ${i}`, 10)), arvore: [] };
    abrirNova(muitos);
    expect(screen.getByText(/Só se selecionam 200 de cada vez/)).toBeInTheDocument();
    clicar("Selecionar os primeiros 200 dos 250 resultados");
    expect(escolhidosTexto()).toBe("200 escolhidos");
  });
  it("a bandeja «Escolhidos (n)» mantém a seleção ao mudar de filtro e cada nome tem o seu «Remover»", () => {
    abrirNova();
    fireEvent.click(caixa(/Sanita compacta/));
    pesquisar("lody"); marcar("FRASA (9)");
    const bandeja = screen.getByRole("region", { name: "Escolhidos (1)" });
    expect(within(bandeja).getByText("Sanita compacta")).toBeInTheDocument();
    clicar("Remover Sanita compacta dos escolhidos");
    expect(escolhidosTexto()).toBe("Nenhum produto escolhido");
    expect(screen.queryByRole("region", { name: /^Escolhidos/ })).not.toBeInTheDocument();
  });
  it("com o filtro a esconder o produto escolhido a seleção continua (o Seguinte fica ativo)", () => {
    abrirNova();
    fireEvent.click(caixa(/Sanita compacta/));
    marcar("FRASA (" + (TOTAL_PRODUTOS - 2) + ")");
    expect(escolhidosTexto()).toBe("1 escolhido");
    expect(seguinte()).toBeEnabled();
  });
});

/* ------------------------------------------------------------------ a cor deriva do acabamento do produto */
describe("PassoAtribuir: a cor não se escolhe", () => {
  it("não há seletor de cor; a amostra diz o nome do acabamento e que é definida pelo produto", () => {
    abrirNova();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(1);
    expect(document.querySelector("input[type=color]")).toBeNull();
    expect(screen.queryByLabelText(/^Cor do acabamento/)).not.toBeInTheDocument();
    const amostra = screen.getByRole("img", { name: "Cor: Cobre, definida pelo produto" });
    expect(amostra).toHaveStyle({ backgroundColor: "#bc825b" });
    expect(amostra.parentElement).toHaveTextContent("Cobre");
  });
  it("editar o nome do acabamento recalcula a cor; um nome desconhecido dá cinzento neutro com a nota", () => {
    abrirNova();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(1);
    escrever("Acabamento do produto 1", "Gold");
    expect(screen.getByRole("img", { name: "Cor: Gold, definida pelo produto" })).toHaveStyle({ backgroundColor: "#c9ad68" });
    escrever("Acabamento do produto 1", "Pedra bege");
    const neutra = screen.getByRole("img", { name: "Cor: Pedra bege, não definida no produto" });
    expect(neutra).toHaveStyle({ backgroundColor: "#b7b9ba" });
    expect(neutra.parentElement).toHaveTextContent("cor não definida no produto");
  });
  it("dois produtos com o mesmo acabamento têm a mesma cor", () => {
    abrirNova({ produtos: [produto("c1", "Lava-louças Lody 40 - Cobre", 100), produto("c2", "Lava-louças Lody 50 - Cobre", 110)], arvore: [] });
    fireEvent.click(caixa(/Lody 40 - Cobre/)); fireEvent.click(caixa(/Lody 50 - Cobre/));
    ir(1);
    const amostras = screen.getAllByRole("img", { name: "Cor: Cobre, definida pelo produto" });
    expect(amostras).toHaveLength(2);
    expect(amostras[0].getAttribute("style")).toBe(amostras[1].getAttribute("style"));
  });
});

/* ------------------------------------------------------------------ polimento: erros por linha, resumo e lista de famílias */
describe("Configurador: polimento", () => {
  it("o erro de uma linha tem ícone e texto («Erro:») e o resumo dos erros é um role=alert; o resumo da atribuição fica fixo ao rolar", () => {
    abrirNova({ produtos: [...CATALOGO.produtos, produto("x1", "Lava-louças Zeta 40 - Cobre", undefined, { custo: 0 })], arvore: [] });
    fireEvent.click(caixa(/Zeta 40 - Cobre/));
    ir(1);
    const linha = screen.getByRole("group", { name: /^Produto 1:/ });
    expect(within(linha).getByText(/Erro: sem preço de venda no catálogo/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/não tem preço de venda/);
    expect(resumoAtribuicao().parentElement?.className).toMatch(/sticky/);
  });
  it("no resumo os erros ficam no topo, antes do formulário, e a tabela tem altura limitada com cabeçalho fixo", () => {
    abrirNova();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(2);
    escrever("Nome da família", " ");
    const alerta = screen.getByRole("alert");
    expect(alerta.compareDocumentPosition(screen.getByLabelText("Nome da família")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabela().closest("div")!.className).toMatch(/max-h-/);
    expect(within(tabela()).getAllByRole("columnheader")[0].className).toMatch(/sticky/);
    expect(screen.getAllByRole("button", { name: "Guardar na sessão" })).toHaveLength(1);
  });
  it("a lista de famílias mostra o título, «N produtos» e Editar/Remover com o nome da família; sem famílias o estado vazio traz o botão primário «Nova família»", () => {
    render(<Casa />);
    const vazio = screen.getByText("Ainda sem famílias configuradas.").closest("div")!;
    expect(within(vazio).getByRole("button", { name: NOVA })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: NOVA })).toHaveLength(1);
    clicar(EXEMPLO_VELAR); ir(2); clicar("Guardar na sessão");
    const lista = screen.getByRole("list", { name: "Famílias configuradas" });
    expect(within(lista).getByText("5 produtos")).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: "Editar Lava-louças VELAR" })).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: "Remover Lava-louças VELAR" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: NOVA })).toHaveLength(1);
  });
});
