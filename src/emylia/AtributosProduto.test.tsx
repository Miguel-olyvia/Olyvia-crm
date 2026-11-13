// 13/11: os atributos do produto no ecrã: a ficha (grava direto por cat_guardar_produto_atributos), a criação (seguem com o produto novo),
// as opções novas (cat_guardar_opcao) e a linha da lista. Sem as funções na base (K.atributos vazio) a secção não aparece.
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

import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { FichaProduto } from "./FichaProduto";
import { reporCustos } from "./v2/custosStore";
import { lerCatalogo, mudarCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { AtributoDef, AtributoProduto, Produto } from "./v2/catalogoModelo";
import { AtributosEditor } from "./AtributosProduto";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const PID = "11111111-2222-4333-8444-555555555555";
const A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_COR = "aaaaaaaa-0000-4000-a000-000000000001", A_BRI = "aaaaaaaa-0000-4000-a000-000000000003";
const O_PRETO = "bbbbbbbb-0000-4000-a000-000000000001", O_BRANCO = "bbbbbbbb-0000-4000-a000-000000000002", O_FOSCO = "bbbbbbbb-0000-4000-a000-000000000003";
const DEFS: AtributoDef[] = [
  { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] },
  { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2,
    opcoes: [{ id: O_PRETO, valor: "Preto", nome: "Preto", hex: "#000000", ordem: 1 }, { id: O_BRANCO, valor: "Branco", nome: "Branco", hex: null, ordem: 2 }] },
  { id: A_BRI, codigo: "brilho", nome: "Brilho", tipo: "lista", temHex: false, ordem: 3, opcoes: [{ id: O_FOSCO, valor: "FOSCO", nome: "Fosco", hex: null, ordem: 1 }] },
];
const PROD: Produto = { id: PID, n: "Mosaico Teste", custo: 60, pvp: 100, un: "un", marca: "Grohe", fornecedor: "", data: "2026-10-01", no: null,
  attrs: [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }] };
const real = (podeEditar = true): FichaProdutoReal => ({ org: "org-1", podeEditar, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) });
const ficha = (o: { p?: Produto; r?: FichaProdutoReal; atributos?: AtributoDef[] | undefined } = {}) => {
  const anunciar = vi.fn(), r = o.r ?? real();
  render(<FichaProduto p={o.p ?? PROD} min={28} alvo={35} voltar={vi.fn()} anunciar={anunciar} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={r}
    atributos={"atributos" in o ? o.atributos : DEFS} />);
  return { anunciar, r };
};
// o valor de um atributo de lista escolhe-se num combobox com pesquisa (não em chips): abre-se com um toque e escolhe-se a opção
const combo = (ctx: HTMLElement, atributo: string) => within(ctx).getByRole("combobox", { name: atributo });
const escolher = (ctx: HTMLElement, atributo: string, opcao: string | RegExp) => {
  fireEvent.click(combo(ctx, atributo));
  fireEvent.click(within(ctx).getByRole("option", { name: opcao }));
};
const gravadas = () => base.chamadas.filter((c) => c.f === "cat_guardar_produto_atributos");

beforeEach(() => { base.chamadas = []; base.respostas = { cat_produto_stock: { data: { gere_stock: true, pode_editar: true, armazens: [] }, error: null } }; });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("ficha do produto: Atributos", () => {
  it("sem atributos definidos (a função da base não existe ou falhou) a secção não aparece, nem erro", () => {
    ficha({ atributos: undefined });
    expect(screen.queryByRole("region", { name: "Atributos" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();
    ficha({ atributos: [] });
    expect(screen.queryByRole("region", { name: "Atributos" })).toBeNull();
  });

  it("fica entre o Preço e os Fornecedores, com a opção escolhida marcada e o nome e o hex escritos", async () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    const ordem = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const i = ordem.indexOf("Atributos");
    expect(ordem[i - 1]).toBe("Preço");
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Fornecedores ligados" })).toBeInTheDocument());
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)[i + 1]).toBe("Fornecedores ligados");
    expect(combo(sec, "Cor")).toHaveValue("Preto");
    fireEvent.click(combo(sec, "Cor"));
    expect(within(sec).getByRole("option", { name: /^Preto\s+#000000(\s+\(escolhida\))?$/ })).toBeInTheDocument();
    expect(within(sec).getByRole("option", { name: /^Branco\s+sem hex$/ })).toBeInTheDocument();
    // a medida e o brilho ainda não estão no produto: só se juntam à escolha
    expect(within(sec).queryByRole("combobox", { name: "Brilho" })).toBeNull();
    expect(within(sec).getByRole("button", { name: "Guardar atributos" })).toBeDisabled();
  });

  it("juntar um atributo, escolher a opção e guardar: grava direto a lista inteira e relê o Catálogo", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 2 }, error: null };
    const { anunciar, r } = ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.change(within(sec).getByLabelText("Juntar atributo"), { target: { value: A_BRI } });
    escolher(sec, "Brilho", "Fosco");
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar atributos" }));
    await waitFor(() => expect(gravadas()).toHaveLength(1));
    expect(gravadas()[0].a).toEqual({ p_org: "org-1", p_produto: PID, p_valores: [{ atributo: A_COR, opcao: O_PRETO }, { atributo: A_BRI, opcao: O_FOSCO }] });
    await waitFor(() => expect(r.recarregar).toHaveBeenCalledTimes(1));
    expect(anunciar).toHaveBeenCalled();
    // não passa pelo cat_guardar_produto (que regravaria o custo)
    expect(base.chamadas.some((c) => c.f === "cat_guardar_produto")).toBe(false);
  });

  it("uma só opção por atributo: escolher outra troca a anterior", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 1 }, error: null };
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    escolher(sec, "Cor", /^Branco/);
    expect(combo(sec, "Cor")).toHaveValue("Branco");
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar atributos" }));
    await waitFor(() => expect(gravadas()).toHaveLength(1));
    expect(gravadas()[0].a.p_valores).toEqual([{ atributo: A_COR, opcao: O_BRANCO }]);
  });

  it("cada atributo uma só vez: o que já está no produto não volta a aparecer em «Juntar atributo»", () => {
    ficha();
    const sel = screen.getByLabelText("Juntar atributo");
    expect(within(sel).getAllByRole("option").map((o) => o.textContent)).toEqual(["Juntar atributo…", "Medida", "Brilho"]);
  });

  it("retirar o último atributo e guardar grava a lista vazia (substitui o conjunto)", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 0 }, error: null };
    ficha();
    fireEvent.click(screen.getByRole("button", { name: "Retirar o atributo Cor" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar atributos" }));
    await waitFor(() => expect(gravadas()).toHaveLength(1));
    expect(gravadas()[0].a.p_valores).toEqual([]);
  });

  it("a medida: escolher 3D, largura, comprimento, espessura e a unidade; só grava completa", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 2 }, error: null };
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.change(within(sec).getByLabelText("Juntar atributo"), { target: { value: A_MED } });
    const guardar = within(sec).getByRole("button", { name: "Guardar atributos" });
    expect(guardar).toBeDisabled();
    fireEvent.click(within(within(sec).getByRole("radiogroup", { name: "Tipo de medida" })).getByRole("radio", { name: "3D" }));
    fireEvent.change(within(sec).getByLabelText("Largura"), { target: { value: "60" } });
    fireEvent.change(within(sec).getByLabelText("Comprimento"), { target: { value: "30,5" } });
    // 3D sem espessura ainda não está completa
    expect(guardar).toBeDisabled();
    fireEvent.change(within(sec).getByLabelText("Espessura"), { target: { value: "0,8" } });
    fireEvent.click(within(within(sec).getByRole("radiogroup", { name: "Unidade da medida" })).getByRole("radio", { name: "mm" }));
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(gravadas()).toHaveLength(1));
    expect(gravadas()[0].a.p_valores).toEqual([
      { atributo: A_COR, opcao: O_PRETO }, { atributo: A_MED, medida: { tipo: "3D", largura: 60, comprimento: 30.5, espessura: 0.8, unidade: "mm" } },
    ]);
  });

  it("a medida em 2D não pede espessura", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.change(within(sec).getByLabelText("Juntar atributo"), { target: { value: A_MED } });
    expect(within(sec).queryByLabelText("Espessura")).toBeNull();
    expect(within(within(sec).getByRole("radiogroup", { name: "Tipo de medida" })).getByRole("radio", { name: "2D" })).toHaveAttribute("aria-checked", "true");
  });

  it("função da base por aplicar: diz «Ainda não disponível» em alerta e não relê", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_guardar_produto_atributos" } };
    const { r } = ficha();
    escolher(screen.getByRole("region", { name: "Atributos" }), "Cor", /^Branco/);
    fireEvent.click(screen.getByRole("button", { name: "Guardar atributos" }));
    const al = await screen.findByRole("alert");
    expect(al).toHaveTextContent("Ainda não disponível nesta base");
    expect(r.recarregar).not.toHaveBeenCalled();
  });

  it("erro da base com mensagem em português: mostra-a", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: null, error: { code: "CT003", message: "A medida precisa de largura e comprimento." } };
    ficha();
    escolher(screen.getByRole("region", { name: "Atributos" }), "Cor", /^Branco/);
    fireEvent.click(screen.getByRole("button", { name: "Guardar atributos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A medida precisa de largura e comprimento.");
  });

  it("sem products.edit: só leitura, com o texto e sem controlos de edição", () => {
    ficha({ r: real(false) });
    const sec = screen.getByRole("region", { name: "Atributos" });
    expect(within(sec).getByText(/Cor:\s*Preto/)).toBeInTheDocument();
    expect(within(sec).queryByRole("button", { name: "Guardar atributos" })).toBeNull();
    expect(within(sec).queryByLabelText("Juntar atributo")).toBeNull();
    expect(within(sec).queryByRole("combobox")).toBeNull();
  });

  it("produto sem atributos, com a lista definida: mostra a secção para juntar", () => {
    ficha({ p: { ...PROD, attrs: undefined } });
    const sec = screen.getByRole("region", { name: "Atributos" });
    expect(within(sec).getByText("Este produto ainda não tem atributos.")).toBeInTheDocument();
    expect(within(sec).getByLabelText("Juntar atributo")).toBeInTheDocument();
  });
});

describe("criar produto: Atributos", () => {
  const pagina = (r?: FichaProdutoReal, S: Estado = seed()) => {
    const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={r} />);
  };
  const abrirCriarProduto = () => {
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
  };
  const escrever = (rot: string | RegExp, v: string) => fireEvent.change(screen.getByLabelText(rot), { target: { value: v } });

  it("sem atributos definidos o formulário fica exatamente como estava", () => {
    pagina();
    abrirCriarProduto();
    expect(screen.queryByRole("group", { name: "Atributos do produto" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["1O produto", "2Compra e venda", "3O serviço que traz"]);
  });

  it("com atributos: fica no fim da secção 1 (sem renumerar) e os escolhidos seguem com o produto novo", () => {
    mudarCatalogo((k) => { k.atributos = structuredClone(DEFS); });
    pagina();
    abrirCriarProduto();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["1O produto", "2Compra e venda", "3O serviço que traz"]);
    const sec1 = screen.getByRole("region", { name: "O produto" });
    const grupo = within(sec1).getByRole("group", { name: "Atributos do produto" });
    fireEvent.change(within(grupo).getByLabelText("Juntar atributo"), { target: { value: A_COR } });
    escolher(grupo, "Cor", /^Preto/);
    escrever("Nome do produto", "Mosaico novo");
    escrever("Custo de compra", "12");
    fireEvent.click(within(screen.getByRole("complementary", { name: "Pré-visualização" })).getByRole("button", { name: "Criar o produto" }));
    const criado = lerCatalogo().produtos.find((p) => p.n === "Mosaico novo")!;
    expect(criado.attrs).toEqual([{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" }]);
  });

  it("um produto criado sem atributos não leva o campo attrs", () => {
    mudarCatalogo((k) => { k.atributos = structuredClone(DEFS); });
    pagina();
    abrirCriarProduto();
    escrever("Nome do produto", "Mosaico simples");
    escrever("Custo de compra", "12");
    fireEvent.click(within(screen.getByRole("complementary", { name: "Pré-visualização" })).getByRole("button", { name: "Criar o produto" }));
    expect(lerCatalogo().produtos.find((p) => p.n === "Mosaico simples")).not.toHaveProperty("attrs");
  });

  describe("Nova opção…", () => {
    const abrir = () => {
      mudarCatalogo((k) => { k.atributos = structuredClone(DEFS); });
      pagina(real());
      abrirCriarProduto();
      const grupo = screen.getByRole("group", { name: "Atributos do produto" });
      fireEvent.change(within(grupo).getByLabelText("Juntar atributo"), { target: { value: A_COR } });
      fireEvent.click(combo(grupo, "Cor"));
      fireEvent.click(within(grupo).getByRole("option", { name: "Nova opção…" }));
      return grupo;
    };
    it("na Cor o hex é obrigatório: com amostra em direto e o botão só liga com #RRGGBB válido", async () => {
      base.respostas.cat_guardar_opcao = { data: { opcao: { id: "bbbbbbbb-0000-4000-a000-0000000000ff", valor: "Verde", nome: "Verde", hex: "#00FF00", ordem: 3 } }, error: null };
      const grupo = abrir();
      const criar = within(grupo).getByRole("button", { name: "Criar opção" });
      fireEvent.change(within(grupo).getByLabelText("Nome da opção"), { target: { value: "Verde" } });
      expect(criar).toBeDisabled();
      fireEvent.change(within(grupo).getByLabelText("Cor em hexadecimal (#RRGGBB)"), { target: { value: "#00GG00" } });
      expect(criar).toBeDisabled();
      expect(within(grupo).getByTestId("amostra-nova")).toHaveAttribute("data-hex", "");
      fireEvent.change(within(grupo).getByLabelText("Cor em hexadecimal (#RRGGBB)"), { target: { value: "#00ff00" } });
      expect(within(grupo).getByTestId("amostra-nova")).toHaveAttribute("data-hex", "#00FF00");
      expect(criar).toBeEnabled();
      fireEvent.click(criar);
      await waitFor(() => expect(base.chamadas.filter((c) => c.f === "cat_guardar_opcao")).toHaveLength(1));
      expect(base.chamadas.find((c) => c.f === "cat_guardar_opcao")!.a).toEqual({ p_org: "org-1", p_atributo: A_COR, p_valor: "Verde", p_hex: "#00FF00" });
      // a opção nova aparece, já escolhida, com o nome e o hex escritos; e fica no Catálogo em memória
      await waitFor(() => expect(combo(grupo, "Cor")).toHaveValue("Verde"));
      fireEvent.click(combo(grupo, "Cor"));
      expect(within(grupo).getByRole("option", { name: /^Verde\s+#00FF00(\s+\(escolhida\))?$/ })).toBeInTheDocument();
      expect(lerCatalogo().atributos!.find((a) => a.id === A_COR)!.opcoes.map((o) => o.valor)).toContain("Verde");
    });
    it("nome duplicado: a mensagem da base aparece em alerta e a opção não entra", async () => {
      base.respostas.cat_guardar_opcao = { data: null, error: { code: "CT004", message: "Esta opção já existe" } };
      const grupo = abrir();
      fireEvent.change(within(grupo).getByLabelText("Nome da opção"), { target: { value: "Preto" } });
      fireEvent.change(within(grupo).getByLabelText("Cor em hexadecimal (#RRGGBB)"), { target: { value: "#111111" } });
      fireEvent.click(within(grupo).getByRole("button", { name: "Criar opção" }));
      expect(await within(grupo).findByRole("alert")).toHaveTextContent("Esta opção já existe");
      expect(combo(grupo, "Cor")).toHaveValue("");
    });
    it("num atributo sem hex (Brilho) só pede o nome, sem campo de cor", () => {
      mudarCatalogo((k) => { k.atributos = structuredClone(DEFS); });
      pagina(real());
      abrirCriarProduto();
      const grupo = screen.getByRole("group", { name: "Atributos do produto" });
      fireEvent.change(within(grupo).getByLabelText("Juntar atributo"), { target: { value: A_BRI } });
      fireEvent.click(combo(grupo, "Brilho"));
      fireEvent.click(within(grupo).getByRole("option", { name: "Nova opção…" }));
      expect(within(grupo).queryByLabelText("Cor em hexadecimal (#RRGGBB)")).toBeNull();
      fireEvent.change(within(grupo).getByLabelText("Nome da opção"), { target: { value: "Acetinado" } });
      expect(within(grupo).getByRole("button", { name: "Criar opção" })).toBeEnabled();
    });
    it("sem a página real (protótipo) não há «Nova opção»", () => {
      mudarCatalogo((k) => { k.atributos = structuredClone(DEFS); });
      pagina();
      abrirCriarProduto();
      const grupo = screen.getByRole("group", { name: "Atributos do produto" });
      fireEvent.change(within(grupo).getByLabelText("Juntar atributo"), { target: { value: A_COR } });
      fireEvent.click(combo(grupo, "Cor"));
      expect(within(grupo).queryByRole("option", { name: /Nova opção/ })).toBeNull();
    });
  });
});

describe("lista de produtos: atributos", () => {
  it("a linha secundária e a pesquisa trazem os atributos em texto", () => {
    mudarCatalogo((k) => {
      k.atributos = structuredClone(DEFS);
      k.produtos.unshift({ ...PROD, attrs: [{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" },
        { atributoId: A_MED, valor: "60×60 cm", medida: { tipo: "2D", largura: 60, comprimento: 60, espessura: null, unidade: "cm" } }] });
    });
    const S = seed(), run = (fn: () => void) => fn();
    const { rerender } = render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Produtos" }));
    const linha = within(screen.getByRole("tabpanel")).getAllByRole("listitem").find((li) => li.textContent?.includes("Mosaico Teste"))!;
    expect(linha).toHaveTextContent("Medida: 60×60 cm · Cor: Preto");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar produto" }), { target: { value: "preto" } });
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem").some((li) => li.textContent?.includes("Mosaico Teste"))).toBe(true);
    rerender(<span />);
  });
});

describe("revisão: opção desativada, radiogroup, foco e avisos", () => {
  const O_VELHA = "bbbbbbbb-0000-4000-a000-0000000000aa";
  const PROD_VELHA: Produto = { ...PROD, attrs: [{ atributoId: A_COR, opcaoId: O_VELHA, valor: "Pizarra", inativa: true }] };

  it("HIGH1: uma opção desativada (que a lista já não traz) continua escolhida, com «(desativada)», e abrir a ficha não ativa o Guardar", () => {
    ficha({ p: PROD_VELHA });
    const sec = screen.getByRole("region", { name: "Atributos" });
    expect(combo(sec, "Cor")).toHaveValue("Pizarra (desativada)");
    // não é escolhível de novo: não está na lista
    fireEvent.click(combo(sec, "Cor"));
    expect(within(sec).queryByRole("option", { name: /Pizarra/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar atributos" })).toBeDisabled();
  });
  it("HIGH1: ao guardar outra mudança, o valor desativado segue na lista; nunca se descarta em silêncio", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 2 }, error: null };
    ficha({ p: PROD_VELHA });
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.change(within(sec).getByLabelText("Juntar atributo"), { target: { value: A_BRI } });
    escolher(sec, "Brilho", "Fosco");
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar atributos" }));
    await waitFor(() => expect(gravadas()).toHaveLength(1));
    expect(gravadas()[0].a.p_valores).toEqual([{ atributo: A_COR, opcao: O_VELHA }, { atributo: A_BRI, opcao: O_FOSCO }]);
  });
  it("HIGH1: escolher outra opção troca a desativada", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 1 }, error: null };
    ficha({ p: PROD_VELHA });
    escolher(screen.getByRole("region", { name: "Atributos" }), "Cor", /^Branco/);
    fireEvent.click(screen.getByRole("button", { name: "Guardar atributos" }));
    await waitFor(() => expect(gravadas()).toHaveLength(1));
    expect(gravadas()[0].a.p_valores).toEqual([{ atributo: A_COR, opcao: O_BRANCO }]);
  });

  it("o valor de lista não usa rádios nem chips: é um combobox, e «Nova opção…» é o último item da lista", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    expect(within(sec).queryByRole("radiogroup", { name: "Cor" })).toBeNull();
    fireEvent.click(combo(sec, "Cor"));
    const itens = within(within(sec).getByRole("listbox", { name: "Cor" })).getAllByRole("option");
    expect(itens[itens.length - 1]).toHaveTextContent("Nova opção…");
  });

  it("(a) o onChange só sai das ações de quem escolhe, não quando a lista de atributos muda de identidade", () => {
    const onChange = vi.fn();
    const r = real();
    const { rerender } = render(<AtributosEditor defs={DEFS} inicial={[]} onChange={onChange} real={r} />);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<AtributosEditor defs={structuredClone(DEFS)} inicial={[]} onChange={onChange} real={r} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Juntar atributo"), { target: { value: A_COR } });
    fireEvent.click(screen.getByRole("combobox", { name: "Cor" }));
    fireEvent.click(screen.getByRole("option", { name: /^Preto/ }));
    expect(onChange).toHaveBeenLastCalledWith([{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" } satisfies AtributoProduto]);
  });

  it("(b) abrir «Nova opção» põe o foco no nome; fechar devolve-o ao botão", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.click(combo(sec, "Cor"));
    fireEvent.click(within(sec).getByRole("option", { name: "Nova opção…" }));
    expect(within(sec).getByLabelText("Nome da opção")).toHaveFocus();
    fireEvent.click(within(sec).getByRole("button", { name: "Cancelar" }));
    expect(combo(sec, "Cor")).toHaveFocus();
  });

  it("(c) hex inválido: aria-invalid e mensagem ligada ao campo", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.click(combo(sec, "Cor"));
    fireEvent.click(within(sec).getByRole("option", { name: "Nova opção…" }));
    const hex = within(sec).getByLabelText("Cor em hexadecimal (#RRGGBB)");
    expect(hex).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.change(hex, { target: { value: "#12" } });
    expect(hex).toHaveAttribute("aria-invalid", "true");
    const msg = document.getElementById(hex.getAttribute("aria-describedby")!.split(" ").pop()!);
    expect(msg).toHaveTextContent("#RRGGBB");
    fireEvent.change(hex, { target: { value: "#123456" } });
    expect(hex).not.toHaveAttribute("aria-invalid", "true");
  });

  it("(d) atributo juntado sem opção avisa que ainda não conta", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    expect(within(sec).queryByText("Escolha uma opção para o atributo contar.")).toBeNull();
    fireEvent.change(within(sec).getByLabelText("Juntar atributo"), { target: { value: A_BRI } });
    expect(within(sec).getByText("Escolha uma opção para o atributo contar.")).toBeInTheDocument();
    escolher(sec, "Brilho", "Fosco");
    expect(within(sec).queryByText("Escolha uma opção para o atributo contar.")).toBeNull();
  });
});

describe("combobox do valor (padrão ARIA 1.2)", () => {
  const O = (id: string, valor: string, nome: string, hex: string | null, ordem: number) => ({ id, valor, nome, hex, ordem });
  const COR: AtributoDef = { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 1, opcoes: [
    O("o1", "Preto", "Preto", "#000000", 1), O("o2", "Pérola", "Pérola", "#EEE8DC", 2), O("o3", "Cinzento Escuro", "Cinzento Escuro", null, 3), O("o4", "Branco", "Branco", "#FFFFFF", 4),
  ] };
  const montar = (o: { inicial?: AtributoProduto[]; r?: FichaProdutoReal | undefined; onChange?: (a: AtributoProduto[]) => void } = {}) => {
    const onChange = o.onChange ?? vi.fn();
    render(<AtributosEditor defs={[COR]} inicial={o.inicial ?? [{ atributoId: A_COR }]} onChange={onChange} real={"r" in o ? o.r : real()} />);
    return { onChange, cb: screen.getByRole("combobox", { name: "Cor" }) };
  };
  const nomes = () => screen.queryAllByRole("option").map((x) => x.textContent);

  it("papéis e estados: aria-expanded, aria-controls para a listbox e aria-activedescendant na opção ativa", () => {
    const { cb } = montar();
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).not.toHaveAttribute("aria-controls");
    fireEvent.click(cb);
    expect(cb).toHaveAttribute("aria-expanded", "true");
    const lista = screen.getByRole("listbox", { name: "Cor" });
    expect(cb).toHaveAttribute("aria-controls", lista.id);
    const ativo = document.getElementById(cb.getAttribute("aria-activedescendant")!)!;
    expect(ativo).toHaveAttribute("role", "option");
    expect(ativo).toHaveTextContent("Preto");
  });

  it("setas, Home, End, Enter e Esc", () => {
    const { cb, onChange } = montar();
    fireEvent.keyDown(cb, { key: "ArrowDown" }); // fechado: abre
    expect(cb).toHaveAttribute("aria-expanded", "true");
    const ativo = () => document.getElementById(cb.getAttribute("aria-activedescendant")!)?.textContent;
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    expect(ativo()).toMatch(/^Pérola/);
    fireEvent.keyDown(cb, { key: "End" });
    expect(ativo()).toMatch(/^Nova opção/);
    fireEvent.keyDown(cb, { key: "Home" });
    expect(ativo()).toMatch(/^Preto/);
    fireEvent.keyDown(cb, { key: "ArrowUp" });
    expect(ativo()).toMatch(/^Preto/);
    fireEvent.keyDown(cb, { key: "Escape" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    fireEvent.keyDown(cb, { key: "ArrowDown" });
    fireEvent.keyDown(cb, { key: "Enter" });
    expect(cb).toHaveAttribute("aria-expanded", "false");
    expect(cb).toHaveValue("Pérola");
    expect(onChange).toHaveBeenLastCalledWith([{ atributoId: A_COR, opcaoId: "o2", valor: "Pérola" }]);
  });

  it("pesquisa em texto, sem acentos nem maiúsculas, também pelo hex", () => {
    const { cb } = montar();
    fireEvent.change(cb, { target: { value: "PEROLA" } });
    expect(cb).toHaveAttribute("aria-expanded", "true");
    expect(nomes()).toEqual([expect.stringMatching(/^Pérola/), "Nova opção…"]);
    fireEvent.change(cb, { target: { value: "cinzento esc" } });
    expect(nomes()[0]).toMatch(/^Cinzento Escuro/);
    fireEvent.change(cb, { target: { value: "#fff" } });
    expect(nomes()[0]).toMatch(/^Branco/);
  });

  it("cada opção mostra a amostra, o nome e o hex escritos (sem hex: amostra neutra e «sem hex»)", () => {
    const { cb } = montar();
    fireEvent.click(cb);
    const preto = screen.getByRole("option", { name: /^Preto/ });
    expect(preto).toHaveTextContent("#000000");
    expect(preto.querySelector("[data-hex='#000000']")).not.toBeNull();
    const cinza = screen.getByRole("option", { name: /^Cinzento Escuro/ });
    expect(cinza).toHaveTextContent("sem hex");
    expect(cinza.querySelector("[data-hex='']")).not.toBeNull();
  });

  it("sem resultados: «Nenhuma opção encontrada» e o atalho «Nova opção…», que leva o que se escreveu para o nome", () => {
    montar();
    fireEvent.change(screen.getByRole("combobox", { name: "Cor" }), { target: { value: "turquesa" } });
    expect(screen.getAllByText("Nenhuma opção encontrada").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("option", { name: "Nova opção…" }));
    expect(screen.getByLabelText("Nome da opção")).toHaveValue("turquesa");
  });

  it("sem permissão para criar não há «Nova opção…»; sem resultados fica só a mensagem", () => {
    const { cb } = montar({ r: undefined });
    fireEvent.change(cb, { target: { value: "turquesa" } });
    expect(screen.getAllByText("Nenhuma opção encontrada").length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    // Enter com a lista aberta e sem itens não deixa o gesto seguir (não submete nada)
    expect(fireEvent.keyDown(cb, { key: "Enter" })).toBe(false);
  });

  it("sair do campo sem escolher volta ao valor e fecha a lista", () => {
    const { cb } = montar({ inicial: [{ atributoId: A_COR, opcaoId: "o4", valor: "Branco" }] });
    expect(cb).toHaveValue("Branco");
    fireEvent.change(cb, { target: { value: "xx" } });
    fireEvent.blur(cb);
    expect(cb).toHaveValue("Branco");
    expect(cb).toHaveAttribute("aria-expanded", "false");
  });

  it("a opção escolhida mostra a amostra ao lado do nome no próprio campo", () => {
    montar({ inicial: [{ atributoId: A_COR, opcaoId: "o1", valor: "Preto" }] });
    expect(document.querySelector("[data-hex='#000000']")).not.toBeNull();
  });

  describe("revisão do combobox", () => {
    const COM_VALOR = [{ atributoId: A_COR, opcaoId: "o4", valor: "Branco" }];

    it("M1: com um valor escolhido, abrir seleciona o texto (escrever substitui, não acrescenta)", () => {
      const { cb } = montar({ inicial: COM_VALOR });
      const campo = cb as HTMLInputElement;
      fireEvent.click(campo);
      expect(campo.selectionStart).toBe(0);
      expect(campo.selectionEnd).toBe("Branco".length);
    });
    it("M1: também ao focar e ao abrir pela seta", () => {
      const { cb } = montar({ inicial: COM_VALOR });
      const campo = cb as HTMLInputElement;
      campo.setSelectionRange(2, 2);
      fireEvent.focus(campo);
      expect([campo.selectionStart, campo.selectionEnd]).toEqual([0, 6]);
      campo.setSelectionRange(3, 3);
      fireEvent.keyDown(campo, { key: "ArrowDown" });
      expect([campo.selectionStart, campo.selectionEnd]).toEqual([0, 6]);
    });

    it("M2: o scroll da opção ativa só acontece com o teclado, não ao abrir com o rato nem ao passar o rato", () => {
      const scroll = vi.fn();
      const antes = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scroll;
      try {
        const { cb } = montar();
        fireEvent.click(cb);
        scroll.mockClear();
        fireEvent.mouseEnter(screen.getByRole("option", { name: /^Pérola/ }));
        expect(scroll).not.toHaveBeenCalled();
        fireEvent.keyDown(cb, { key: "ArrowDown" });
        expect(scroll).toHaveBeenCalledTimes(1);
      } finally { Element.prototype.scrollIntoView = antes; }
    });

    it("M3: o rato carregado na lista (barra de scroll, mensagem vazia) não tira o foco ao campo", () => {
      const { cb } = montar();
      fireEvent.click(cb);
      expect(fireEvent.mouseDown(screen.getByRole("listbox", { name: "Cor" }))).toBe(false);
      fireEvent.change(cb, { target: { value: "turquesa" } });
      expect(fireEvent.mouseDown(within(screen.getByRole("listbox", { name: "Cor" })).getByText("Nenhuma opção encontrada"))).toBe(false);
    });

    it("M4: a região de estado está sempre montada; só muda o texto, e com 0 resultados diz «Nenhuma opção encontrada»", () => {
      const { cb } = montar();
      const estado = screen.getByRole("status");
      expect(estado).toHaveTextContent("");
      fireEvent.click(cb);
      expect(screen.getByRole("status")).toBe(estado);
      expect(estado).toHaveTextContent("4 opções");
      fireEvent.change(cb, { target: { value: "turquesa" } });
      expect(screen.getByRole("status")).toBe(estado);
      expect(estado).toHaveTextContent("Nenhuma opção encontrada");
    });

    it("M5: a opção escolhida leva o texto oculto «(escolhida)» e é a ativa ao abrir", () => {
      const { cb } = montar({ inicial: COM_VALOR });
      fireEvent.click(cb);
      expect(screen.getByRole("option", { name: /^Branco.*\(escolhida\)$/ })).toBeInTheDocument();
      const ativo = document.getElementById(cb.getAttribute("aria-activedescendant")!)!;
      expect(ativo).toHaveTextContent("Branco");
    });

    it("M6: Home e End só são do combobox com a lista aberta e sem texto de pesquisa (ou com Ctrl); senão movem o cursor", () => {
      const { cb } = montar();
      expect(fireEvent.keyDown(cb, { key: "End" })).toBe(true); // fechada
      fireEvent.click(cb);
      expect(fireEvent.keyDown(cb, { key: "End" })).toBe(false); // aberta, sem texto
      fireEvent.change(cb, { target: { value: "pé" } });
      expect(fireEvent.keyDown(cb, { key: "End" })).toBe(true); // a escrever: move o cursor
      expect(fireEvent.keyDown(cb, { key: "Home" })).toBe(true);
      expect(fireEvent.keyDown(cb, { key: "End", ctrlKey: true })).toBe(false);
    });

    it("LOW: clicar no campo com a lista aberta fecha-a", () => {
      const { cb } = montar();
      fireEvent.click(cb);
      expect(cb).toHaveAttribute("aria-expanded", "true");
      fireEvent.click(cb);
      expect(cb).toHaveAttribute("aria-expanded", "false");
    });
  });
});
