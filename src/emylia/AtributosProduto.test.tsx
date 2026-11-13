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
    const cor = within(sec).getByRole("radiogroup", { name: "Cor" });
    expect(within(cor).getByRole("radio", { name: /^Preto\s+#000000$/ })).toHaveAttribute("aria-checked", "true");
    expect(within(cor).getByRole("radio", { name: /^Branco\s+sem hex$/ })).toHaveAttribute("aria-checked", "false");
    // a medida e o brilho ainda não estão no produto: só se juntam à escolha
    expect(within(sec).queryByRole("radiogroup", { name: "Brilho" })).toBeNull();
    expect(within(sec).getByRole("button", { name: "Guardar atributos" })).toBeDisabled();
  });

  it("juntar um atributo, escolher a opção e guardar: grava direto a lista inteira e relê o Catálogo", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 2 }, error: null };
    const { anunciar, r } = ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.change(within(sec).getByLabelText("Juntar atributo"), { target: { value: A_BRI } });
    fireEvent.click(within(sec).getByRole("radio", { name: "Fosco" }));
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
    fireEvent.click(within(sec).getByRole("radio", { name: /^Branco/ }));
    expect(within(sec).getByRole("radio", { name: /^Preto/ })).toHaveAttribute("aria-checked", "false");
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
    fireEvent.click(screen.getByRole("radio", { name: /^Branco/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar atributos" }));
    const al = await screen.findByRole("alert");
    expect(al).toHaveTextContent("Ainda não disponível nesta base");
    expect(r.recarregar).not.toHaveBeenCalled();
  });

  it("erro da base com mensagem em português: mostra-a", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: null, error: { code: "CT003", message: "A medida precisa de largura e comprimento." } };
    ficha();
    fireEvent.click(screen.getByRole("radio", { name: /^Branco/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar atributos" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A medida precisa de largura e comprimento.");
  });

  it("sem products.edit: só leitura, com o texto e sem controlos de edição", () => {
    ficha({ r: real(false) });
    const sec = screen.getByRole("region", { name: "Atributos" });
    expect(within(sec).getByText(/Cor:\s*Preto/)).toBeInTheDocument();
    expect(within(sec).queryByRole("button", { name: "Guardar atributos" })).toBeNull();
    expect(within(sec).queryByLabelText("Juntar atributo")).toBeNull();
    expect(within(sec).queryByRole("radio")).toBeNull();
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
    fireEvent.click(within(grupo).getByRole("radio", { name: /^Preto/ }));
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
      fireEvent.click(within(grupo).getByRole("button", { name: "Nova opção em Cor" }));
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
      const nova = await within(grupo).findByRole("radio", { name: /^Verde\s+#00FF00$/ });
      expect(nova).toHaveAttribute("aria-checked", "true");
      expect(lerCatalogo().atributos!.find((a) => a.id === A_COR)!.opcoes.map((o) => o.valor)).toContain("Verde");
    });
    it("nome duplicado: a mensagem da base aparece em alerta e a opção não entra", async () => {
      base.respostas.cat_guardar_opcao = { data: null, error: { code: "CT004", message: "Esta opção já existe" } };
      const grupo = abrir();
      fireEvent.change(within(grupo).getByLabelText("Nome da opção"), { target: { value: "Preto" } });
      fireEvent.change(within(grupo).getByLabelText("Cor em hexadecimal (#RRGGBB)"), { target: { value: "#111111" } });
      fireEvent.click(within(grupo).getByRole("button", { name: "Criar opção" }));
      expect(await within(grupo).findByRole("alert")).toHaveTextContent("Esta opção já existe");
      expect(within(grupo).getAllByRole("radio")).toHaveLength(2);
    });
    it("num atributo sem hex (Brilho) só pede o nome, sem campo de cor", () => {
      mudarCatalogo((k) => { k.atributos = structuredClone(DEFS); });
      pagina(real());
      abrirCriarProduto();
      const grupo = screen.getByRole("group", { name: "Atributos do produto" });
      fireEvent.change(within(grupo).getByLabelText("Juntar atributo"), { target: { value: A_BRI } });
      fireEvent.click(within(grupo).getByRole("button", { name: "Nova opção em Brilho" }));
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
      expect(within(grupo).queryByRole("button", { name: /Nova opção/ })).toBeNull();
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
    const cor = within(screen.getByRole("region", { name: "Atributos" })).getByRole("radiogroup", { name: "Cor" });
    expect(within(cor).getByRole("radio", { name: /^Pizarra \(desativada\)/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Guardar atributos" })).toBeDisabled();
  });
  it("HIGH1: ao guardar outra mudança, o valor desativado segue na lista; nunca se descarta em silêncio", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 2 }, error: null };
    ficha({ p: PROD_VELHA });
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.change(within(sec).getByLabelText("Juntar atributo"), { target: { value: A_BRI } });
    fireEvent.click(within(sec).getByRole("radio", { name: "Fosco" }));
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar atributos" }));
    await waitFor(() => expect(gravadas()).toHaveLength(1));
    expect(gravadas()[0].a.p_valores).toEqual([{ atributo: A_COR, opcao: O_VELHA }, { atributo: A_BRI, opcao: O_FOSCO }]);
  });
  it("HIGH1: escolher outra opção troca a desativada", async () => {
    base.respostas.cat_guardar_produto_atributos = { data: { ok: true, n: 1 }, error: null };
    ficha({ p: PROD_VELHA });
    fireEvent.click(screen.getByRole("radio", { name: /^Branco/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar atributos" }));
    await waitFor(() => expect(gravadas()).toHaveLength(1));
    expect(gravadas()[0].a.p_valores).toEqual([{ atributo: A_COR, opcao: O_BRANCO }]);
  });

  it("HIGH2: «Nova opção…» não está dentro do radiogroup", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    const cor = within(sec).getByRole("radiogroup", { name: "Cor" });
    expect(within(cor).queryByRole("button")).toBeNull();
    expect(within(sec).getByRole("button", { name: "Nova opção em Cor" })).toBeInTheDocument();
  });

  it("(a) o onChange só sai das ações de quem escolhe, não quando a lista de atributos muda de identidade", () => {
    const onChange = vi.fn();
    const r = real();
    const { rerender } = render(<AtributosEditor defs={DEFS} inicial={[]} onChange={onChange} real={r} />);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<AtributosEditor defs={structuredClone(DEFS)} inicial={[]} onChange={onChange} real={r} />);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Juntar atributo"), { target: { value: A_COR } });
    fireEvent.click(screen.getByRole("radio", { name: /^Preto/ }));
    expect(onChange).toHaveBeenLastCalledWith([{ atributoId: A_COR, opcaoId: O_PRETO, valor: "Preto" } satisfies AtributoProduto]);
  });

  it("(b) abrir «Nova opção» põe o foco no nome; fechar devolve-o ao botão", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.click(within(sec).getByRole("button", { name: "Nova opção em Cor" }));
    expect(within(sec).getByLabelText("Nome da opção")).toHaveFocus();
    fireEvent.click(within(sec).getByRole("button", { name: "Cancelar" }));
    expect(within(sec).getByRole("button", { name: "Nova opção em Cor" })).toHaveFocus();
  });

  it("(c) hex inválido: aria-invalid e mensagem ligada ao campo", () => {
    ficha();
    const sec = screen.getByRole("region", { name: "Atributos" });
    fireEvent.click(within(sec).getByRole("button", { name: "Nova opção em Cor" }));
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
    fireEvent.click(within(sec).getByRole("radio", { name: "Fosco" }));
    expect(within(sec).queryByText("Escolha uma opção para o atributo contar.")).toBeNull();
  });
});
