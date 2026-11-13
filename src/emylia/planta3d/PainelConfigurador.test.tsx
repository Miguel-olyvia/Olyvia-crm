// O painel «Configurador de famílias» (protótipo, só em memória): UMA família só AGRUPA produtos que já existem no catálogo e NADA se escreve à mão.
// Fluxo único de 3 passos: Escolher produtos, Atributos dos produtos (só leitura: escolher eixos e excluir produtos), Resumo e pré-visualização (dados derivados).
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { No, Produto } from "../v2/catalogoModelo";
import { PainelConfigurador } from "./PainelConfigurador";
import { linhasDeVariantes, type FamiliaCfg } from "./configurador";
import { CATEGORIAS_FAMILIA } from "./familias";

afterEach(cleanup);

const produto = (id: string, n: string, pvp: number | undefined, extra: Partial<Produto> = {}): Produto => ({ id, n, custo: 80, un: "un", marca: "FRASA", fornecedor: "Forn", data: "2026-10-01", no: null, sku: `SKU-${id}`, sub: "Cubas inox", ...(pvp !== undefined ? { pvp } : {}), ...extra });
const LODY: Produto[] = [];
for (const [i, tam] of [40, 50, 70].entries()) for (const [j, ac] of ["Cobre", "Gold", "Gunmetal"].entries()) LODY.push(produto(`l${tam}${ac.slice(0, 2)}`, `Lava-louças Lody ${tam} - ${ac}`, 139 + i * 20 + j));
const VELARES: Produto[] = [34, 40, 45, 50, 70].map((t, i) => produto(`v${t}`, `Lava-louças VELAR 1 CUBA ${t}`, 149 + i));
const BETAS: Produto[] = [["b1", "Lava-louças Beta 1 CUBA 50", 100], ["b2", "Lava-louças Beta 2 CUBAS 50", 120], ["b3", "Lava-louças Beta 2 CUBAS 70", 150]].map(([id, n, pvp]) => produto(String(id), String(n), Number(pvp)));
const OUTROS: Produto[] = [produto("s1", "Sanita compacta", 165, { sub: "Sanitas", marca: "Roca" }), produto("t1", "Misturadora de bidé X - Cromo", 99, { sub: "Torneiras", marca: "Rodi" })];
const CATALOGO = { produtos: [...OUTROS, ...LODY, ...VELARES, ...BETAS], arvore: [] };

/** dois produtos sem parte comum no nome e de marcas diferentes */
const DUAS_MARCAS = { produtos: [produto("m1", "Alfa 40 - Cobre", 100, { marca: "Roca" }), produto("m2", "Beta 50 - Gold", 110, { marca: "Rodi" })], arvore: [] };

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
const abrirNova = (catalogo = CATALOGO) => { render(<Casa catalogo={catalogo} />); clicar(NOVA); };
const abrirVelar = () => { render(<Casa />); clicar(EXEMPLO_VELAR); };
const caixa = (nome: RegExp) => screen.getByRole("checkbox", { name: nome });
const escolherLody = () => { for (const p of LODY) fireEvent.click(caixa(new RegExp(`${p.n}$|${p.n}[ ,]`))); };
const tabela = () => screen.getByRole("table", { name: "Variantes geradas" });
const corpoDaTabela = () => within(tabela()).getAllByRole("row").slice(1).map((l) => within(l).getAllByRole("cell").map((c) => c.textContent));
const cabecalhos = () => within(tabela()).getAllByRole("columnheader").map((c) => c.textContent);
const resumoAtribuicao = () => screen.getByRole("status", { name: "Resumo da atribuição" });
/** a tabela só de leitura do passo «Atributos dos produtos» e uma das suas linhas, pelo nome do produto */
const tabelaAtributos = () => screen.getByRole("table", { name: "Atributos dos produtos" });
const linhaDe = (nome: RegExp) => within(tabelaAtributos()).getByRole("row", { name: nome });
const grupoCor = () => screen.getByRole("group", { name: "Atributo das bolinhas de cor/acabamento" });
const grupoMedida = () => screen.getByRole("group", { name: "Atributos do seletor de medida" });
/** as 3 Beta (50 cm 1 cuba, 50 cm 2 cubas, 70 cm 2 cubas), já no passo dos atributos */
const betasNosAtributos = () => {
  abrirNova();
  for (const p of BETAS) fireEvent.click(caixa(new RegExp(`${p.n}[ ,]|${p.n}$`)));
  ir(1);
};
/** nada do que se escreve: nem campos de texto, nem números, nem seletor de cor */
const semCamposDeEscrita = () => {
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(document.querySelector("input[type=color]")).toBeNull();
  expect(document.querySelectorAll("input:not([type=radio]):not([type=checkbox])")).toHaveLength(0);
  expect(document.querySelector("textarea")).toBeNull();
};

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

describe("PainelConfigurador: fluxo único (escolher, atributos, resumo)", () => {
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
    expect(estado()).toBe("Passo 2 de 3 · Atributos dos produtos");
    expect(screen.getByRole("heading", { name: "Atributos dos produtos" })).toHaveFocus();
    expect(screen.queryByRole("checkbox", { name: /Sanita compacta/ })).not.toBeInTheDocument();
    ir(1);
    expect(estado()).toBe("Passo 3 de 3 · Resumo e pré-visualização");
    expect(screen.getByRole("heading", { name: "Resumo e pré-visualização" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Seguinte" })).not.toBeInTheDocument();
    clicar("Anterior");
    expect(estado()).toBe("Passo 2 de 3 · Atributos dos produtos");
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

  it("os 9 produtos Lody: atributos só de leitura no passo 2, nome/marca derivados no resumo, tabela «9 produtos = 9 variantes» e guardar", () => {
    abrirNova();
    escolherLody();
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("9 escolhidos");
    ir(1);
    // os atributos vêm dos produtos e lêem-se em texto: nenhum campo para escrever
    semCamposDeEscrita();
    expect(resumoAtribuicao()).toHaveTextContent("9 produtos = 3 medidas × 3 acabamentos");
    const l1 = linhaDe(/Lody 40 - Cobre/), l5 = linhaDe(/Lody 50 - Gold/);
    for (const t of [/40 cm/, /Cobre/, /SKU-l40Co/, /139,00/]) expect(l1).toHaveTextContent(t);
    for (const t of [/50 cm/, /Gold/, /SKU-l50Go/]) expect(l5).toHaveTextContent(t);
    expect(within(grupoCor()).getByRole("radio", { name: "Cor" })).toBeChecked();
    expect(within(grupoMedida()).getByRole("checkbox", { name: "Medida" })).toBeChecked();
    // o «Material» é igual em todos os produtos: existe como atributo mas não entra no seletor por omissão
    expect(within(grupoMedida()).getByRole("checkbox", { name: "Material" })).not.toBeChecked();
    ir(1);
    expect(estado()).toBe("Passo 3 de 3 · Resumo e pré-visualização");
    semCamposDeEscrita();
    // o nome, a marca, a categoria e o tipo são derivados e mostram-se em texto
    expect(screen.getByText("Nome da família").nextElementSibling).toHaveTextContent("Lava-louças Lody");
    expect(screen.getByText("Marca").nextElementSibling).toHaveTextContent("FRASA");
    expect(screen.getByText("Categoria").nextElementSibling).toHaveTextContent(CATEGORIAS_FAMILIA.find((c) => c.id === "lavaloicas")!.rotulo);
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
    expect(f.eixos).toEqual({ cor: "Cor", medida: ["Medida"] });
    expect(screen.getByText("Lava-louças Lody")).toBeInTheDocument();
  });

  it("produto sem preço de venda: erro visível por escrito, e o Seguinte fica bloqueado", () => {
    abrirNova({ produtos: [...CATALOGO.produtos, produto("x1", "Lava-louças Zeta 40 - Cobre", undefined, { custo: 0 })], arvore: [] });
    fireEvent.click(caixa(/Zeta 40 - Cobre/));
    ir(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/«Lava-louças Zeta 40 - Cobre» não tem preço de venda/);
    expect(linhaDe(/Zeta 40 - Cobre/)).toHaveTextContent(/sem preço de venda/i);
    expect(seguinte()).toBeDisabled();
  });

  it("produto sem PVP mas com custo: o preço é o calculado pelo catálogo e diz-se por escrito", () => {
    abrirNova({ produtos: [produto("c1", "Lava-louças Alfa 40 - Inox", undefined, { custo: 65 })], arvore: [] });
    fireEvent.click(caixa(/Alfa 40/));
    ir(1);
    expect(linhaDe(/Alfa 40/)).toHaveTextContent(/100,00.*sem PVP.*custo/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("excluir um produto na tabela tira-o da família; sem produtos volta a pedir a escolha", () => {
    abrirNova();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(1);
    clicar("Excluir Lava-louças Lody 40 - Cobre da família");
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

  it("o nome não se escreve: é derivado, e se os produtos não têm parte comum usa o do primeiro; sem nome a escrever não há bloqueio", () => {
    abrirNova(DUAS_MARCAS);
    fireEvent.click(caixa(/Alfa 40/)); fireEvent.click(caixa(/Beta 50/));
    ir(2);
    semCamposDeEscrita();
    expect(screen.getByText("Nome da família").nextElementSibling).toHaveTextContent("Alfa");
    expect(screen.queryByText(/Escreva o nome/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar na sessão" })).toBeEnabled();
  });

  it("produtos de marcas diferentes: a marca fica «Várias marcas», em texto, com um aviso", () => {
    abrirNova(DUAS_MARCAS);
    fireEvent.click(caixa(/Alfa 40/)); fireEvent.click(caixa(/Beta 50/));
    ir(2);
    expect(screen.getByText("Marca").nextElementSibling).toHaveTextContent("Várias marcas");
    expect(screen.getByText(/marcas diferentes/)).toBeInTheDocument();
  });
});

describe("PainelConfigurador: passo «Atributos dos produtos» (só leitura)", () => {
  it("não há nenhum campo para escrever: nem texto, nem números, nem seletor de cor, nem «Atributos extra da família»", () => {
    betasNosAtributos();
    semCamposDeEscrita();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Atributos extra da família|Nome do novo atributo|Acrescentar atributo/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^(Medida|Acabamento|Código do acabamento|Largura|Modelo 3D) do produto/)).not.toBeInTheDocument();
  });

  it("cada produto mostra, em texto, os atributos que vêm dele, o SKU e o preço", () => {
    betasNosAtributos();
    const l = linhaDe(/Beta 2 CUBAS 70/);
    for (const t of [/70 cm/, /Inox/, /2 cubas/, /SKU-b3/, /150,00/]) expect(l).toHaveTextContent(t);
    expect(within(tabelaAtributos()).getAllByRole("row")).toHaveLength(4);
  });

  it("por omissão: a cor é a das bolinhas e a medida junta a Medida com o que varia (Nº de cubas); sem conflitos", () => {
    betasNosAtributos();
    expect(within(grupoCor()).getByRole("radio", { name: "Cor" })).toBeChecked();
    expect(within(grupoMedida()).getByRole("checkbox", { name: "Medida" })).toBeChecked();
    expect(within(grupoMedida()).getByRole("checkbox", { name: "Nº de cubas" })).toBeChecked();
    expect(within(grupoMedida()).getByRole("checkbox", { name: "Material" })).not.toBeChecked();
    expect(screen.getByText(/por exemplo «50 cm · 1 cuba»/)).toBeInTheDocument();
    expect(resumoAtribuicao()).toHaveTextContent("3 produtos = 3 medidas × 1 acabamento");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(seguinte()).toBeEnabled();
  });

  it("escolher os eixos: tirar o «Nº de cubas» do seletor junta dois produtos na mesma combinação (erro que se resolve no catálogo ou excluindo um)", () => {
    betasNosAtributos();
    fireEvent.click(within(grupoMedida()).getByRole("checkbox", { name: "Nº de cubas" }));
    expect(resumoAtribuicao()).toHaveTextContent("3 produtos = 2 medidas × 1 acabamento");
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(/«Lava-louças Beta 1 CUBA 50» e «Lava-louças Beta 2 CUBAS 50» têm os mesmos valores em todos os atributos \(Medida: 50 cm; Cor: Inox\)/);
    expect(alerta).toHaveTextContent(/corrija no produto do catálogo ou exclua um dos produtos/);
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/Para continuar: .*mesmos valores/, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    // excluir um dos produtos resolve
    clicar("Excluir Lava-louças Beta 2 CUBAS 50 da família");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(seguinte()).toBeEnabled();
    expect(within(tabelaAtributos()).getAllByRole("row")).toHaveLength(3);
  });

  it("voltar a marcar o atributo desfaz o erro; o seletor aceita mais de um atributo e a bolinha é só um (1 atributo)", () => {
    betasNosAtributos();
    const cubas = () => within(grupoMedida()).getByRole("checkbox", { name: "Nº de cubas" });
    fireEvent.click(cubas());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(cubas());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // as bolinhas são um só atributo: escolher «Material» tira-o do seletor de medida e a «Cor» passa a poder ser escolhida na medida
    expect(within(grupoCor()).getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
    fireEvent.click(within(grupoCor()).getByRole("radio", { name: "Material" }));
    expect(within(grupoCor()).getByRole("radio", { name: "Material" })).toBeChecked();
    expect(within(grupoMedida()).queryByRole("checkbox", { name: "Material" })).not.toBeInTheDocument();
    expect(within(grupoMedida()).getByRole("checkbox", { name: "Cor" })).not.toBeChecked();
  });

  it("«Nenhum (sem bolinhas)»: não há atributo de cor e a família fica com um só acabamento", () => {
    betasNosAtributos();
    fireEvent.click(within(grupoCor()).getByRole("radio", { name: "Nenhum (sem bolinhas)" }));
    expect(within(grupoCor()).getByRole("radio", { name: "Nenhum (sem bolinhas)" })).toBeChecked();
    expect(resumoAtribuicao()).toHaveTextContent("3 produtos = 3 medidas × 1 acabamento");
    expect(seguinte()).toBeEnabled();
  });

  it("produto sem valor num atributo escolhido: aviso na linha e no resumo (role alert), e bloqueia o Seguinte; tirar o atributo do seletor ou excluir o produto desbloqueia", () => {
    abrirNova({ produtos: [produto("g1", "Lava-louças Gama 1 CUBA 50", 100), produto("g2", "Lava-louças Gama 70", 110)], arvore: [] });
    fireEvent.click(caixa(/Gama 1 CUBA 50/)); fireEvent.click(caixa(/Gama 70/));
    ir(1);
    expect(within(linhaDe(/Gama 70/)).getByText("Este produto não tem Nº de cubas: corrija no produto do catálogo.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("«Lava-louças Gama 70»: Este produto não tem Nº de cubas: corrija no produto do catálogo.");
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/Para continuar: «Lava-louças Gama 70»/, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    fireEvent.click(within(grupoMedida()).getByRole("checkbox", { name: "Nº de cubas" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(seguinte()).toBeEnabled();
    fireEvent.click(within(grupoMedida()).getByRole("checkbox", { name: "Nº de cubas" }));
    expect(seguinte()).toBeDisabled();
    clicar("Excluir Lava-louças Gama 70 da família");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(seguinte()).toBeEnabled();
  });

  it("produtos sem nenhum atributo reconhecido: diz-se que se corrige no catálogo e não há campos", () => {
    abrirNova();
    fireEvent.click(caixa(/Sanita compacta/));
    ir(1);
    expect(screen.getByText(/não têm atributos reconhecidos: corrija-os no produto do catálogo/)).toBeInTheDocument();
    semCamposDeEscrita();
  });

  it("o resumo tem uma coluna por atributo do seletor (pela ordem escolhida) e a cor; o cartão mostra «50 cm · 2 cubas»; só há as combinações que existem", () => {
    betasNosAtributos();
    ir(1);
    expect(screen.getByText("3 produtos = 3 variantes")).toBeInTheDocument();
    expect(cabecalhos()).toEqual(["Produto", "Medida", "Nº de cubas", "Cor", "SKU", "Preço", "3D do fabricante"]);
    expect(corpoDaTabela().map((c) => [c[1], c[2], c[3], c[4]])).toEqual([["50 cm", "1 cuba", "Inox", "SKU-b1"], ["50 cm", "2 cubas", "Inox", "SKU-b2"], ["70 cm", "2 cubas", "Inox", "SKU-b3"]]);
    const cartao = within(screen.getByRole("list", { name: "Pré-visualização da família" }));
    expect(cartao.getAllByRole("option").map((o) => o.textContent)).toEqual(["50 cm · 1 cuba · SKU-b1", "50 cm · 2 cubas · SKU-b2", "70 cm · 2 cubas · SKU-b3"]);
    expect(cartao.getAllByRole("button", { name: /^Acabamento / })).toHaveLength(1);
  });

  it("guardar grava os eixos; editar reabre com os mesmos produtos e os mesmos eixos escolhidos", () => {
    betasNosAtributos();
    fireEvent.click(within(grupoCor()).getByRole("radio", { name: "Nenhum (sem bolinhas)" }));
    fireEvent.click(within(grupoMedida()).getByRole("checkbox", { name: "Material" }));
    ir(1);
    clicar("Guardar na sessão");
    expect(ultima).toHaveLength(1);
    expect(ultima[0].eixos).toEqual({ cor: null, medida: ["Medida", "Nº de cubas", "Material"] });
    expect(linhasDeVariantes(ultima[0]).map((l) => [l.sku, l.medida, l.valores["Nº de cubas"]])).toEqual([["SKU-b1", "50 cm", "1 cuba"], ["SKU-b2", "50 cm", "2 cubas"], ["SKU-b3", "70 cm", "2 cubas"]]);
    clicar(`Editar ${ultima[0].nome}`);
    expect(estado()).toBe("Passo 1 de 3 · Escolher produtos");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("3 escolhidos");
    ir(1);
    expect(within(grupoCor()).getByRole("radio", { name: "Nenhum (sem bolinhas)" })).toBeChecked();
    expect(within(grupoMedida()).getByRole("checkbox", { name: "Material" })).toBeChecked();
    expect(within(grupoMedida()).getByRole("checkbox", { name: "Nº de cubas" })).toBeChecked();
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
    expect(linhaDe(/VELAR 1 CUBA 34/)).toHaveTextContent(/Inox/);
    ir(1);
    expect(screen.getByText("Nome da família").nextElementSibling).toHaveTextContent("Lava-louças VELAR");
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

  it("editar e guardar substitui a família (não duplica); a segunda com o mesmo nome derivado é recusada, com a explicação, porque o nome não se escreve", () => {
    abrirVelar();
    ir(2); clicar("Guardar na sessão");
    clicar("Editar Lava-louças VELAR");
    expect(estado()).toBe("Passo 1 de 3 · Escolher produtos");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("5 escolhidos");
    ir(2);
    expect(screen.getByText("Nome da família").nextElementSibling).toHaveTextContent("Lava-louças VELAR");
    clicar("Guardar na sessão");
    expect(ultima).toHaveLength(1);
    clicar(EXEMPLO_VELAR);
    ir(2);
    expect(screen.getByRole("button", { name: "Guardar na sessão" })).toBeDisabled();
    expect(screen.getByText(/Para guardar: .*identificador.*escolha outros produtos ou remova a família que já existe/i, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    semCamposDeEscrita();
  });

  it("editar uma família agrupada mostra os atributos de cada produto só de leitura (SKU e preço vêm do catálogo)", () => {
    abrirVelar();
    ir(2); clicar("Guardar na sessão");
    clicar("Editar Lava-louças VELAR");
    ir(1);
    expect(linhaDe(/VELAR 1 CUBA 34/)).toHaveTextContent(/34 cm/);
    expect(within(tabelaAtributos()).getAllByRole("row")).toHaveLength(6);
    expect(screen.getByText(/O SKU e o preço são os do catálogo/)).toBeInTheDocument();
    semCamposDeEscrita();
  });
});

describe("PainelConfigurador: 400 px", () => {
  it("os grupos de escolha quebram (min-w-0, flex-wrap) e as tabelas ficam num contentor com scroll horizontal (a página não rola)", () => {
    betasNosAtributos();
    expect(grupoCor().className).toMatch(/min-w-0/);
    expect(grupoMedida().className).toMatch(/min-w-0/);
    expect(grupoMedida().querySelector(".flex-wrap")).not.toBeNull();
    expect(tabelaAtributos().closest("div")).toHaveClass("overflow-x-auto");
    for (const r of within(grupoMedida()).getAllByRole("checkbox")) expect(r.closest("label")!.className).toMatch(/min-h-11/);
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
describe("PassoAtributos: a cor não se escolhe", () => {
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
  it("um acabamento que o protótipo não conhece dá cinzento neutro com a nota, em texto", () => {
    abrirNova({ produtos: [produto("n1", "Lava-louças X 40 - Pedra bege", 100)], arvore: [] });
    fireEvent.click(caixa(/Pedra bege/));
    ir(1);
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
    expect(linhaDe(/Zeta 40 - Cobre/)).toHaveTextContent(/Erro: sem preço de venda no catálogo/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/não tem preço de venda/);
    expect(resumoAtribuicao().parentElement?.className).toMatch(/sticky/);
  });
  it("no resumo os erros ficam no topo, antes dos dados da família, e a tabela tem altura limitada com cabeçalho fixo", () => {
    abrirVelar();
    ir(2); clicar("Guardar na sessão");
    clicar(EXEMPLO_VELAR);
    ir(2);
    const alerta = screen.getByRole("alert");
    expect(alerta.compareDocumentPosition(screen.getByText("Nome da família")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
