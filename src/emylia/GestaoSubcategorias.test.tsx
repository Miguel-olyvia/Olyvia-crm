// 16/11: o separador «Subcategorias» da gestão do Catálogo: lista plana das subcategorias (nome, categoria pai, estado, produtos), pesquisa e filtros,
// criar (categoria + nome), renomear, ativar/desativar, reordenar dentro da mesma categoria. A base é simulada e confere-se o contrato das cat_*.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { GestaoSubcategorias } from "./GestaoSubcategorias";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const C1 = "c0000000-0000-4000-a000-000000000001", C2 = "c0000000-0000-4000-a000-000000000002", C3 = "c0000000-0000-4000-a000-000000000003", C4 = "c0000000-0000-4000-a000-000000000004";
const S1 = "50000000-0000-4000-a000-000000000001", S2 = "50000000-0000-4000-a000-000000000002", S3 = "50000000-0000-4000-a000-000000000003";
const S4 = "50000000-0000-4000-a000-000000000004", S5 = "50000000-0000-4000-a000-000000000005";

const lido = () => ({
  categorias: [
    { id: C1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 5, subcategorias: [
      { id: S1, nome: "Louças", ordem: 1, ativo: true, global: false, usados: 3 },
      { id: S2, nome: "Torneiras", ordem: 2, ativo: true, global: false, usados: 0 },
      { id: S3, nome: "Antiga", ordem: 3, ativo: false, global: false, usados: 1 },
    ] },
    { id: C2, nome: "Cozinha", ordem: 2, ativo: true, global: false, usados: 0, subcategorias: [] },
    { id: C3, nome: "Antiguidades", ordem: 3, ativo: false, global: false, usados: 2, subcategorias: [{ id: S4, nome: "Velhas", ordem: 1, ativo: false, global: false, usados: 0 }] },
    { id: C4, nome: "Ferramentas", ordem: 4, ativo: true, global: true, usados: 7, subcategorias: [{ id: S5, nome: "Manuais", ordem: 1, ativo: true, global: true, usados: 2 }] },
  ],
});

const erro = (code: string, message: string) => ({ data: null, error: { code, message } });
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

beforeEach(() => {
  base.chamadas = [];
  base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : { data: { ok: true }, error: null });
});
afterEach(cleanup);

const abrir = async (r: FichaProdutoReal = REAL(), anunciar = vi.fn()) => {
  render(<GestaoSubcategorias real={r} anunciar={anunciar} />);
  await screen.findByText("Louças");
  return anunciar;
};
const linha = (nome: string) => screen.getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;
const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();

describe("Subcategorias: ler e filtrar", () => {
  it("lê com a organização e mostra, por linha, o nome, a categoria pai, o estado em texto, os produtos e as partilhadas", async () => {
    await abrir();
    expect(chamadasDe("cat_ler_categorias_gestao")[0].a).toEqual({ p_org: ORG });
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(linha("Louças")).toHaveTextContent("Casa de banho");
    expect(linha("Louças")).toHaveTextContent("3 produtos");
    expect(linha("Torneiras")).toHaveTextContent("0 produtos");
    expect(linha("Antiga")).toHaveTextContent("desativada");
    expect(linha("Louças")).not.toHaveTextContent("desativada");
    expect(linha("Manuais")).toHaveTextContent("Partilhada");
    expect(within(linha("Manuais")).queryAllByRole("button")).toHaveLength(0);
  });

  it("a pesquisa filtra por nome (sem acentos) e anuncia a contagem numa região de estado", async () => {
    await abrir();
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar subcategoria" }), { target: { value: "louca" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("1 subcategoria", { selector: "[role=status]" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar subcategoria" }), { target: { value: "zzz" } });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Nenhuma subcategoria encontrada", { selector: "[role=status]" })).toBeInTheDocument();
  });

  it("o filtro por categoria tem «Todas as categorias» como primeiro item e limita a lista", async () => {
    await abrir();
    const combo = screen.getByRole("combobox", { name: /^Filtrar por categoria( |$)/ });
    fireEvent.click(combo);
    const opcoes = screen.getAllByRole("option");
    expect(opcoes[0]).toHaveTextContent("Todas as categorias");
    fireEvent.click(opcoes.find((o) => o.textContent?.startsWith("Casa de banho"))!);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("Manuais")).toBeNull();
  });

  it("o filtro por estado: ativas, desativadas e todas", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Desativadas" }));
    expect(screen.getAllByRole("listitem").map((x) => x.textContent)).toHaveLength(2); // Antiga e Velhas
    expect(screen.queryByText("Louças")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Ativas" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3); // Louças, Torneiras, Manuais
    expect(screen.queryByText("Antiga")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Todas" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });
});

describe("Subcategorias: criar", () => {
  it("escolhe-se a categoria (só ativas e da organização) e o nome; grava com p_pai e relê", async () => {
    const anunciar = await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova subcategoria" }));
    const cat = screen.getByRole("combobox", { name: /^Categoria( |$)/ });
    fireEvent.click(cat);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Casa de banho", "Cozinha"]); // sem Antiguidades (desativada) nem Ferramentas (partilhada)
    const criar = screen.getByRole("button", { name: "Criar subcategoria" });
    expect(criar).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getAllByRole("option")[1]);
    fireEvent.change(screen.getByRole("textbox", { name: "Nome da subcategoria" }), { target: { value: "Fogões" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar subcategoria" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: null, p_pai: C2, p_nome: "Fogões" });
    await waitFor(() => expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2));
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Subcategoria «Fogões» criada em «Cozinha»."));
  });

  it("sem categoria escolhida o botão explica porquê e não grava", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova subcategoria" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome da subcategoria" }), { target: { value: "Fogões" } });
    const criar = screen.getByRole("button", { name: "Criar subcategoria" });
    expect(razao(criar)).toBe("Escolha a categoria.");
    fireEvent.click(criar);
    expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(0);
  });

  it("uma falha ao criar mostra o erro no formulário (role=alert) e relê na mesma", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT002", "Já existe uma subcategoria com esse nome."));
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova subcategoria" }));
    fireEvent.click(screen.getByRole("combobox", { name: /^Categoria( |$)/ }));
    fireEvent.click(screen.getAllByRole("option")[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Nome da subcategoria" }), { target: { value: "Louças" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar subcategoria" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe uma subcategoria com esse nome.");
    expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2);
  });
});

describe("Subcategorias: renomear, estado, ordem", () => {
  it("renomear uma usada por produtos pede confirmação e grava com p_id e p_pai", async () => {
    await abrir();
    fireEvent.click(within(linha("Louças")).getByRole("button", { name: /Renomear a subcategoria Louças/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome da subcategoria" }), { target: { value: "Loiças" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nome" }));
    expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(0);
    expect(screen.getByRole("group", { name: /Mudar o nome/ })).toHaveTextContent("3 produtos");
    expect(screen.getByRole("textbox", { name: "Nome da subcategoria" })).toHaveAttribute("readonly"); // enquanto a confirmação está aberta
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: S1, p_pai: C1, p_nome: "Loiças" });
  });

  it("desativa e reativa; reativar com a categoria desativada fica bloqueado com razão e sem chamada", async () => {
    await abrir();
    fireEvent.click(within(linha("Torneiras")).getByRole("button", { name: /Desativar Torneiras/ }));
    await waitFor(() => expect(chamadasDe("cat_estado_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_estado_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: S2, p_ativo: false });
    const velhas = within(linha("Velhas")).getByRole("button", { name: /Reativar Velhas/ });
    expect(velhas).toHaveAttribute("aria-disabled", "true");
    expect(razao(velhas)).toBe("Reative primeiro a categoria na aba Categorias.");
    fireEvent.click(velhas);
    expect(chamadasDe("cat_estado_categoria_produto")).toHaveLength(1);
    fireEvent.click(within(linha("Antiga")).getByRole("button", { name: /Reativar Antiga/ }));
    await waitFor(() => expect(chamadasDe("cat_estado_categoria_produto")).toHaveLength(2));
    expect(chamadasDe("cat_estado_categoria_produto")[1].a).toEqual({ p_org: ORG, p_id: S3, p_ativo: true });
  });

  it("Descer envia TODAS as irmãs da mesma categoria na ordem nova e anuncia a posição", async () => {
    const anunciar = await abrir();
    expect(within(linha("Louças")).getByRole("button", { name: "Subir Louças em Casa de banho, posição 1 de 3" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(within(linha("Louças")).getByRole("button", { name: "Descer Louças em Casa de banho, posição 1 de 3" }));
    await waitFor(() => expect(chamadasDe("cat_reordenar_categorias")).toHaveLength(1));
    expect(chamadasDe("cat_reordenar_categorias")[0].a).toEqual({ p_org: ORG, p_pai: C1, p_ids: [S2, S1, S3] });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("«Louças» passou para a posição 2 de 3."));
  });

  it("com pesquisa ou filtro ativos Subir/Descer ficam bloqueados com razão e sem chamada", async () => {
    await abrir();
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar subcategoria" }), { target: { value: "torn" } });
    const subir = within(linha("Torneiras")).getByRole("button", { name: /Subir Torneiras/ });
    expect(subir).toHaveAttribute("aria-disabled", "true");
    expect(razao(subir)).toBe("Limpe a pesquisa e os filtros para reordenar.");
    fireEvent.click(subir);
    expect(chamadasDe("cat_reordenar_categorias")).toHaveLength(0);
  });

  it("uma partilhada não entra em p_ids com as editáveis da mesma categoria", async () => {
    const G = "50000000-0000-4000-a000-0000000000a1", B = "50000000-0000-4000-a000-0000000000b1", A = "50000000-0000-4000-a000-0000000000c1";
    base.responder = (f) => (f === "cat_ler_categorias_gestao"
      ? { data: { categorias: [{ id: C1, nome: "Mista", ordem: 1, ativo: true, global: false, usados: 0, subcategorias: [
        { id: A, nome: "Alfa", ordem: 1, ativo: true, global: false, usados: 0 },
        { id: G, nome: "Global", ordem: 2, ativo: true, global: true, usados: 0 },
        { id: B, nome: "Beta", ordem: 3, ativo: true, global: false, usados: 0 }] }] }, error: null }
      : { data: { ok: true }, error: null });
    render(<GestaoSubcategorias real={REAL()} anunciar={vi.fn()} />);
    await screen.findByText("Alfa");
    fireEvent.click(within(linha("Alfa")).getByRole("button", { name: "Descer Alfa em Mista, posição 1 de 2" }));
    await waitFor(() => expect(chamadasDe("cat_reordenar_categorias")).toHaveLength(1));
    expect(chamadasDe("cat_reordenar_categorias")[0].a).toEqual({ p_org: ORG, p_pai: C1, p_ids: [B, A] });
  });

  it("mudar de categoria não existe: nenhuma ação de mover para outra categoria", async () => {
    await abrir();
    fireEvent.click(within(linha("Louças")).getByRole("button", { name: /Renomear/ }));
    expect(screen.queryByRole("combobox", { name: /^Categoria( |$)/ })).toBeNull();
  });

  it("uma falha de estado mostra o erro na linha (role=alert) e relê na mesma", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT003", "Sem permissão."));
    await abrir();
    fireEvent.click(within(linha("Torneiras")).getByRole("button", { name: /Desativar Torneiras/ }));
    expect(await within(linha("Torneiras")).findByRole("alert")).toHaveTextContent("Sem permissão.");
    expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2);
  });
});

describe("Subcategorias: permissões e estados", () => {
  it("sem products.edit é só leitura: nem Nova subcategoria nem ações, e há uma nota", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.queryByRole("button", { name: "Nova subcategoria" })).toBeNull();
    expect(within(linha("Louças")).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("note")).toHaveTextContent("Só de leitura");
  });

  it("sem nenhuma categoria ativa da organização não se pode criar, com razão", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao"
      ? { data: { categorias: [{ id: C3, nome: "Antiguidades", ordem: 1, ativo: false, global: false, usados: 0, subcategorias: [{ id: S4, nome: "Velhas", ordem: 1, ativo: false, global: false, usados: 0 }] }] }, error: null }
      : { data: { ok: true }, error: null });
    render(<GestaoSubcategorias real={REAL()} anunciar={vi.fn()} />);
    await screen.findByText("Velhas");
    const novo = screen.getByRole("button", { name: "Nova subcategoria" });
    expect(novo).toHaveAttribute("aria-disabled", "true");
    expect(razao(novo)).toBe("Não há categorias ativas: crie ou reative uma categoria primeiro.");
  });

  it("função em falta na base: «Ainda não disponível nesta base»", async () => {
    base.responder = () => erro("PGRST202", "Could not find the function public.cat_ler_categorias_gestao");
    render(<GestaoSubcategorias real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText(/Ainda não disponível nesta base/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nova subcategoria" })).toBeNull();
  });
});

describe("Subcategorias: revisão (foco, contraste, estrutura)", () => {
  /** A base devolve a Torneiras desativada depois de se desativar. */
  const comEstadoQueMuda = () => {
    let torneirasAtiva = true;
    base.responder = (f) => {
      if (f === "cat_estado_categoria_produto") { torneirasAtiva = false; return { data: { ok: true }, error: null }; }
      if (f !== "cat_ler_categorias_gestao") return { data: { ok: true }, error: null };
      const d = lido();
      d.categorias[0].subcategorias[1].ativo = torneirasAtiva;
      return { data: d, error: null };
    };
  };

  it("desativar com o filtro «Ativas»: a linha some e o foco vai para a linha vizinha", async () => {
    comEstadoQueMuda();
    await abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Ativas" }));
    fireEvent.click(within(linha("Torneiras")).getByRole("button", { name: /Desativar Torneiras/ }));
    await waitFor(() => expect(screen.queryByText("Torneiras")).toBeNull());
    await waitFor(() => expect(within(linha("Louças")).getByRole("button", { name: /Desativar Louças/ })).toHaveFocus());
  });

  it("se não sobra nenhuma linha, o foco vai para o título do separador", async () => {
    comEstadoQueMuda();
    await abrir();
    fireEvent.click(screen.getByRole("radio", { name: "Ativas" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar subcategoria" }), { target: { value: "torn" } });
    fireEvent.click(within(linha("Torneiras")).getByRole("button", { name: /Desativar Torneiras/ }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Subcategorias" })).toHaveFocus());
  });

  it("os erros usam um vermelho com contraste (text-red-700 / dark:text-red-400)", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT003", "Sem permissão."));
    await abrir();
    fireEvent.click(within(linha("Torneiras")).getByRole("button", { name: /Desativar Torneiras/ }));
    const a = await within(linha("Torneiras")).findByRole("alert");
    expect(a.className).toContain("text-red-700");
    expect(a.className).toContain("dark:text-red-400");
    expect(a.className).not.toContain("text-destructive");
  });

  it("o filtro de categoria mostra «Todas as categorias» como valor", async () => {
    await abrir();
    expect(screen.getByRole("combobox", { name: /^Filtrar por categoria( |$)/ }).textContent).toBe("Todas as categorias");
  });

  it("os controlos de gestão têm borda com contraste (border-foreground/40)", async () => {
    await abrir();
    expect(screen.getByRole("searchbox", { name: "Procurar subcategoria" }).className).toContain("border-foreground/40");
    expect(screen.getByRole("combobox", { name: /^Filtrar por categoria( |$)/ }).className).toContain("border-foreground/40");
  });

  it("criar: o foco vai para o campo da categoria, que é obrigatório", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova subcategoria" }));
    const cat = screen.getByRole("combobox", { name: /^Categoria( |$)/ });
    expect(cat).toHaveFocus();
    expect(cat).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("textbox", { name: "Nome da subcategoria" })).toHaveAttribute("aria-required", "true");
  });

  it("depois de criar, os filtros que escondiam a nova são limpos", async () => {
    await abrir();
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar subcategoria" }), { target: { value: "louca" } });
    fireEvent.click(screen.getByRole("radio", { name: "Ativas" }));
    fireEvent.click(screen.getByRole("button", { name: "Nova subcategoria" }));
    fireEvent.click(screen.getByRole("combobox", { name: /^Categoria( |$)/ }));
    fireEvent.click(screen.getAllByRole("option")[1]);
    fireEvent.change(screen.getByRole("textbox", { name: "Nome da subcategoria" }), { target: { value: "Fogões" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar subcategoria" }));
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Procurar subcategoria" })).toHaveValue(""));
    expect(screen.getByRole("radio", { name: "Todas" })).toBeChecked();
  });

  it("a lista vem agrupada por categoria, com títulos, e o estado escolhido leva um sinal que não é só cor", async () => {
    await abrir();
    expect(screen.getByRole("heading", { level: 3, name: "Casa de banho" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /Antiguidades/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Estado" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Todas" }).closest("label")!.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Ativas" }).closest("label")!.querySelector("svg")).toBeNull();
  });

  it("a região de estado diz quantas subcategorias há, mesmo sem filtro", async () => {
    await abrir();
    expect(screen.getByText("5 subcategorias", { selector: "[role=status]" })).toBeInTheDocument();
  });
});
