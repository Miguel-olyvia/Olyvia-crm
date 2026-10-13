import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { seed, type Estado } from "../motor";
import { CatalogoV2 } from "./CatalogoV2";
import { reporCustos } from "./custosStore";
import { lerCatalogo } from "./catalogoStore";
import { Montar, primarios } from "./testeV2";

afterEach(() => { cleanup(); reporCustos(); });

function pagina(S: Estado = seed()) {
  const r = render(<Montar S={S}>{(ctx) => <CatalogoV2 {...ctx} />}</Montar>);
  return { S, ...r };
}
/** As secções, pelo id (consultas mais rápidas do que no ecrã todo). */
const sec = (id: string) => within(document.getElementById(id)!);
const chipsOficio = () => within(sec("cat-servicos").getByRole("group", { name: "Ofício" }));
const aviso = () => within(document.body).getByRole("status", { name: "Avisos" });
const pacotes = () => screen.getByRole("list", { name: "Pacotes" });
const servicos = () => within(screen.getByRole("table", { name: /Serviços do Catálogo/ })).getAllByRole("row").slice(1);
/** Escolher um nó da árvore (mostra as ações dele). */
const no = (n: string) => fireEvent.click(sec("cat-classificacao").getByRole("button", { name: new RegExp(`^${n},`) }));
const escrever = (el: HTMLElement, v: string) => { fireEvent.change(el, { target: { value: v } }); fireEvent.blur(el); };

describe("Catálogo · Pacotes", () => {
  it("lista os pacotes de arranque (os LINHAS do motor); abrir um mostra as linhas, a regra pela medida e as alternativas na linha", () => {
    pagina();
    expect(screen.getByRole("link", { name: "Pacotes" })).toBeInTheDocument();
    const wc = within(pacotes()).getByRole("button", { name: /Casa de banho · WC com base de duche/ });
    expect(wc).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(wc);
    expect(wc).toHaveAttribute("aria-expanded", "true");
    const tab = screen.getByRole("table", { name: /Linhas de Casa de banho/ });
    expect(within(tab).getAllByText("1 por m² de pavimento").length).toBeGreaterThan(0);
    expect(within(tab).getByText("1,1 por m² de paredes, arredondado")).toBeInTheDocument();
    // alternativa "ou" na própria linha, sem diálogo
    const banheira = within(tab).getByRole("button", { name: "Banheira acrílica 170×70" });
    expect(banheira).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(banheira);
    expect(within(screen.getByRole("table", { name: /Linhas de Casa de banho/ })).getByRole("button", { name: "Banheira acrílica 170×70" })).toHaveAttribute("aria-pressed", "true");
    expect(aviso()).toHaveTextContent("Escolhido: Banheira acrílica 170×70");
    // mudar a regra: escolher, não escrever
    fireEvent.change(screen.getByRole("combobox", { name: "Quantidade de Demolição e entulho" }), { target: { value: "fixo" } });
    const demol = within(screen.getByRole("table", { name: /Linhas de Casa de banho/ })).getAllByRole("row").find((r) => /Demolição e entulho/.test(r.textContent ?? ""))!;
    expect(within(demol).getByText("fixo 1")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("criar um pacote em 4 toques: Novo pacote → nome → dois chips", () => {
    pagina();
    let toques = 0;
    const tocar = (el: HTMLElement) => { toques++; fireEvent.click(el); };
    tocar(screen.getByRole("button", { name: "Novo pacote" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do pacote" }), { target: { value: "Pintura de quarto" } });
    tocar(screen.getByRole("button", { name: "Criar pacote" }));
    expect(aviso()).toHaveTextContent("Pacote «Pintura de quarto» criado");
    const juntar = screen.getByRole("group", { name: "Juntar a Pintura de quarto" });
    expect(within(juntar).getByRole("searchbox")).toHaveFocus();
    fireEvent.change(within(juntar).getByRole("searchbox"), { target: { value: "pintura" } });
    tocar(within(juntar).getByRole("button", { name: /Serviço:\s*Pintura de tetos e paredes/ }));
    fireEvent.change(within(screen.getByRole("group", { name: "Juntar a Pintura de quarto" })).getByRole("searchbox"), { target: { value: "tinta" } });
    tocar(within(screen.getByRole("group", { name: "Juntar a Pintura de quarto" })).getByRole("button", { name: /Material:\s*Tinta acrílica/ }));
    expect(toques).toBe(4);
    const linhas = within(screen.getByRole("table", { name: /Linhas de Pintura de quarto/ })).getAllByRole("row").slice(1);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toHaveTextContent("1 por m² de pavimento");
    expect(lerCatalogo().pacotes.find((p) => p.n === "Pintura de quarto")!.linhas).toHaveLength(2);
  });
  it("juntar uma alternativa (ou…) numa linha e retirar uma linha com Anular", () => {
    pagina();
    fireEvent.click(within(pacotes()).getByRole("button", { name: /Cozinha · Cozinha linear/ }));
    const tab = () => within(screen.getByRole("table", { name: /Linhas de Cozinha/ }));
    fireEvent.click(tab().getByRole("button", { name: /alternativa a Conjunto de móveis de cozinha/ }));
    const g = tab().getByRole("group", { name: "Alternativa a Conjunto de móveis de cozinha" });
    fireEvent.change(within(g).getByRole("searchbox"), { target: { value: "bancada lam" } });
    fireEvent.click(within(g).getByRole("button", { name: /Bancada laminada/ }));
    expect(tab().getByRole("list", { name: "Alternativas de Conjunto de móveis de cozinha" })).toBeInTheDocument();
    const antes = lerCatalogo().pacotes[1].linhas.length;
    fireEvent.click(tab().getByRole("button", { name: "Retirar Demolição e entulho do pacote" }));
    expect(lerCatalogo().pacotes[1].linhas).toHaveLength(antes - 1);
    fireEvent.click(within(aviso()).getByRole("button", { name: "Anular" }));
    expect(lerCatalogo().pacotes[1].linhas).toHaveLength(antes);
  });
  it("um só editor na linha aberto de cada vez, e nenhum botão primário na página da lista", () => {
    const { container } = pagina();
    fireEvent.click(screen.getByRole("button", { name: "Novo pacote" }));
    expect(screen.getByRole("group", { name: "Novo pacote" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Novo material" }));
    expect(screen.queryByRole("group", { name: "Novo pacote" })).toBeNull();
    expect(screen.getByRole("group", { name: "Novo material" })).toBeInTheDocument();
    expect(primarios(container).length).toBeLessThanOrEqual(1);
  });
});

describe("Catálogo · Materiais e consumíveis", () => {
  it("material novo com unidade e marca criadas ao escrever", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: "Novo material" }));
    const f = screen.getByRole("group", { name: "Novo material" });
    fireEvent.change(within(f).getByRole("textbox", { name: "Nome" }), { target: { value: "Primário acrílico" } });
    fireEvent.change(within(f).getByRole("textbox", { name: "Custo €" }), { target: { value: "12,5" } });
    const un = within(f).getByRole("combobox", { name: "Unidade" });
    fireEvent.focus(un);
    fireEvent.change(un, { target: { value: "bidão" } });
    fireEvent.click(within(f).getByRole("option", { name: "Criar «bidão»" }));
    const marca = within(f).getByRole("combobox", { name: "Marca" });
    fireEvent.focus(marca);
    fireEvent.change(marca, { target: { value: "rob" } });
    fireEvent.click(within(f).getByRole("option", { name: "Criar «rob»" }));
    fireEvent.click(within(f).getByRole("button", { name: "Juntar material" }));
    expect(aviso()).toHaveTextContent("Material «Primário acrílico» juntado");
    const p = lerCatalogo().produtos.find((x) => x.n === "Primário acrílico")!;
    expect(p).toMatchObject({ custo: 12.5, un: "bidão", marca: "rob" });
    expect(lerCatalogo().unidades).toContain("bidão");
    expect(lerCatalogo().marcas).toContain("rob");
  });
  it("a combobox mostra as que batem e só propõe criar o que não existe", () => {
    pagina();
    // sem pesquisa mostram-se os primeiros 10; "Mostrar todos" abre o resto
    fireEvent.click(sec("cat-materiais").getByRole("button", { name: /^Mostrar todos os \d+ materiais$/ }));
    const marca = sec("cat-materiais").getByRole("combobox", { name: "Marca de Cimento-cola C2TE" });
    fireEvent.focus(marca);
    fireEvent.change(marca, { target: { value: "WEB" } });
    expect(screen.getByRole("option", { name: "Weber" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Criar «WEB»" })).toBeInTheDocument();
    fireEvent.change(marca, { target: { value: "weber" } });
    expect(screen.queryByRole("option", { name: /Criar/ })).toBeNull();
    fireEvent.change(marca, { target: { value: "Secil" } });
    fireEvent.keyDown(marca, { key: "Enter" });
    expect(lerCatalogo().produtos.find((x) => x.n === "Cimento-cola C2TE")!.marca).toBe("Secil");
    expect(aviso()).toHaveTextContent("Marca «Secil» criada");
  });
  it("mudar o custo põe a data de hoje, atualiza as receitas e tira o Preço desatualizado do serviço; Anular volta", () => {
    const { S } = pagina();
    expect(S.svc.revest.stale).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Materiais com preço desatualizado/ })).toHaveTextContent(/desatualizado\s*2$/);
    fireEvent.change(sec("cat-materiais").getByRole("searchbox", { name: "Procurar material" }), { target: { value: "c2te" } });
    escrever(sec("cat-materiais").getByRole("textbox", { name: "Custo de Cimento-cola C2TE" }), "0,22");
    expect(aviso()).toHaveTextContent("Atualizado em 2 receitas");
    expect(S.svc.revest.stale).toBeNull();
    expect(S.svc.revest.cons).toBeCloseTo(4 * 0.22 + 0.25, 6);
    fireEvent.click(within(aviso()).getByRole("button", { name: "Anular" }));
    expect(lerCatalogo().produtos.find((x) => x.n === "Cimento-cola C2TE")!.custo).toBe(0.19);
    expect(S.svc.revest.stale).toBeTruthy();
  });
  it("na ficha do serviço, os consumíveis escolhem-se da lista de materiais", () => {
    const { S } = pagina();
    fireEvent.click(screen.getByRole("button", { name: /Pintura de tetos e paredes/ }));
    const mat = lerCatalogo().produtos.find((x) => x.n === "Primário acrílico") ?? lerCatalogo().produtos.find((x) => x.n === "Sacos de entulho")!;
    fireEvent.change(screen.getByRole("combobox", { name: "Juntar da lista de materiais" }), { target: { value: mat.id } });
    expect(screen.getByRole("textbox", { name: `Quantidade por m² de ${mat.n}` })).toBeInTheDocument();
    expect(S.svc.pint.cons).toBeCloseTo(2.1 + mat.custo, 6);
  });
});

describe("Catálogo · Classificação numa só árvore", () => {
  it("novo ofício aparece na árvore e nos chips da lista; renomear e mover na linha", () => {
    pagina();
    fireEvent.click(sec("cat-classificacao").getByRole("button", { name: "Novo ofício" }));
    const nome = sec("cat-classificacao").getByRole("textbox", { name: "Nome do ofício" });
    fireEvent.change(nome, { target: { value: "Serralharia" } });
    fireEvent.keyDown(nome, { key: "Enter" });
    expect(sec("cat-classificacao").getByText("Serralharia")).toBeInTheDocument();
    expect(chipsOficio().getByRole("button", { name: /^Serralharia/ })).toBeInTheDocument();
    // repetido não entra
    fireEvent.click(sec("cat-classificacao").getByRole("button", { name: "Novo ofício" }));
    const n2 = sec("cat-classificacao").getByRole("textbox", { name: "Nome do ofício" });
    fireEvent.change(n2, { target: { value: "serralharia" } });
    fireEvent.keyDown(n2, { key: "Enter" });
    expect(screen.getByText("Já existe «serralharia» aqui.")).toBeInTheDocument();
    fireEvent.keyDown(n2, { key: "Escape" });
    // renomear
    no("Pintura");
    fireEvent.click(sec("cat-classificacao").getByRole("button", { name: "Renomear Pintura" }));
    const r = sec("cat-classificacao").getByRole("textbox", { name: "Novo nome de Pintura" });
    fireEvent.change(r, { target: { value: "Pinturas" } });
    fireEvent.keyDown(r, { key: "Enter" });
    expect(chipsOficio().getByRole("button", { name: /^Pinturas/ })).toBeInTheDocument();
    // subir
    const nomes = () => lerCatalogo().arvore.filter((x) => x.pai == null).map((x) => x.n);
    const i = nomes().indexOf("Revestimentos");
    no("Revestimentos");
    fireEvent.click(sec("cat-classificacao").getByRole("button", { name: "Subir Revestimentos" }));
    expect(nomes().indexOf("Revestimentos")).toBe(i - 1);
  });
  it("juntar e retirar um sub (com Anular); o serviço passa para o ofício", () => {
    pagina();
    no("Pintura");
    fireEvent.click(sec("cat-classificacao").getByRole("button", { name: "Juntar sub a Pintura" }));
    const n = sec("cat-classificacao").getByRole("textbox", { name: "Nome do sub de Pintura" });
    fireEvent.change(n, { target: { value: "Interiores" } });
    fireEvent.click(sec("cat-classificacao").getByRole("button", { name: "Juntar sub" }));
    expect(sec("cat-classificacao").getByText("Interiores")).toBeInTheDocument();
    no("Parede");
    fireEvent.click(sec("cat-classificacao").getByRole("button", { name: "Retirar Parede" }));
    expect(lerCatalogo().arvore.some((x) => x.n === "Parede")).toBe(false);
    expect(servicos().find((r) => /Revestimento de parede/.test(r.textContent ?? ""))).toHaveTextContent("Revestimentos");
    fireEvent.click(within(aviso()).getByRole("button", { name: "Anular" }));
    expect(lerCatalogo().arvore.some((x) => x.n === "Parede")).toBe(true);
  });
  it("os chips de ofício filtram a lista única", () => {
    pagina();
    const total = servicos().length;
    fireEvent.click(chipsOficio().getByRole("button", { name: /^Pintura/ }));
    const r = servicos();
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThan(total);
    expect(r.every((x) => /Pintura/.test(x.textContent ?? ""))).toBe(true);
    fireEvent.click(chipsOficio().getByRole("button", { name: "Todos os ofícios" }));
    expect(servicos()).toHaveLength(total);
  });
  it("na ficha do serviço muda-se a classificação, que a lista usa", () => {
    pagina();
    fireEvent.click(screen.getByRole("button", { name: /Teto falso em pladur/ }));
    const sel = screen.getByRole("combobox", { name: "Classificação" }) as HTMLSelectElement;
    const pint = [...sel.options].find((o) => o.text === "Pintura")!;
    fireEvent.change(sel, { target: { value: pint.value } });
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(servicos().find((r) => /Teto falso em pladur/.test(r.textContent ?? ""))).toHaveTextContent("Pintura");
  });
});
