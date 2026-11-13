// 13/11: marca, categoria e subcategoria do produto: três dropdowns com pesquisa (não listas), na criação e na ficha.
// A subcategoria é filtrada pela categoria e fica desativada até haver categoria. «Nova …» cria pelo NOME (cat_guardar_produto_tabelas).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return {
    supabase: {
      rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.respostas[f] ?? { data: null, error: null }; }),
      from: vi.fn(() => cadeia()),
    },
  };
});

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { FichaProduto } from "./FichaProduto";
import { reporCustos } from "./v2/custosStore";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { No, Produto } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const PID = "11111111-2222-4333-8444-555555555555";
const ARVORE: No[] = [
  { id: "c1", n: "Casa de banho", pai: null }, { id: "s1", n: "Louças", pai: "c1" }, { id: "s2", n: "Torneiras", pai: "c1" },
  { id: "c2", n: "Cozinha", pai: null, soProduto: true },
];
const MARCAS = ["Grohe", "Roca"];
const PROD: Produto = { id: PID, n: "Torneira Teste", custo: 60, pvp: 100, un: "un", marca: "Grohe", fornecedor: "", data: "2026-10-01", no: "s2" };
const real = (podeEditar = true): FichaProdutoReal => ({ org: "org-1", podeEditar, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) });

beforeEach(() => { base.chamadas = []; base.respostas = { cat_produto_stock: { data: { gere_stock: true, pode_editar: true, armazens: [] }, error: null } }; });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

const combo = (ctx: HTMLElement | Document, nome: string) => within(ctx as HTMLElement).getByRole("combobox", { name: nome }) as HTMLInputElement;
const escolher = (ctx: HTMLElement | Document, campo: string, opcao: string | RegExp) => {
  fireEvent.click(combo(ctx, campo));
  fireEvent.click(within(ctx as HTMLElement).getByRole("option", { name: opcao }));
};
const opcoes = () => screen.queryAllByRole("option").map((x) => x.textContent);

describe("criar produto: marca, categoria e subcategoria", () => {
  const pagina = () => {
    mudarCatalogo((k) => { k.arvore = structuredClone(ARVORE); k.marcas = [...MARCAS]; });
    const S = seed(), run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    return screen.getByRole("region", { name: "O produto" });
  };
  const escrever = (rot: string, v: string) => fireEvent.change(screen.getByLabelText(rot), { target: { value: v } });
  const criar = (nome: string) => {
    escrever("Nome do produto", nome);
    escrever("Custo de compra", "12");
    fireEvent.click(within(screen.getByRole("complementary", { name: "Pré-visualização" })).getByRole("button", { name: "Criar o produto" }));
    return lerCatalogo().produtos.find((p) => p.n === nome)!;
  };

  it("são três dropdowns com pesquisa; já não há datalist nem o select «Onde fica»", () => {
    const sec = pagina();
    for (const n of ["Marca", "Categoria", "Subcategoria"]) expect(combo(sec, n)).toHaveAttribute("aria-autocomplete", "list");
    expect(sec.querySelector("datalist")).toBeNull();
    expect(sec.querySelector("select")).toBeNull();
    expect(within(sec).queryByLabelText("Onde fica")).toBeNull();
  });

  it("marca: pesquisa em texto e escolhe; o produto leva a marca", () => {
    const sec = pagina();
    fireEvent.change(combo(sec, "Marca"), { target: { value: "ROC" } });
    expect(opcoes()).toEqual(["Roca", "Nova marca…"]);
    fireEvent.click(screen.getByRole("option", { name: "Roca" }));
    expect(criar("Torneira A").marca).toBe("Roca");
  });

  it("«Nova marca…» leva o que se escreveu, pede confirmação do nome e a marca nova segue com o produto, por nome", () => {
    const sec = pagina();
    fireEvent.change(combo(sec, "Marca"), { target: { value: "Duravit" } });
    fireEvent.click(screen.getByRole("option", { name: "Nova marca…" }));
    const grupo = screen.getByRole("group", { name: "Nova marca" });
    expect(within(grupo).getByLabelText("Nome da nova marca")).toHaveValue("Duravit");
    fireEvent.click(within(grupo).getByRole("button", { name: "Criar" }));
    expect(screen.queryByRole("group", { name: "Nova marca" })).toBeNull();
    expect(combo(sec, "Marca")).toHaveValue("Duravit");
    expect(criar("Sanita A").marca).toBe("Duravit");
  });

  it("a subcategoria está desativada até haver categoria, e só mostra as da categoria escolhida", () => {
    const sec = pagina();
    expect(combo(sec, "Subcategoria")).toBeDisabled();
    expect(within(sec).getByText("Escolha primeiro a categoria.")).toBeInTheDocument();
    escolher(sec, "Categoria", "Casa de banho");
    expect(combo(sec, "Subcategoria")).toBeEnabled();
    fireEvent.click(combo(sec, "Subcategoria"));
    expect(opcoes()).toEqual(["Sem subcategoria", "Louças", "Torneiras", "Nova subcategoria…"]);
    fireEvent.click(screen.getByRole("option", { name: "Torneiras" }));
    expect(criar("Torneira B").no).toBe("s2");
  });

  it("mudar de categoria limpa a subcategoria; sem subcategoria o produto fica na categoria; sem nada, sem classificação", () => {
    const sec = pagina();
    escolher(sec, "Categoria", "Casa de banho");
    escolher(sec, "Subcategoria", "Louças");
    escolher(sec, "Categoria", "Cozinha");
    expect(combo(sec, "Subcategoria")).toHaveValue("");
    expect(criar("Faca").no).toBe("c2");
    cleanup(); reporCatalogo();
    const sec2 = pagina();
    expect(criar("Coisa").no).toBeNull();
    expect(sec2).toBeDefined();
  });

  it("«Sem categoria» limpa categoria e subcategoria", () => {
    const sec = pagina();
    escolher(sec, "Categoria", "Casa de banho");
    escolher(sec, "Subcategoria", "Louças");
    escolher(sec, "Categoria", "Sem categoria");
    expect(combo(sec, "Categoria")).toHaveValue("");
    expect(combo(sec, "Subcategoria")).toBeDisabled();
  });

  it("«Nova categoria…» e «Nova subcategoria…»: nascem só de produto, a subcategoria dentro da categoria, e só quando o produto se cria", () => {
    const sec = pagina();
    fireEvent.change(combo(sec, "Categoria"), { target: { value: "Jardim" } });
    fireEvent.click(screen.getByRole("option", { name: "Nova categoria…" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Nova categoria" })).getByRole("button", { name: "Criar" }));
    expect(combo(sec, "Categoria")).toHaveValue("Jardim");
    expect(combo(sec, "Subcategoria")).toBeEnabled();
    fireEvent.click(combo(sec, "Subcategoria"));
    expect(opcoes()).toEqual(["Sem subcategoria", "Nova subcategoria…"]);
    fireEvent.click(screen.getByRole("option", { name: "Nova subcategoria…" }));
    fireEvent.change(screen.getByLabelText("Nome da nova subcategoria"), { target: { value: "Rega" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Nova subcategoria" })).getByRole("button", { name: "Criar" }));
    expect(combo(sec, "Subcategoria")).toHaveValue("Rega");
    // ainda nada na árvore: só quando o produto se cria
    expect(lerCatalogo().arvore.some((x) => x.n === "Jardim")).toBe(false);
    const p = criar("Mangueira");
    const jardim = lerCatalogo().arvore.find((x) => x.n === "Jardim")!, rega = lerCatalogo().arvore.find((x) => x.n === "Rega")!;
    expect(jardim).toMatchObject({ pai: null, soProduto: true });
    expect(rega).toMatchObject({ pai: jardim.id, soProduto: true });
    expect(p.no).toBe(rega.id);
  });

  it("cancelar a «Nova …» fecha o formulário, devolve o foco ao campo e não muda nada", () => {
    const sec = pagina();
    fireEvent.change(combo(sec, "Marca"), { target: { value: "Duravit" } });
    fireEvent.click(screen.getByRole("option", { name: "Nova marca…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: "Nova marca" })).toBeNull();
    expect(combo(sec, "Marca")).toHaveValue("");
    expect(document.activeElement).toBe(combo(sec, "Marca"));
  });

  it("uma categoria nova com o nome de uma que existe (sem acentos nem maiúsculas) usa a que existe", () => {
    const sec = pagina();
    fireEvent.change(combo(sec, "Categoria"), { target: { value: "COZINHA" } });
    fireEvent.click(screen.getByRole("option", { name: "Nova categoria…" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Nova categoria" })).getByRole("button", { name: "Criar" }));
    criar("Panela");
    expect(lerCatalogo().arvore.filter((x) => x.n.toLowerCase() === "cozinha")).toHaveLength(1);
    expect(lerCatalogo().produtos.find((p) => p.n === "Panela")!.no).toBe("c2");
  });
});

describe("categorias desativadas: não se oferecem, exceto a que o produto já tem", () => {
  const AV: No[] = [
    { id: "c1", n: "Casa de banho", pai: null }, { id: "s1", n: "Louças", pai: "c1", inativa: true }, { id: "s2", n: "Torneiras", pai: "c1" },
    { id: "c2", n: "Cozinha", pai: null, inativa: true }, { id: "s3", n: "Bancadas", pai: "c2" }, { id: "c3", n: "Jardim", pai: null },
  ];
  const ficha = (no: string | null, marca = "Grohe") => {
    render(<FichaProduto p={{ ...PROD, no, marca }} min={28} alvo={35} voltar={vi.fn()} anunciar={vi.fn()} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={real()} arvore={AV} marcas={MARCAS} />);
    return screen.getByRole("region", { name: "Classificação" });
  };
  it("a categoria e a subcategoria desativadas saem da lista", () => {
    const sec = ficha("s2");
    fireEvent.click(combo(sec, "Categoria"));
    expect(opcoes()).toEqual(["Sem categoria", "Casa de banho (escolhida)", "Jardim", "Nova categoria…"]);
    fireEvent.keyDown(combo(sec, "Categoria"), { key: "Escape" });
    fireEvent.click(combo(sec, "Subcategoria"));
    expect(opcoes()).toEqual(["Sem subcategoria", "Torneiras (escolhida)", "Nova subcategoria…"]);
  });
  it("a que o produto já tem aparece «X (desativada)» e não volta a ser escolhível; a Nova subcategoria não se oferece", () => {
    const sec = ficha("s3");
    expect(combo(sec, "Categoria")).toHaveValue("Cozinha (desativada)");
    expect(combo(sec, "Subcategoria")).toHaveValue("Bancadas");
    fireEvent.click(combo(sec, "Categoria"));
    expect(opcoes()).not.toContain("Cozinha");
    fireEvent.keyDown(combo(sec, "Categoria"), { key: "Escape" });
    fireEvent.click(combo(sec, "Subcategoria"));
    expect(opcoes()).toEqual(["Sem subcategoria"]); // as subs de uma categoria desativada não se escolhem de novo
  });
  it("a subcategoria desativada que o produto tem mostra «(desativada)»", () => {
    const sec = ficha("s1");
    expect(combo(sec, "Subcategoria")).toHaveValue("Louças (desativada)");
  });
  it("uma marca que a leitura já não traz (desativada) e é a do produto: «(desativada)», sem «é nova»", () => {
    const sec = ficha("s2", "Antiga");
    expect(combo(sec, "Marca")).toHaveValue("Antiga (desativada)");
    expect(within(sec).queryByText(/É nova/)).toBeNull();
  });
  it("na criação também não se oferecem", () => {
    mudarCatalogo((k) => { k.arvore = structuredClone(AV); k.marcas = [...MARCAS]; });
    const S = seed(), run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    const sec = screen.getByRole("region", { name: "O produto" });
    fireEvent.click(combo(sec, "Categoria"));
    expect(opcoes()).toEqual(["Sem categoria", "Casa de banho", "Jardim", "Nova categoria…"]);
  });
});

describe("«Nova …» com o nome de uma desativada (REACT-M1)", () => {
  const AV: No[] = [
    { id: "c1", n: "Casa de banho", pai: null }, { id: "s1", n: "Louças", pai: "c1", inativa: true }, { id: "c2", n: "Cozinha", pai: null, inativa: true },
  ];
  const ficha = () => {
    render(<FichaProduto p={{ ...PROD, no: "c1" }} min={28} alvo={35} voltar={vi.fn()} anunciar={vi.fn()} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={real()} arvore={AV} marcas={MARCAS} />);
    return screen.getByRole("region", { name: "Classificação" });
  };
  it("categoria: avisa no momento, não fecha nem escolhe em silêncio", () => {
    const sec = ficha();
    fireEvent.change(combo(sec, "Categoria"), { target: { value: "cozinha" } });
    fireEvent.click(screen.getByRole("option", { name: "Nova categoria…" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Nova categoria" })).getByRole("button", { name: "Criar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe e está desativada: reative-a na Gestão.");
    expect(screen.getByRole("group", { name: "Nova categoria" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da nova categoria")).toHaveAttribute("aria-invalid", "true");
    expect(combo(sec, "Categoria")).toHaveValue("Casa de banho");
  });
  it("subcategoria: o mesmo", () => {
    const sec = ficha();
    fireEvent.click(combo(sec, "Subcategoria"));
    fireEvent.click(screen.getByRole("option", { name: "Nova subcategoria…" }));
    fireEvent.change(screen.getByLabelText("Nome da nova subcategoria"), { target: { value: "Loucas" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Nova subcategoria" })).getByRole("button", { name: "Criar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe e está desativada: reative-a na Gestão.");
    expect(combo(sec, "Subcategoria")).toHaveValue("");
  });
  it("cancelar limpa o aviso e o botão «Criar» sem nome diz porquê", () => {
    ficha();
    fireEvent.click(combo(screen.getByRole("region", { name: "Classificação" }), "Categoria"));
    fireEvent.click(screen.getByRole("option", { name: "Nova categoria…" }));
    const criar = within(screen.getByRole("group", { name: "Nova categoria" })).getByRole("button", { name: "Criar" });
    expect(criar).toHaveAttribute("aria-disabled", "true");
    expect(criar).toHaveAccessibleDescription("Escreva o nome.");
  });
});

describe("ficha: gravar com guarda de reentrada, relê em falha e foco (REACT-M3, A11Y-H1)", () => {
  const ficha = () => {
    const anunciar = vi.fn(), r = real();
    render(<FichaProduto p={PROD} min={28} alvo={35} voltar={vi.fn()} anunciar={anunciar} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={r} arvore={ARVORE} marcas={MARCAS} />);
    return { anunciar, r, sec: screen.getByRole("region", { name: "Classificação" }) };
  };
  it("a gravar, o botão fica aria-disabled (não disabled), conserva o foco e um segundo clique não repete", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    const { sec } = ficha();
    escolher(sec, "Marca", "Roca");
    const botao = within(sec).getByRole("button", { name: "Guardar classificação" });
    botao.focus();
    base.respostas.cat_guardar_produto_tabelas = new Promise((res) => { soltar = res; }) as never;
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(botao).toHaveAttribute("aria-disabled", "true"));
    expect(botao).not.toBeDisabled();
    expect(botao).toHaveFocus();
    expect(botao).toHaveAccessibleDescription("A guardar a classificação…");
    await new Promise((r) => setTimeout(r, 20));
    expect(base.chamadas.filter((c) => c.f === "cat_guardar_produto_tabelas")).toHaveLength(1);
    soltar({ data: PID, error: null });
  });
  it("depois de guardar, o foco vai para o estado «Classificação … guardada»", async () => {
    base.respostas.cat_guardar_produto_tabelas = { data: PID, error: null };
    const { sec } = ficha();
    escolher(sec, "Marca", "Roca");
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar classificação" }));
    const estado = await within(sec).findByText("Classificação guardada.");
    await waitFor(() => expect(estado).toHaveFocus());
    expect(estado).toHaveAttribute("role", "status");
  });
});

describe("ficha do produto: classificação", () => {
  const ficha = (o: { p?: Produto; r?: FichaProdutoReal; sem?: boolean } = {}) => {
    const anunciar = vi.fn(), r = o.r ?? real();
    render(<FichaProduto p={o.p ?? PROD} min={28} alvo={35} voltar={vi.fn()} anunciar={anunciar} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={r}
      {...(o.sem ? {} : { arvore: ARVORE, marcas: MARCAS })} />);
    return { anunciar, r, sec: screen.getByRole("region", { name: "Classificação" }) };
  };
  const guardar = () => base.chamadas.filter((c) => c.f === "cat_guardar_produto_tabelas");

  it("mostra a marca, a categoria e a subcategoria atuais, em dropdowns, depois do Preço", () => {
    const { sec } = ficha();
    expect(combo(sec, "Marca")).toHaveValue("Grohe");
    expect(combo(sec, "Categoria")).toHaveValue("Casa de banho");
    expect(combo(sec, "Subcategoria")).toHaveValue("Torneiras");
    const t = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(t.indexOf("Classificação")).toBe(t.indexOf("Preço") + 1);
  });

  it("sem a árvore (a página não a deu) a secção não aparece", () => {
    render(<FichaProduto p={PROD} min={28} alvo={35} voltar={vi.fn()} anunciar={vi.fn()} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={real()} />);
    expect(screen.queryByRole("region", { name: "Classificação" })).toBeNull();
  });

  it("o Guardar só liga com uma mudança; grava pelos nomes (marca, unidade, categoria, subcategoria), anuncia e relê o Catálogo", async () => {
    base.respostas.cat_guardar_produto_tabelas = { data: PID, error: null };
    const { sec, r, anunciar } = ficha();
    const botao = within(sec).getByRole("button", { name: "Guardar classificação" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).toHaveAccessibleDescription("Mude a marca, a categoria ou a subcategoria para guardar.");
    escolher(sec, "Marca", "Roca");
    escolher(sec, "Subcategoria", "Louças");
    expect(botao).not.toHaveAttribute("aria-disabled");
    fireEvent.click(botao);
    await waitFor(() => expect(guardar()).toHaveLength(1));
    expect(guardar()[0].a).toEqual({ p_org: "org-1", p_id: PID, p_marca: "Roca", p_unidade: "un", p_categoria: "Casa de banho", p_subcategoria: "Louças" });
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
    expect(anunciar).toHaveBeenCalledWith(expect.stringContaining("Torneira Teste"));
  });

  it("limpar a marca e a classificação grava nulos", async () => {
    base.respostas.cat_guardar_produto_tabelas = { data: PID, error: null };
    const { sec } = ficha();
    escolher(sec, "Marca", "Sem marca");
    escolher(sec, "Categoria", "Sem categoria");
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar classificação" }));
    await waitFor(() => expect(guardar()).toHaveLength(1));
    expect(guardar()[0].a).toMatchObject({ p_marca: null, p_categoria: null, p_subcategoria: null });
  });

  it("marca, categoria e subcategoria novas gravam-se pelo nome", async () => {
    base.respostas.cat_guardar_produto_tabelas = { data: PID, error: null };
    const { sec } = ficha();
    fireEvent.change(combo(sec, "Marca"), { target: { value: "Duravit" } });
    fireEvent.click(screen.getByRole("option", { name: "Nova marca…" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Nova marca" })).getByRole("button", { name: "Criar" }));
    escolher(sec, "Categoria", "Cozinha");
    fireEvent.click(combo(sec, "Subcategoria"));
    fireEvent.click(screen.getByRole("option", { name: "Nova subcategoria…" }));
    fireEvent.change(screen.getByLabelText("Nome da nova subcategoria"), { target: { value: "Bancadas" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Nova subcategoria" })).getByRole("button", { name: "Criar" }));
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar classificação" }));
    await waitFor(() => expect(guardar()).toHaveLength(1));
    expect(guardar()[0].a).toMatchObject({ p_marca: "Duravit", p_categoria: "Cozinha", p_subcategoria: "Bancadas" });
  });

  it("função por aplicar na base: «Ainda não disponível nesta base» em alerta, sem relê", async () => {
    base.respostas.cat_guardar_produto_tabelas = { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_guardar_produto_tabelas" } };
    const { sec, r } = ficha();
    escolher(sec, "Marca", "Roca");
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar classificação" }));
    expect(await within(sec).findByRole("alert")).toHaveTextContent("Ainda não disponível nesta base");
    await waitFor(() => expect(r.recarregar).toHaveBeenCalledTimes(1)); // relê também em falha, como a gestão: o ecrã não pode ficar a mentir
  });

  it("erro da base com mensagem em português: mostra-a", async () => {
    base.respostas.cat_guardar_produto_tabelas = { data: null, error: { code: "CT001", message: "Sem permissão para editar produtos." } };
    const { sec } = ficha();
    escolher(sec, "Marca", "Roca");
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar classificação" }));
    expect(await within(sec).findByRole("alert")).toHaveTextContent("Sem permissão para editar produtos.");
  });

  it("sem products.edit só se lê: texto, sem dropdowns nem botão", () => {
    const { sec } = ficha({ r: real(false) });
    expect(within(sec).queryByRole("combobox")).toBeNull();
    expect(within(sec).queryByRole("button", { name: "Guardar classificação" })).toBeNull();
    expect(sec).toHaveTextContent("Marca: Grohe");
    expect(sec).toHaveTextContent("Categoria: Casa de banho");
    expect(sec).toHaveTextContent("Subcategoria: Torneiras");
  });

  it("um produto sem classificação mostra os campos vazios e, só leitura, «sem …»", () => {
    const p = { ...PROD, marca: "", no: null };
    const { sec } = ficha({ p });
    expect(combo(sec, "Marca")).toHaveValue("");
    expect(combo(sec, "Subcategoria")).toBeDisabled();
    cleanup();
    const { sec: s2 } = ficha({ p, r: real(false) });
    expect(s2).toHaveTextContent("Marca: sem marca");
    expect(s2).toHaveTextContent("Categoria: sem categoria");
  });
});
