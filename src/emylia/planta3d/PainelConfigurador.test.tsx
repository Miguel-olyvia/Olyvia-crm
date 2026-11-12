// O painel «Configurador de famílias» (protótipo, só em memória): assistente de 3 passos (Família, Produtos e acabamentos, Resumo), com os acabamentos POR PRODUTO.
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Produto } from "../v2/catalogoModelo";
import { PainelConfigurador, type PainelConfiguradorProps } from "./PainelConfigurador";
import { linhasDeVariantes, type FamiliaCfg } from "./configurador";

afterEach(cleanup);

let ultima: FamiliaCfg[] = [];
function Casa({ inicial = [], catalogo }: { inicial?: FamiliaCfg[]; catalogo?: PainelConfiguradorProps["catalogo"] }) {
  const [lista, setLista] = useState<FamiliaCfg[]>(inicial);
  ultima = lista;
  return <PainelConfigurador familias={lista} onFamilias={setLista} catalogo={catalogo} />;
}
const estado = () => screen.getByText(/^Passo \d de \d · /).textContent;
const seguinte = () => screen.getByRole("button", { name: "Seguinte" });
const abrirExemplo = () => { render(<Casa />); fireEvent.click(screen.getByRole("button", { name: "Começar pelo exemplo" })); };
const abrirLody = () => { render(<Casa />); fireEvent.click(screen.getByRole("button", { name: "Exemplo: Lody, FRASA (9 produtos)" })); };
const abrirNova = () => { render(<Casa />); fireEvent.click(screen.getByRole("button", { name: "Nova família" })); };
const ir = (n: number) => { for (let i = 0; i < n; i++) fireEvent.click(seguinte()); };
const escrever = (rotulo: string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const clicar = (nome: string) => fireEvent.click(screen.getByRole("button", { name: nome }));
const nomesDoProduto = (p: number) => screen.queryAllByLabelText(new RegExp(`^Nome do acabamento \\d+ do produto ${p}$`)).map((e) => (e as HTMLInputElement).value);
const tabela = () => screen.getByRole("table", { name: "Variantes geradas" });
const celulasDaLinha = (l: HTMLElement) => within(l).getAllByRole("cell").map((c) => c.textContent);

/** Nova família com 2 produtos: 80 cm (Inox e Acabamento 2) e 100 cm (só um acabamento), pronta para o resumo. */
function doisProdutosNaUI() {
  abrirNova();
  escrever("Nome da família", "Lava-loiça Teste");
  ir(1);
  escrever("Rótulo do produto 1", "80 cm"); escrever("Referência do produto 1", "T-80"); escrever("Preço base do produto 1 (€)", "100");
  escrever("Nome do acabamento 1 do produto 1", "Inox"); escrever("Código do acabamento 1 do produto 1", "IX");
  clicar("Adicionar acabamento ao produto 1");
  escrever("Nome do acabamento 2 do produto 1", "Negro"); escrever("Código do acabamento 2 do produto 1", "NE");
  clicar("Adicionar produto");
  escrever("Rótulo do produto 2", "100 cm"); escrever("Referência do produto 2", "T-100"); escrever("Preço base do produto 2 (€)", "150");
  clicar("Adicionar acabamento ao produto 2");
  escrever("Nome do acabamento 1 do produto 2", "Cobre"); escrever("Código do acabamento 1 do produto 2", "CO");
  escrever("Preço do acabamento 1 do produto 2 (€)", "170");
}

describe("PainelConfigurador", () => {
  it("mostra o aviso do protótipo e a lista vazia", () => {
    render(<Casa />);
    expect(screen.getByText(/Protótipo: só dura nesta sessão; nada é guardado\. Uma peça posta na planta com uma família configurada perde-se ao recarregar/)).toBeInTheDocument();
    expect(screen.getByText("Ainda sem famílias configuradas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova família" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exemplo: Lody, FRASA (9 produtos)" })).toBeInTheDocument();
  });

  it("um passo visível de cada vez, com «Passo n de 3», Anterior e um só Seguinte; o foco vai para o título; já não há os passos globais Acabamentos e Matriz", () => {
    abrirExemplo();
    expect(estado()).toBe("Passo 1 de 3 · Família");
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Seguinte" })).toHaveLength(1);
    expect(screen.getByLabelText("Nome da família")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Preço base/)).not.toBeInTheDocument();
    fireEvent.click(seguinte());
    expect(estado()).toBe("Passo 2 de 3 · Produtos e acabamentos");
    expect(screen.getByRole("heading", { name: "Produtos e acabamentos" })).toHaveFocus();
    expect(screen.queryByLabelText("Nome da família")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Seguinte" })).toHaveLength(1);
    ir(1); expect(estado()).toBe("Passo 3 de 3 · Resumo e pré-visualização");
    expect(screen.getByRole("heading", { name: "Resumo e pré-visualização" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Seguinte" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Combinações|Matriz/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(estado()).toBe("Passo 2 de 3 · Produtos e acabamentos");
  });

  it("sem nome o Seguinte fica desligado e diz porquê por escrito", () => {
    abrirExemplo();
    escrever("Nome da família", "  ");
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/Escreva o nome da família/)).toBeInTheDocument();
    escrever("Nome da família", "Lava-loiça Nova");
    expect(seguinte()).toBeEnabled();
  });

  it("criar 2 produtos com acabamentos diferentes gera as variantes certas, com SKUs e preços distintos; um acabamento só existe num produto", () => {
    doisProdutosNaUI();
    expect(nomesDoProduto(1)).toEqual(["Inox", "Negro"]);
    expect(nomesDoProduto(2)).toEqual(["Cobre"]);
    ir(1);
    expect(estado()).toBe("Passo 3 de 3 · Resumo e pré-visualização");
    expect(screen.getByText("3 produtos = 3 referências")).toBeInTheDocument();
    const linhas = within(tabela()).getAllByRole("row").slice(1).map((l) => celulasDaLinha(l));
    expect(linhas.map((c) => [c[0], c[1], c[2]])).toEqual([["80 cm", "Inox", "T-80-IX"], ["80 cm", "Negro", "T-80-NE"], ["100 cm", "Cobre", "T-100-CO"]]);
    expect(linhas[0][3]).toMatch(/100,00/); expect(linhas[2][3]).toMatch(/170,00/);
    expect(linhas.map((c) => c[4])).toEqual(["Não", "Não", "Não"]);
    expect(within(screen.getByRole("list", { name: "Pré-visualização da família" })).getByText(/SKU T-80-IX/)).toBeInTheDocument();
    clicar("Guardar na sessão");
    expect(linhasDeVariantes(ultima[0]).map((l) => l.sku)).toEqual(["T-80-IX", "T-80-NE", "T-100-CO"]);
  });

  it("a tabela do resumo fica dentro de um contentor com scroll horizontal (400 px sem scroll na página)", () => {
    abrirLody(); ir(2);
    expect(tabela().closest("div")).toHaveClass("overflow-x-auto");
  });

  it("copiar os acabamentos deste produto para os outros e aplicar o mesmo acabamento a todos", () => {
    abrirNova();
    escrever("Nome da família", "Teste copiar"); ir(1);
    clicar("Adicionar produto");
    expect(nomesDoProduto(1)).toHaveLength(1); expect(nomesDoProduto(2)).toEqual([]);
    expect(screen.getByText(/O produto 2 ainda não tem acabamentos/)).toBeInTheDocument();
    clicar("Copiar os acabamentos do produto 1 para os outros");
    expect(nomesDoProduto(2)).toEqual(nomesDoProduto(1));
    clicar("Adicionar acabamento ao produto 1");
    escrever("Nome do acabamento 2 do produto 1", "Gold");
    expect(nomesDoProduto(2)).toHaveLength(1);
    clicar("Aplicar o acabamento 2 do produto 1 a todos os produtos");
    expect(nomesDoProduto(2)).toEqual(["Acabamento 1", "Gold"]);
  });

  it("reutilizar um acabamento que já existe noutro produto não cria um novo", () => {
    abrirNova();
    escrever("Nome da família", "Teste reutilizar"); ir(1);
    clicar("Adicionar produto");
    fireEvent.change(screen.getByLabelText("Acabamento da família a juntar ao produto 2"), { target: { value: "a1" } });
    clicar("Juntar acabamento existente ao produto 2");
    expect(nomesDoProduto(2)).toEqual(["Acabamento 1"]);
    expect(screen.queryByLabelText("Acabamento da família a juntar ao produto 2")).not.toBeInTheDocument();
  });

  it("tirar um acabamento de um produto não o tira dos outros", () => {
    abrirLody(); ir(1);
    clicar("Remover o acabamento 1 do produto 1");
    expect(nomesDoProduto(1)).toEqual(["Gold", "Gunmetal"]);
    expect(nomesDoProduto(2)).toEqual(["Cobre", "Gold", "Gunmetal"]);
  });

  it("SKU duplicado aparece como erro, bloqueia o Seguinte e diz porquê; corrigir desbloqueia", () => {
    abrirLody(); ir(1);
    escrever("SKU do acabamento 2 do produto 2", "LOD-40-CO");
    expect(screen.getByRole("alert")).toHaveTextContent(/SKU «LOD-40-CO»/);
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/Para continuar: .*SKU «LOD-40-CO»/, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    escrever("SKU do acabamento 2 do produto 2", "LOD-50-GO");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(seguinte()).toBeEnabled();
  });

  it("o SKU nasce automático (referência + separador + código), acompanha o código e o separador, e é editável", () => {
    abrirNova();
    escrever("Nome da família", "Teste SKU"); ir(1);
    escrever("Referência do produto 1", "ZZ-1"); escrever("Código do acabamento 1 do produto 1", "XY");
    expect(screen.getByLabelText("SKU do acabamento 1 do produto 1")).toHaveValue("ZZ-1-XY");
    escrever("Separador do SKU", ".");
    expect(screen.getByLabelText("SKU do acabamento 1 do produto 1")).toHaveValue("ZZ-1.XY");
    escrever("SKU do acabamento 1 do produto 1", "MEU-SKU");
    expect(screen.getByLabelText("SKU do acabamento 1 do produto 1")).toHaveValue("MEU-SKU");
  });

  it("produto sem preço bloqueia o Seguinte com o motivo; produto sem acabamentos também", () => {
    abrirNova();
    escrever("Nome da família", "Teste motivos"); ir(1);
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/preço/i, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    escrever("Preço base do produto 1 (€)", "90");
    expect(seguinte()).toBeEnabled();
    clicar("Adicionar produto");
    escrever("Preço base do produto 2 (€)", "95");
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/não tem nenhum acabamento/, { selector: "#motivo-seguinte" })).toBeInTheDocument();
  });

  it("variante desligada: continua na lista do produto mas fica fora do resumo", () => {
    abrirLody(); ir(1);
    fireEvent.click(screen.getByRole("checkbox", { name: "Ativo: acabamento 3 do produto 3" }));
    expect(screen.getByText(/desligado neste produto/)).toBeInTheDocument();
    ir(1);
    expect(screen.getByText("8 produtos = 8 referências")).toBeInTheDocument();
  });

  it("modelo 3D por variante: escolher um GLB dá «Sim» no resumo; sem escolha, «Não»", () => {
    abrirNova();
    escrever("Nome da família", "Teste 3D"); ir(1);
    escrever("Preço base do produto 1 (€)", "90");
    const select = screen.getByLabelText("Modelo 3D do acabamento 1 do produto 1") as HTMLSelectElement;
    expect(select.value).toBe("");
    const opcao = Array.from(select.options).find((o) => o.value.startsWith("lava_loica|"))!;
    fireEvent.change(select, { target: { value: opcao.value } });
    expect(screen.getByText("3D do fabricante")).toBeInTheDocument();
    ir(1);
    expect(celulasDaLinha(within(tabela()).getAllByRole("row")[1])[4]).toBe("Sim");
  });

  it("a semente Lody: 9 produtos = 9 referências, tabela com as 9 variantes (SKU, preço, 3D sim) e o cartão ao vivo", () => {
    abrirLody();
    expect(screen.getByLabelText("Nome da família")).toHaveValue("Lava-loiça Lody, FRASA (exemplo: 9 produtos)");
    ir(1);
    expect(screen.getAllByLabelText(/^Rótulo do produto \d$/)).toHaveLength(3);
    expect(nomesDoProduto(1)).toEqual(["Cobre", "Gold", "Gunmetal"]);
    ir(1);
    expect(screen.getByText("9 produtos = 9 referências")).toBeInTheDocument();
    const linhas = within(tabela()).getAllByRole("row");
    expect(linhas).toHaveLength(10);
    const corpo = linhas.slice(1).map(celulasDaLinha);
    expect(corpo.map((c) => c[2])).toContain("LOD-70-GM");
    expect(corpo.every((c) => c[4] === "Sim")).toBe(true);
    expect(new Set(corpo.map((c) => c[3])).size).toBe(9);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Pré-visualização da família" })).toBeInTheDocument();
    clicar("Guardar na sessão");
    expect(ultima.map((f) => f.id)).toEqual(["cfg:lava-loica-lody-frasa-exemplo"]);
    expect(within(screen.getByRole("list", { name: "Famílias configuradas" })).getByText(/9 variantes/)).toBeInTheDocument();
  });

  it("Guardar na sessão entrega a família a quem usa o painel (onFamilias) e fica na lista com Editar e Remover", () => {
    abrirExemplo();
    ir(2);
    expect(estado()).toBe("Passo 3 de 3 · Resumo e pré-visualização");
    expect(screen.getByRole("list", { name: "Pré-visualização da família" })).toBeInTheDocument();
    expect(ultima).toEqual([]);
    clicar("Guardar na sessão");
    expect(ultima.map((f) => f.id)).toEqual(["cfg:lava-loica-keran"]);
    const lista = screen.getByRole("list", { name: "Famílias configuradas" });
    expect(within(lista).getByText(/Lava-loiça Keran/)).toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: /^Editar/ })).toBeInTheDocument();
    fireEvent.click(within(lista).getByRole("button", { name: /^Remover/ }));
    expect(ultima).toEqual([]);
  });

  it("editar uma família guardada reconstrói os produtos e os acabamentos a partir da matriz (preço próprio, variante desligada, 3D)", () => {
    abrirExemplo(); ir(2); clicar("Guardar na sessão");
    fireEvent.click(screen.getByRole("button", { name: /^Editar/ }));
    ir(1);
    expect(screen.getAllByLabelText(/^Rótulo do produto \d$/).map((e) => (e as HTMLInputElement).value)).toEqual(["80 cm", "100 cm (1 cuba e meia)"]);
    expect(nomesDoProduto(1)).toEqual(["Inox escovado", "Gun Metal"]);
    expect(screen.getByRole("checkbox", { name: "Ativo: acabamento 2 do produto 1" })).not.toBeChecked();
    expect(screen.getByLabelText("Preço do acabamento 2 do produto 2 (€)")).toHaveValue(199);
    expect((screen.getByLabelText("Modelo 3D do acabamento 1 do produto 2") as HTMLSelectElement).value).toBe("lava_loica|keran100|inox");
    expect(screen.getByLabelText("SKU do acabamento 1 do produto 2")).toHaveValue("KER-100-IX");
  });

  it("editar e guardar substitui a família (não duplica); guardar uma segunda com o mesmo nome é recusado", () => {
    abrirExemplo(); ir(2);
    clicar("Guardar na sessão");
    fireEvent.click(screen.getByRole("button", { name: /^Editar/ }));
    escrever("Marca", "OUTRA");
    ir(2); clicar("Guardar na sessão");
    expect(ultima).toHaveLength(1);
    expect(ultima[0].marca).toBe("OUTRA");
    fireEvent.click(screen.getByRole("button", { name: "Começar pelo exemplo" }));
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/identificador/i, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    escrever("Nome da família", "Lava-loiça Keran 2");
    expect(seguinte()).toBeEnabled();
  });
});

/* ------------------------------------------------------------------ juntar produtos do catálogo */
const produto = (id: string, n: string, pvp: number | undefined, extra: Partial<Produto> = {}): Produto => ({ id, n, custo: 80, un: "un", marca: "FRASA", fornecedor: "Forn", data: "2026-10-01", no: null, sku: `SKU-${id}`, sub: "Cubas inox", ...(pvp !== undefined ? { pvp } : {}), ...extra });
const LODY: Produto[] = [];
for (const [i, tam] of [40, 50, 70].entries()) for (const [j, ac] of ["Cobre", "Gold", "Gunmetal"].entries()) LODY.push(produto(`l${tam}${ac.slice(0, 2)}`, `Lava-louças Lody ${tam} - ${ac}`, 139 + i * 20 + j));
const VELARES: Produto[] = [34, 40, 45, 50, 70].map((t, i) => produto(`v${t}`, `Lava-louças VELAR 1 CUBA ${t}`, 149 + i));
const OUTROS: Produto[] = [produto("s1", "Sanita compacta", 165, { sub: "Sanitas", marca: "Roca" }), produto("t1", "Misturadora de bidé X - Cromo", 99, { sub: "Torneiras", marca: "Rodi" })];
const CATALOGO = { produtos: [...OUTROS, ...LODY, ...VELARES], arvore: [] };
const abrirJuntar = (cat = CATALOGO) => {
  render(<Casa catalogo={cat} />);
  clicar("Nova família");
  fireEvent.click(screen.getByRole("radio", { name: "Juntar produtos do catálogo" }));
  ir(1);
};
const caixa = (nome: RegExp) => screen.getByRole("checkbox", { name: nome });
const escolherLody = () => { for (const p of LODY) fireEvent.click(caixa(new RegExp(`${p.n}$|${p.n}[ ,]`))); };
const valor = (rotulo: string) => (screen.getByLabelText(rotulo) as HTMLInputElement).value;

describe("PainelConfigurador: juntar produtos do catálogo", () => {
  it("o passo 1 pergunta «Como quer criar a família?»: «Do zero» (por omissão, 3 passos) ou «Juntar produtos do catálogo» (4 passos)", () => {
    render(<Casa catalogo={CATALOGO} />);
    clicar("Nova família");
    const grupo = screen.getByRole("group", { name: "Como quer criar a família?" });
    expect(within(grupo).getByRole("radio", { name: "Do zero" })).toBeChecked();
    expect(estado()).toBe("Passo 1 de 3 · Família");
    expect(screen.getByLabelText("Nome da família")).toBeInTheDocument();
    fireEvent.click(within(grupo).getByRole("radio", { name: "Juntar produtos do catálogo" }));
    expect(estado()).toBe("Passo 1 de 4 · Família");
    expect(screen.queryByLabelText("Nome da família")).not.toBeInTheDocument();
    fireEvent.click(within(grupo).getByRole("radio", { name: "Do zero" }));
    expect(estado()).toBe("Passo 1 de 3 · Família");
  });

  it("uma família que já existe (exemplo ou a editar) não pergunta como criar", () => {
    abrirExemplo();
    expect(screen.queryByRole("group", { name: "Como quer criar a família?" })).not.toBeInTheDocument();
  });

  it("escolher produtos: um passo, foco no título, Seguinte desligado com o motivo escrito até haver um produto", () => {
    abrirJuntar();
    expect(estado()).toBe("Passo 2 de 4 · Escolher produtos");
    expect(screen.getByRole("heading", { name: "Escolher produtos" })).toHaveFocus();
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText("Para continuar: escolha pelo menos um produto do catálogo.")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("Nenhum produto escolhido");
    fireEvent.click(caixa(/Sanita compacta/));
    expect(seguinte()).toBeEnabled();
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("1 escolhido");
  });

  it("a pesquisa filtra por nome, marca, referência e categoria; o que já foi escolhido mantém-se; a lista tem altura limitada e rola", () => {
    abrirJuntar();
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
    abrirJuntar();
    const c = caixa(/Sanita compacta/);
    expect(c.closest("label")).toHaveTextContent(/Sanita compacta.*SKU-s1.*165,00/);
  });

  it("os 9 produtos Lody: 3 medidas × 3 acabamentos, palpite pelo nome, SKU e preço só de leitura, e guardar na sessão", () => {
    abrirJuntar();
    escolherLody();
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("9 escolhidos");
    ir(1);
    expect(estado()).toBe("Passo 3 de 4 · Atribuir medidas e acabamentos");
    expect(screen.getByRole("heading", { name: "Atribuir medidas e acabamentos" })).toHaveFocus();
    // sugestões da família, editáveis
    expect(valor("Nome da família")).toBe("Lava-louças Lody");
    expect(valor("Marca")).toBe("FRASA");
    expect((screen.getByLabelText("Categoria") as HTMLSelectElement).value).toBe("lavaloicas");
    // o palpite por produto
    expect(valor("Medida do produto 1")).toBe("40 cm"); expect(valor("Acabamento do produto 1")).toBe("Cobre");
    expect(valor("Medida do produto 5")).toBe("50 cm"); expect(valor("Acabamento do produto 5")).toBe("Gold");
    expect(valor("Largura do produto 1 (cm)")).toBe("44");
    expect(screen.getByRole("status", { name: "Resumo da atribuição" })).toHaveTextContent("9 produtos = 3 medidas × 3 acabamentos");
    // SKU e preço vêm do produto: texto, sem campo para escrever
    const prod1 = screen.getByRole("group", { name: /^Produto 1:/ });
    expect(within(prod1).getByText(/SKU-l40C.*139,00.*vem do produto do catálogo/)).toBeInTheDocument();
    expect(within(prod1).queryByLabelText(/SKU|Preço/)).not.toBeInTheDocument();
    ir(1);
    expect(estado()).toBe("Passo 4 de 4 · Resumo e pré-visualização");
    expect(screen.getByText("9 produtos = 9 referências")).toBeInTheDocument();
    const linhas = within(tabela()).getAllByRole("row").slice(1).map((l) => celulasDaLinha(l));
    expect(linhas).toHaveLength(9);
    expect(linhas.map((c) => c[2]).sort()).toEqual(LODY.map((p) => p.sku!).sort());
    expect(linhas.find((c) => c[2] === "SKU-l40Co")?.[3]).toMatch(/139,00/);
    expect(within(screen.getByRole("list", { name: "Pré-visualização da família" })).getAllByRole("listitem")).toHaveLength(1);
    clicar("Guardar na sessão");
    expect(ultima).toHaveLength(1);
    const f = ultima[0];
    expect(Object.values(f.celulas).filter((c) => c.produtoId)).toHaveLength(9);
    expect(linhasDeVariantes(f).map((l) => l.sku).sort()).toEqual(LODY.map((p) => p.sku!).sort());
    expect(f.medidas).toHaveLength(3); expect(f.acabamentos).toHaveLength(3);
    expect(screen.getByText("Lava-louças Lody")).toBeInTheDocument();
  });

  it("o palpite é editável: mudar a medida de um produto muda a família; uma medida/acabamento repetido é um erro que bloqueia o Seguinte", () => {
    abrirJuntar();
    fireEvent.click(caixa(/Lody 40 - Cobre/)); fireEvent.click(caixa(/Lody 40 - Gold/));
    ir(1);
    expect(screen.getByRole("status", { name: "Resumo da atribuição" })).toHaveTextContent("2 produtos = 1 medida × 2 acabamentos");
    escrever("Medida do produto 2", "45 cm");
    expect(screen.getByRole("status", { name: "Resumo da atribuição" })).toHaveTextContent("2 produtos = 2 medidas × 2 acabamentos");
    escrever("Medida do produto 2", "40 cm"); escrever("Acabamento do produto 2", "Cobre");
    expect(screen.getByRole("alert")).toHaveTextContent(/mesma medida \(40 cm\) e o mesmo acabamento \(Cobre\)/);
    expect(seguinte()).toBeDisabled();
    expect(screen.getByText(/Para continuar: .*mesma medida/, { selector: "#motivo-seguinte" })).toBeInTheDocument();
    escrever("Acabamento do produto 2", "Gold");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(seguinte()).toBeEnabled();
  });

  it("produto sem preço de venda: erro visível por escrito, e o Seguinte e o Guardar ficam bloqueados", () => {
    const semPreco = { produtos: [...CATALOGO.produtos, produto("x1", "Lava-louças Zeta 40 - Cobre", undefined, { custo: 0 })], arvore: [] };
    abrirJuntar(semPreco);
    fireEvent.click(caixa(/Zeta 40 - Cobre/));
    ir(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/«Lava-louças Zeta 40 - Cobre» não tem preço de venda/);
    expect(screen.getByText(/sem preço de venda/i, { selector: "fieldset p" })).toBeInTheDocument();
    expect(seguinte()).toBeDisabled();
  });

  it("produto sem PVP mas com custo: o preço é o calculado pelo catálogo e diz-se por escrito", () => {
    const semPvp = { produtos: [produto("c1", "Lava-louças Alfa 40 - Inox", undefined, { custo: 65 })], arvore: [] };
    abrirJuntar(semPvp);
    fireEvent.click(caixa(/Alfa 40/));
    ir(1);
    expect(screen.getByRole("group", { name: /^Produto 1:/ })).toHaveTextContent(/100,00.*sem PVP.*custo/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tirar um produto da família na atribuição desmarca-o; sem produtos volta a pedir a escolha", () => {
    abrirJuntar();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(1);
    clicar("Tirar o produto 1 da família");
    expect(estado()).toBe("Passo 2 de 4 · Escolher produtos");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("Nenhum produto escolhido");
  });

  it("Anterior volta atrás e as escolhas mantêm-se; Cancelar sai", () => {
    abrirJuntar();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(1);
    clicar("Anterior");
    expect(caixa(/Lody 40 - Cobre/)).toBeChecked();
    clicar("Cancelar");
    expect(screen.getByRole("button", { name: "Nova família" })).toBeInTheDocument();
  });

  it("«Exemplo: agrupar as lava-loiças Velar do catálogo» pré-seleciona as 5 Velar e abre a escolha", () => {
    render(<Casa catalogo={CATALOGO} />);
    clicar("Exemplo: agrupar as lava-loiças Velar do catálogo");
    expect(estado()).toBe("Passo 2 de 4 · Escolher produtos");
    expect(screen.getByRole("status", { name: "Produtos escolhidos" })).toHaveTextContent("5 escolhidos");
    ir(1);
    expect(valor("Nome da família")).toBe("Lava-louças VELAR");
    expect(screen.getByRole("status", { name: "Resumo da atribuição" })).toHaveTextContent("5 produtos = 5 medidas × 1 acabamento");
    expect(valor("Acabamento do produto 1")).toBe("Inox");
  });

  it("o botão do exemplo só aparece se o catálogo tiver lava-loiças Velar", () => {
    render(<Casa catalogo={{ produtos: OUTROS, arvore: [] }} />);
    expect(screen.queryByRole("button", { name: /agrupar as lava-loiças Velar/ })).not.toBeInTheDocument();
  });

  it("a Velar 70 propõe o 3D do fabricante (velar71) e o resumo conta-o", () => {
    render(<Casa catalogo={CATALOGO} />);
    clicar("Exemplo: agrupar as lava-loiças Velar do catálogo");
    ir(2);
    expect(screen.getByText("5 produtos = 5 referências")).toBeInTheDocument();
    const linhas = within(tabela()).getAllByRole("row").slice(1).map((l) => celulasDaLinha(l));
    expect(linhas.map((c) => c[4])).toEqual(["Sim", "Sim", "Sim", "Sim", "Sim"]);
  });

  it("editar uma família agrupada: o SKU e o preço das variantes aparecem só de leitura, com o aviso", () => {
    render(<Casa catalogo={CATALOGO} />);
    clicar("Exemplo: agrupar as lava-loiças Velar do catálogo");
    ir(2); clicar("Guardar na sessão");
    clicar("Editar Lava-louças VELAR");
    expect(screen.queryByRole("group", { name: "Como quer criar a família?" })).not.toBeInTheDocument();
    ir(1);
    expect(screen.getByLabelText("SKU do acabamento 1 do produto 1")).toBeDisabled();
    expect(screen.getByLabelText("Preço do acabamento 1 do produto 1 (€)")).toBeDisabled();
    expect(screen.getAllByText(/vem do produto do catálogo/).length).toBeGreaterThan(0);
  });

  it("400 px: os campos da atribuição e a tabela não obrigam a scroll horizontal da página (grelhas que quebram, tabela em overflow-x-auto)", () => {
    abrirJuntar();
    fireEvent.click(caixa(/Lody 40 - Cobre/));
    ir(1);
    const g = screen.getByRole("group", { name: /^Produto 1:/ });
    expect(g.className).toMatch(/min-w-0/);
    expect(g.querySelector(".grid")).not.toBeNull();
    ir(1);
    expect(tabela().closest("div")).toHaveClass("overflow-x-auto");
  });
});
