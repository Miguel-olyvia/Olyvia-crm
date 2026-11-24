// O «Modelo 3D» de uma CATEGORIA e de uma SUBCATEGORIA, na gestão do Catálogo (separadores «Categorias» e «Subcategorias»): cada linha mostra o modelo
// (ou «automático»), editar abre o seletor e grava com cat_definir_modelo_3d (alvo 'categoria': a subcategoria é uma categoria); criar leva o seletor e
// define o modelo logo a seguir a criar (com o id que a base deu). Sem a chave modelo3d na leitura (migração por aplicar), tudo continua como hoje.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { GestaoCategorias } from "./GestaoCategorias";
import { GestaoSubcategorias } from "./GestaoSubcategorias";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const C1 = "c0000000-0000-4000-a000-000000000001", C2 = "c0000000-0000-4000-a000-000000000002";
const S1 = "50000000-0000-4000-a000-000000000001", S2 = "50000000-0000-4000-a000-000000000002";
const NOVO = "99999999-0000-4000-a000-000000000009";

const lido = (comModelo = true) => ({
  categorias: [
    { id: C1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 5, ...(comModelo ? { modelo3d: "banheira" } : {}), subcategorias: [
      { id: S1, nome: "Sanitas", ordem: 1, ativo: true, global: false, usados: 3, ...(comModelo ? { modelo3d: "sanita" } : {}) },
      { id: S2, nome: "Torneiras", ordem: 2, ativo: true, global: false, usados: 0, ...(comModelo ? { modelo3d: null } : {}) },
    ] },
    { id: C2, nome: "Cozinha", ordem: 2, ativo: true, global: false, usados: 0, subcategorias: [] },
  ],
});
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);
const seletor = () => screen.getByRole("combobox", { name: /^Modelo 3D/ });
const escolherModelo = (nome: string | null) => { fireEvent.click(seletor()); fireEvent.click(nome === null ? screen.getAllByRole("option")[0] : screen.getByRole("option", { name: nome })); };

let comModelo = true;
beforeEach(() => {
  base.chamadas = []; comModelo = true;
  base.responder = (f) => {
    if (f === "cat_ler_categorias_gestao") return { data: lido(comModelo), error: null };
    if (f === "cat_guardar_categoria_produto") return { data: { categoria: { id: NOVO, nome: "Nova", pai: null, ativo: true, global: false } }, error: null };
    if (f === "cat_definir_modelo_3d") return { data: { alvo: "categoria", id: C1, modelo: "bide", anterior: null }, error: null };
    return { data: { ok: true }, error: null };
  };
});
afterEach(cleanup);

const sec = (n: string) => screen.getByRole("article", { name: n });
const li = (raiz: HTMLElement, nome: string) => within(raiz).getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;

describe("Categorias: Modelo 3D", () => {
  const abrir = async (r = REAL(), anunciar = vi.fn()) => { render(<GestaoCategorias real={r} anunciar={anunciar} />); await screen.findByRole("article", { name: "Cozinha" }); return anunciar; };

  it("cada categoria e subcategoria mostra o seu modelo 3D (ou «automático»)", async () => {
    await abrir();
    expect(within(sec("Casa de banho")).getAllByText("Modelo 3D: Banheira").length).toBeGreaterThan(0);
    expect(within(li(sec("Casa de banho"), "Sanitas")).getByText("Modelo 3D: Sanita de chão")).toBeInTheDocument();
    expect(within(li(sec("Casa de banho"), "Torneiras")).getByText("Modelo 3D: automático")).toBeInTheDocument();
    expect(within(sec("Cozinha")).getByText("Modelo 3D: automático")).toBeInTheDocument();
  });

  it("sem a chave modelo3d na leitura (migração por aplicar) tudo aparece como «automático», sem erros", async () => {
    comModelo = false;
    await abrir();
    expect(within(sec("Casa de banho")).getAllByText("Modelo 3D: automático").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("editar uma categoria: abre o seletor (sem herança acima) e grava com o alvo 'categoria' e o id dela", async () => {
    const anunciar = await abrir();
    fireEvent.click(within(sec("Cozinha")).getByRole("button", { name: "Mudar o modelo 3D da categoria Cozinha" }));
    expect(seletor()).toHaveTextContent("Automático (herda: o classificador, pelo nome e pela subcategoria)");
    escolherModelo("Frigorífico");
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_modelo_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "categoria", p_id: C2, p_modelo: "frigorifico" });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith(expect.stringMatching(/Modelo 3D de «Cozinha»: Frigorífico/)));
    // relê depois de gravar
    expect(chamadasDe("cat_ler_categorias_gestao").length).toBeGreaterThanOrEqual(2);
  });

  it("editar uma subcategoria: o seletor herda da categoria («Herdado da categoria Casa de banho: Banheira») e grava com o alvo 'categoria'", async () => {
    await abrir();
    fireEvent.click(within(li(sec("Casa de banho"), "Torneiras")).getByRole("button", { name: "Mudar o modelo 3D da subcategoria Torneiras em Casa de banho" }));
    expect(screen.getByText("Herdado da categoria Casa de banho: Banheira.")).toBeInTheDocument();
    escolherModelo("Torneira ou misturadora");
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_modelo_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "categoria", p_id: S2, p_modelo: "torneira" });
  });

  it("limpar (voltar a «Automático») manda p_modelo null", async () => {
    await abrir();
    fireEvent.click(within(li(sec("Casa de banho"), "Sanitas")).getByRole("button", { name: /Mudar o modelo 3D da subcategoria Sanitas/ }));
    escolherModelo(null);
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_modelo_3d")[0].a.p_modelo).toBeNull();
  });

  it("enquanto grava, o seletor, o Guardar e o Cancelar usam aria-disabled (não disabled), o foco não se perde e o Cancelar não fecha o painel", async () => {
    let largar!: (v: { data: unknown; error: unknown }) => void;
    const orig = base.responder;
    base.responder = (f, a) => (f === "cat_definir_modelo_3d" ? new Promise((r) => { largar = r; }) : orig(f, a));
    await abrir();
    fireEvent.click(within(sec("Cozinha")).getByRole("button", { name: "Mudar o modelo 3D da categoria Cozinha" }));
    escolherModelo("Frigorífico");
    const guardar = screen.getByRole("button", { name: "Guardar modelo 3D" });
    guardar.focus();
    fireEvent.click(guardar);
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    for (const el of [seletor(), guardar, cancelar]) { expect(el).toHaveAttribute("aria-disabled", "true"); expect(el).not.toBeDisabled(); }
    expect(guardar).toHaveFocus();
    fireEvent.click(cancelar);
    expect(screen.getByRole("button", { name: "Guardar modelo 3D" })).toBeInTheDocument();
    largar({ data: null, error: { code: "CT001", message: "Sem permissão para editar o catálogo." } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão para editar o catálogo.");
    expect(screen.getByRole("button", { name: "Guardar modelo 3D" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Cancelar" })).not.toHaveAttribute("aria-disabled");
  });

  it("o botão de guardar só vale quando o modelo mudou", async () => {
    await abrir();
    fireEvent.click(within(sec("Cozinha")).getByRole("button", { name: "Mudar o modelo 3D da categoria Cozinha" }));
    const g = screen.getByRole("button", { name: "Guardar modelo 3D" });
    expect(g).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(g);
    expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(0);
  });

  it("a recusa da base aparece em português no sítio e nada fica a meio", async () => {
    const orig = base.responder;
    base.responder = (f, a) => (f === "cat_definir_modelo_3d" ? { data: null, error: { code: "CT001", message: "Sem permissão para editar o catálogo." } } : orig(f, a));
    await abrir();
    fireEvent.click(within(sec("Cozinha")).getByRole("button", { name: "Mudar o modelo 3D da categoria Cozinha" }));
    escolherModelo("Frigorífico");
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão para editar o catálogo.");
  });

  it("a função ainda não existe na base: frase em português", async () => {
    const orig = base.responder;
    base.responder = (f, a) => (f === "cat_definir_modelo_3d" ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } } : orig(f, a));
    await abrir();
    fireEvent.click(within(sec("Cozinha")).getByRole("button", { name: "Mudar o modelo 3D da categoria Cozinha" }));
    escolherModelo("Frigorífico");
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ainda não está disponível|ainda não disponível/i);
  });

  it("sem products.edit não há botão de mudar o modelo, mas o modelo vê-se", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.queryByRole("button", { name: /Mudar o modelo 3D/ })).toBeNull();
    expect(within(sec("Casa de banho")).getAllByText("Modelo 3D: Banheira").length).toBeGreaterThan(0);
  });

  it("criar categoria: o formulário leva o seletor; criada, define o modelo com o id que a base deu", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: "Nova" } });
    escolherModelo("Cama");
    fireEvent.click(screen.getByRole("button", { name: "Criar categoria" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: null, p_pai: null, p_nome: "Nova" });
    expect(chamadasDe("cat_definir_modelo_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "categoria", p_id: NOVO, p_modelo: "cama" });
    // a ordem: primeiro cria, depois define
    const ordem = base.chamadas.map((c) => c.f);
    expect(ordem.indexOf("cat_guardar_categoria_produto")).toBeLessThan(ordem.indexOf("cat_definir_modelo_3d"));
  });

  it("criar sem escolher modelo: nenhuma chamada de modelo (o comportamento de hoje)", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar categoria" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(0);
  });

  it("criar subcategoria dentro de uma categoria: herda dela e define o modelo no id novo", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova subcategoria em Casa de banho" }));
    expect(screen.getByText("Herdado da categoria Casa de banho: Banheira.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome da subcategoria"), { target: { value: "Bidés" } });
    escolherModelo("Bidé");
    fireEvent.click(screen.getByRole("button", { name: "Criar subcategoria" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: null, p_pai: C1, p_nome: "Bidés" });
    expect(chamadasDe("cat_definir_modelo_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "categoria", p_id: NOVO, p_modelo: "bide" });
  });

  it("se a categoria ficou criada mas o modelo falhou, diz-o (a categoria existe; não fica um formulário a pedir para a criar outra vez)", async () => {
    const orig = base.responder;
    base.responder = (f, a) => (f === "cat_definir_modelo_3d" ? { data: null, error: { code: "PGRST202", message: "Could not find the function" } } : orig(f, a));
    const anunciar = await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova categoria" }));
    fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: "Nova" } });
    escolherModelo("Cama");
    fireEvent.click(screen.getByRole("button", { name: "Criar categoria" }));
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith(expect.stringMatching(/Nova.*criada.*modelo 3D não ficou/s)));
    expect(screen.queryByLabelText("Nome da categoria")).toBeNull();
  });
});

describe("Subcategorias: Modelo 3D", () => {
  const abrir = async (r = REAL(), anunciar = vi.fn()) => { render(<GestaoSubcategorias real={r} anunciar={anunciar} />); await screen.findByRole("heading", { level: 2, name: "Subcategorias" }); await screen.findByText("Sanitas"); return anunciar; };
  const linha = (nome: string) => screen.getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;

  it("cada linha mostra o modelo da subcategoria", async () => {
    await abrir();
    expect(within(linha("Sanitas")).getByText("Modelo 3D: Sanita de chão")).toBeInTheDocument();
    expect(within(linha("Torneiras")).getByText("Modelo 3D: automático")).toBeInTheDocument();
  });

  it("editar: herda da categoria e grava com o alvo 'categoria'", async () => {
    await abrir();
    fireEvent.click(within(linha("Torneiras")).getByRole("button", { name: /Mudar o modelo 3D da subcategoria Torneiras/ }));
    expect(screen.getByText("Herdado da categoria Casa de banho: Banheira.")).toBeInTheDocument();
    escolherModelo("Torneira ou misturadora");
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_modelo_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "categoria", p_id: S2, p_modelo: "torneira" });
  });

  it("criar: escolhe-se a categoria, o nome e o modelo; define o modelo no id novo", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova subcategoria" }));
    fireEvent.click(screen.getByRole("combobox", { name: /^Categoria/ }));
    fireEvent.click(screen.getByRole("option", { name: "Casa de banho" }));
    fireEvent.change(screen.getByLabelText("Nome da subcategoria"), { target: { value: "Bidés" } });
    escolherModelo("Bidé");
    fireEvent.click(screen.getByRole("button", { name: "Criar subcategoria" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_modelo_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "categoria", p_id: NOVO, p_modelo: "bide" });
  });
});
