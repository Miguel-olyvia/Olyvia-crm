// 16/11: o campo Fornecedor ao criar um produto ou consumível: pesquisa dos fornecedores reais, «Sem fornecedor», «Novo fornecedor…» só com
// permissão (pode_criar), fornecedor novo pendente (não se escreve nada na base até gravar o produto) e coincidência de nome.
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
import { reporCustos } from "./v2/custosStore";
import { lerCatalogo, reporCatalogo } from "./v2/catalogoStore";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const F1 = "f0000000-0000-4000-a000-000000000001", F2 = "f0000000-0000-4000-a000-000000000002", F3 = "f0000000-0000-4000-a000-000000000003";
const real: FichaProdutoReal = { org: ORG, podeEditar: true, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) };
const LISTA = (podeCriar: boolean) => ({ data: { pode_criar: podeCriar, fornecedores: [
  { id: F2, nome: "Sanitop", nif: "500100200", email: "geral@sanitop.pt", ativo: true },
  { id: F1, nome: "Ânodo Lda", nif: null, email: null, ativo: true },
  { id: F3, nome: "Antigo Desativado", nif: null, email: null, ativo: false },
] }, error: null });

beforeEach(() => { base.chamadas = []; base.respostas = { cat_ler_fornecedores: LISTA(true) }; });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

function abrir(tab: "Produtos" | "Consumíveis", r: FichaProdutoReal | null = real) {
  const S = seed(), run = (fn: () => void) => fn();
  render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={r ?? undefined} />);
  fireEvent.click(screen.getByRole("tab", { name: tab }));
  fireEvent.click(screen.getByRole("button", { name: "Criar" }));
}
const campo = () => screen.getByRole("combobox", { name: "Fornecedor" }) as HTMLInputElement;
const pronto = async () => { await waitFor(() => expect(campo()).not.toBeDisabled()); };
const opcoes = () => screen.getAllByRole("option").map((o) => o.textContent?.replace(/\s*\(escolhida\)$/, ""));
const escolher = async (nome: string) => { await pronto(); fireEvent.click(campo()); fireEvent.click(screen.getByRole("option", { name: nome })); };
const preencherProduto = () => {
  fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Base de duche" } });
  fireEvent.change(screen.getByLabelText("Custo de compra"), { target: { value: "100" } });
};
const preencherConsumivel = () => {
  fireEvent.change(screen.getByLabelText("Nome do consumível"), { target: { value: "Silicone branco" } });
  fireEvent.change(screen.getByLabelText("Preço"), { target: { value: "4" } });
};
/** As funções cat_* chamadas: só a leitura dos fornecedores, nenhuma escrita. */
const escritas = () => base.chamadas.map((c) => c.f).filter((f) => f.startsWith("cat_"));
const novoFornecedor = async () => { await pronto(); fireEvent.click(campo()); fireEvent.click(screen.getByRole("option", { name: "Novo fornecedor…" })); return screen.getByRole("group", { name: "Novo fornecedor" }); };

describe("produto: campo Fornecedor real", () => {
  it("lê os fornecedores da organização uma vez e mostra «Sem fornecedor» primeiro, os ativos por ordem, e «Novo fornecedor…» no fim", async () => {
    abrir("Produtos");
    await pronto();
    fireEvent.click(campo());
    expect(opcoes()).toEqual(["Sem fornecedor", "Ânodo Lda", "Sanitop", "Novo fornecedor…"]);
    expect(base.chamadas.filter((c) => c.f === "cat_ler_fornecedores")).toEqual([{ f: "cat_ler_fornecedores", a: { p_org: ORG } }]);
  });
  it("pesquisa sem acentos nem maiúsculas", async () => {
    abrir("Produtos");
    await pronto();
    fireEvent.change(campo(), { target: { value: "anodo" } });
    expect(opcoes()).toEqual(["Ânodo Lda", "Novo fornecedor…"]);
  });
  it("escolher um fornecedor: o produto novo leva o id e o nome; nada se liga à base ainda", async () => {
    abrir("Produtos");
    await escolher("Sanitop");
    expect(campo().value).toBe("Sanitop");
    preencherProduto();
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(lerCatalogo().produtos.find((p) => p.n === "Base de duche")).toMatchObject({ fornecedor: "Sanitop", fornecedorId: F2 });
    expect(base.chamadas.map((c) => c.f)).not.toContain("cat_ligar_fornecedor_produto");
  });
  it("«Sem fornecedor» tira a escolha", async () => {
    abrir("Produtos");
    await escolher("Sanitop");
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("option", { name: "Sem fornecedor" }));
    expect(campo().value).toBe("");
    preencherProduto();
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    const p = lerCatalogo().produtos.find((x) => x.n === "Base de duche")!;
    expect(p.fornecedorId).toBeUndefined();
    expect(p.fornecedorNovo).toBeUndefined();
  });
});

describe("produto: fornecedor novo", () => {
  it("sem nome o botão fica aria-disabled com a razão, e não é «disabled» (o foco não se perde)", async () => {
    abrir("Produtos");
    const g = await novoFornecedor();
    const b = within(g).getByRole("button", { name: "Usar este fornecedor" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(b).not.toBeDisabled();
    expect(b).toHaveAccessibleDescription("Escreva o nome do fornecedor.");
    fireEvent.click(b);
    expect(screen.getByRole("group", { name: "Novo fornecedor" })).toBeInTheDocument();
  });
  it("o nome escrito na pesquisa vem para o formulário", async () => {
    abrir("Produtos");
    await pronto();
    fireEvent.change(campo(), { target: { value: "Cerâmicas do Norte" } });
    fireEvent.click(screen.getByRole("option", { name: "Novo fornecedor…" }));
    expect(screen.getByLabelText("Nome do novo fornecedor")).toHaveValue("Cerâmicas do Norte");
  });
  it("NIF ou email inválidos: erro a vermelho (legível nos dois temas), nada fica escolhido", async () => {
    abrir("Produtos");
    const g = await novoFornecedor();
    fireEvent.change(within(g).getByLabelText("Nome do novo fornecedor"), { target: { value: "Novo Lda" } });
    fireEvent.change(within(g).getByLabelText("NIF (opcional)"), { target: { value: "12" } });
    fireEvent.click(within(g).getByRole("button", { name: "Usar este fornecedor" }));
    const e = within(g).getByRole("alert");
    expect(e).toHaveTextContent(/NIF/);
    expect(e.className).toContain("text-red-700");
    expect(e.className).toContain("dark:text-red-400");
    fireEvent.change(within(g).getByLabelText("NIF (opcional)"), { target: { value: "" } });
    fireEvent.change(within(g).getByLabelText("Email (opcional)"), { target: { value: "sem-arroba" } });
    fireEvent.click(within(g).getByRole("button", { name: "Usar este fornecedor" }));
    expect(within(g).getByRole("alert")).toHaveTextContent(/email/i);
    expect(campo().value).toBe("");
  });
  it("ficar pendente: mostra «É novo», devolve o foco ao campo, e só ao criar o produto o modelo leva o pendente; a base não é tocada", async () => {
    abrir("Produtos");
    const g = await novoFornecedor();
    fireEvent.change(within(g).getByLabelText("Nome do novo fornecedor"), { target: { value: " Novo   Lda " } });
    fireEvent.change(within(g).getByLabelText("NIF (opcional)"), { target: { value: "500 100 300" } });
    fireEvent.change(within(g).getByLabelText("Email (opcional)"), { target: { value: "a@novo.pt" } });
    fireEvent.click(within(g).getByRole("button", { name: "Usar este fornecedor" }));
    expect(screen.queryByRole("group", { name: "Novo fornecedor" })).toBeNull();
    expect(campo().value).toBe("Novo Lda");
    expect(screen.getByText("É novo: cria-se quando o produto for gravado.")).toBeInTheDocument();
    await waitFor(() => expect(campo()).toHaveFocus());
    preencherProduto();
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(lerCatalogo().produtos.find((p) => p.n === "Base de duche")).toMatchObject({ fornecedor: "Novo Lda", fornecedorNovo: { nome: "Novo Lda", nif: "500100300", email: "a@novo.pt" } });
    expect(escritas()).toEqual(["cat_ler_fornecedores"]);
  });
  it("cancelar fecha, devolve o foco e não deixa nada", async () => {
    abrir("Produtos");
    const g = await novoFornecedor();
    fireEvent.click(within(g).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: "Novo fornecedor" })).toBeNull();
    await waitFor(() => expect(campo()).toHaveFocus());
    expect(campo().value).toBe("");
  });
  it("coincidência de nome (sem acentos nem maiúsculas): avisa e escolhe o existente, sem criar", async () => {
    abrir("Produtos");
    const g = await novoFornecedor();
    fireEvent.change(within(g).getByLabelText("Nome do novo fornecedor"), { target: { value: "ANODO lda" } });
    fireEvent.click(within(g).getByRole("button", { name: "Usar este fornecedor" }));
    expect(campo().value).toBe("Ânodo Lda");
    expect(screen.getByText("Já existe o fornecedor «Ânodo Lda»: ficou escolhido esse.")).toBeInTheDocument();
    preencherProduto();
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    expect(lerCatalogo().produtos.find((p) => p.n === "Base de duche")).toMatchObject({ fornecedorId: F1 });
  });
  it("coincidência pelo NIF com outro nome também escolhe o existente", async () => {
    abrir("Produtos");
    const g = await novoFornecedor();
    fireEvent.change(within(g).getByLabelText("Nome do novo fornecedor"), { target: { value: "Outro nome" } });
    fireEvent.change(within(g).getByLabelText("NIF (opcional)"), { target: { value: "500 100 200" } });
    fireEvent.click(within(g).getByRole("button", { name: "Usar este fornecedor" }));
    expect(campo().value).toBe("Sanitop");
  });
  it("coincide com um desativado: diz porquê e não escolhe", async () => {
    abrir("Produtos");
    const g = await novoFornecedor();
    fireEvent.change(within(g).getByLabelText("Nome do novo fornecedor"), { target: { value: "antigo desativado" } });
    fireEvent.click(within(g).getByRole("button", { name: "Usar este fornecedor" }));
    expect(within(g).getByRole("alert")).toHaveTextContent(/desativado/);
    expect(campo().value).toBe("");
  });
});

describe("produto: sem permissão para criar fornecedores", () => {
  it("não há «Novo fornecedor…», diz porquê, e escolher um existente continua a funcionar", async () => {
    base.respostas.cat_ler_fornecedores = LISTA(false);
    abrir("Produtos");
    await pronto();
    fireEvent.click(campo());
    expect(opcoes()).toEqual(["Sem fornecedor", "Ânodo Lda", "Sanitop"]);
    expect(screen.getByText(/Sem permissão para criar fornecedores \(suppliers\.create\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Sanitop" }));
    expect(campo().value).toBe("Sanitop");
  });
});

describe("produto: falha a ler os fornecedores", () => {
  it("mostra o erro da base (CT001…) a vermelho e deixa tentar de novo; o produto pode criar-se sem fornecedor", async () => {
    base.respostas.cat_ler_fornecedores = { data: null, error: { message: "CT001: sem permissão para ver fornecedores", code: "CT001" } };
    abrir("Produtos");
    const e = await screen.findByRole("alert");
    expect(e).toHaveTextContent("CT001: sem permissão para ver fornecedores");
    expect(e.className).toContain("text-red-700");
    base.respostas.cat_ler_fornecedores = LISTA(true);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await pronto();
    expect(screen.queryByText(/CT001/)).toBeNull();
  });
  it("função ainda sem existir: «Ainda não disponível nesta base»", async () => {
    base.respostas.cat_ler_fornecedores = { data: null, error: { message: "Could not find the function", code: "PGRST202" } };
    abrir("Produtos");
    expect(await screen.findByRole("alert")).toHaveTextContent("Ainda não disponível nesta base");
  });
});

describe("consumível: campo Fornecedor real", () => {
  it("escolher um fornecedor: o consumível novo leva o id, e a pré-visualização mostra o nome", async () => {
    abrir("Consumíveis");
    await escolher("Sanitop");
    expect(screen.getByRole("complementary", { name: "Pré-visualização" })).toHaveTextContent("Sanitop");
    preencherConsumivel();
    fireEvent.click(screen.getByRole("button", { name: "Criar o consumível" }));
    expect(lerCatalogo().consumiveisCriados?.find((c) => c.n === "Silicone branco")).toMatchObject({ fornecedor: "Sanitop", fornecedorId: F2 });
  });
  it("fornecedor novo fica pendente no consumível", async () => {
    abrir("Consumíveis");
    const g = await novoFornecedor();
    fireEvent.change(within(g).getByLabelText("Nome do novo fornecedor"), { target: { value: "Colas SA" } });
    fireEvent.click(within(g).getByRole("button", { name: "Usar este fornecedor" }));
    preencherConsumivel();
    fireEvent.click(screen.getByRole("button", { name: "Criar o consumível" }));
    expect(lerCatalogo().consumiveisCriados?.find((c) => c.n === "Silicone branco")).toMatchObject({ fornecedor: "Colas SA", fornecedorNovo: { nome: "Colas SA" } });
    expect(escritas()).toEqual(["cat_ler_fornecedores"]);
  });
});

describe("protótipo (sem página real)", () => {
  it("mantém o campo de texto com sugestões e não lê fornecedores da base", () => {
    abrir("Produtos", null);
    const i = screen.getByLabelText("Fornecedor") as HTMLInputElement;
    expect(i.tagName).toBe("INPUT");
    expect(i.getAttribute("list")).toBe("criar-forn");
    fireEvent.change(i, { target: { value: "Qualquer Lda" } });
    preencherProduto();
    fireEvent.click(screen.getByRole("button", { name: "Criar o produto" }));
    const p = lerCatalogo().produtos.find((x) => x.n === "Base de duche")!;
    expect(p.fornecedor).toBe("Qualquer Lda");
    expect(p.fornecedorId).toBeUndefined();
    expect(base.chamadas).toEqual([]);
  });
});
