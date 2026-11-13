// 13/11: o separador «Categorias» da gestão do Catálogo: categorias e subcategorias dos produtos (criar, renomear, ativar/desativar, ordenar).
// As funções cat_* de 20270117700000 ainda não estão aplicadas na base: aqui a base é simulada e confere-se o contrato (nomes e argumentos).
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

const erro = (code: string, message: string, details?: string) => ({ data: null, error: { code, message, details } });
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

beforeEach(() => {
  base.chamadas = [];
  base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : { data: { ok: true }, error: null });
});
afterEach(cleanup);

const abrir = async (r: FichaProdutoReal = REAL(), anunciar = vi.fn()) => {
  render(<GestaoCategorias real={r} anunciar={anunciar} />);
  await screen.findByRole("article", { name: "Cozinha" });
  return anunciar;
};
const sec = (n: string) => screen.getByRole("article", { name: n });
const li = (raiz: HTMLElement, nome: string) => within(raiz).getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;
const botao = (raiz: HTMLElement | Document, nome: string | RegExp) => within(raiz as HTMLElement).getByRole("button", { name: nome });

/** A razão de um botão desativado, lida por quem o ouve (aria-describedby). */
const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();

describe("Categorias: ler", () => {
  it("lê com a organização e mostra categorias e subcategorias, quantos produtos as usam, as desativadas e as partilhadas", async () => {
    await abrir();
    expect(chamadasDe("cat_ler_categorias_gestao")[0].a).toEqual({ p_org: ORG });
    const cb = sec("Casa de banho");
    expect(within(cb).getByText("Usada em 5 produtos")).toBeInTheDocument();
    expect(within(li(cb, "Louças")).getByText("3 produtos")).toBeInTheDocument();
    expect(within(li(cb, "Torneiras")).getByText("0 produtos")).toBeInTheDocument();
    expect(li(cb, "Antiga")).toHaveTextContent("desativada");
    expect(sec("Antiguidades")).toHaveTextContent("desativada");
    expect(sec("Ferramentas")).toHaveTextContent("Partilhada");
    expect(li(sec("Ferramentas"), "Manuais")).toHaveTextContent("Partilhada");
    expect(within(sec("Cozinha")).getByText("Ainda não tem subcategorias.")).toBeInTheDocument();
  });

  it("as partilhadas só se leem: sem renomear, desativar nem ordenar, mesmo com products.edit", async () => {
    await abrir();
    const f = sec("Ferramentas");
    expect(within(f).queryByRole("button", { name: /Renomear|Desativar|Reativar|Subir|Descer|Nova subcategoria/ })).toBeNull();
  });

  it("sem products.edit só se lê: nada de criar, renomear, ordenar nem desativar", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.getByText(/Só de leitura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova categoria|Nova subcategoria|Renomear|Desativar|Reativar|Subir|Descer/ })).toBeNull();
    expect(li(sec("Casa de banho"), "Louças")).toBeInTheDocument();
  });

  it("função ainda não existe na base: diz «Ainda não disponível nesta base» e não parte", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_categorias_gestao" } });
    render(<GestaoCategorias real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Ainda não disponível nesta base")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova categoria/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("sem permissão para ler (CT001): diz-o, sem «tentar de novo»", async () => {
    base.responder = () => erro("CT001", "Sem permissão para ver as categorias.");
    render(<GestaoCategorias real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Não tem permissão para ver as categorias.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("erro ao ler: mostra a mensagem em alerta e deixa tentar de novo", async () => {
    base.responder = () => erro("XX000", "falhou a rede");
    render(<GestaoCategorias real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("falhou a rede");
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : { data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("article", { name: "Cozinha" })).toBeInTheDocument();
  });

  it("usados null (perfil reduzido): não escreve contagens", async () => {
    base.responder = () => ({ data: { categorias: [{ ...lido().categorias[1], usados: null }] }, error: null });
    render(<GestaoCategorias real={REAL()} anunciar={vi.fn()} />);
    await screen.findByRole("article", { name: "Cozinha" });
    expect(screen.queryByText(/produtos?$/)).toBeNull();
  });

  it("sem categorias: «Ainda não há categorias.»", async () => {
    base.responder = () => ({ data: { categorias: [] }, error: null });
    render(<GestaoCategorias real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Ainda não há categorias.")).toBeInTheDocument();
  });
});

describe("Categorias: criar", () => {
  it("nova categoria: grava só com o nome (p_id e p_pai nulos), avisa, relê e devolve o foco ao botão", async () => {
    const anunciar = await abrir();
    const b = botao(document, "Nova categoria");
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-expanded", "true");
    const criar = botao(document, "Criar categoria");
    expect(criar).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: "  Jardim " } });
    fireEvent.click(criar);
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: null, p_pai: null, p_nome: "Jardim" });
    await waitFor(() => expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2));
    expect(anunciar).toHaveBeenCalledWith("Categoria «Jardim» criada.");
    await waitFor(() => expect(screen.queryByLabelText("Nome da categoria")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("novo-categoria")));
  });

  it("nova subcategoria: leva o id da categoria como pai", async () => {
    await abrir();
    fireEvent.click(botao(sec("Cozinha"), "Nova subcategoria em Cozinha"));
    fireEvent.change(within(sec("Cozinha")).getByLabelText("Nome da subcategoria"), { target: { value: "Bancadas" } });
    fireEvent.click(botao(sec("Cozinha"), "Criar subcategoria"));
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: null, p_pai: C2, p_nome: "Bancadas" });
  });

  it("numa categoria desativada não se criam subcategorias: o botão está desligado e diz porquê", async () => {
    await abrir();
    const a = sec("Antiguidades");
    expect(botao(a, "Nova subcategoria em Antiguidades")).toHaveAttribute("aria-disabled", "true");
    expect(within(a).getByText(/Reative a categoria/)).toBeInTheDocument();
  });

  it("nome duplicado (CT004): a mensagem da base aparece no formulário, a lista é relida e o formulário fica aberto", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT004", "Já existe uma categoria com este nome.", C1));
    await abrir();
    fireEvent.click(botao(document, "Nova categoria"));
    fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: "Cozinha" } });
    fireEvent.click(botao(document, "Criar categoria"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe uma categoria com este nome.");
    expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2); // relê também em falha
    expect(screen.getByLabelText("Nome da categoria")).toHaveValue("Cozinha");
  });

  it("validação da base (CT002) fica junto do sítio onde se agiu, não noutros", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT002", "Escreva o nome da categoria."));
    await abrir();
    fireEvent.click(botao(sec("Cozinha"), "Nova subcategoria em Cozinha"));
    fireEvent.change(within(sec("Cozinha")).getByLabelText("Nome da subcategoria"), { target: { value: "x" } });
    fireEvent.click(botao(sec("Cozinha"), "Criar subcategoria"));
    await waitFor(() => expect(within(sec("Cozinha")).getByRole("alert")).toHaveTextContent("Escreva o nome da categoria."));
    expect(within(sec("Casa de banho")).queryByRole("alert")).toBeNull();
  });

  it("cancelar fecha o formulário sem gravar e devolve o foco", async () => {
    await abrir();
    fireEvent.click(botao(document, "Nova categoria"));
    fireEvent.click(botao(document, "Cancelar"));
    expect(screen.queryByLabelText("Nome da categoria")).toBeNull();
    expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("novo-categoria")));
  });

  it("guarda de reentrada: um segundo clique enquanto grava não repete a chamada", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : new Promise((res) => { soltar = res; }));
    await abrir();
    fireEvent.click(botao(document, "Nova categoria"));
    fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: "Jardim" } });
    const criar = botao(document, "Criar categoria");
    fireEvent.click(criar);
    fireEvent.click(criar);
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1);
    soltar({ data: { ok: true }, error: null });
    await waitFor(() => expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2));
  });
});

describe("Categorias: renomear", () => {
  it("sem produtos grava logo; numa subcategoria o pai segue (não muda de sítio)", async () => {
    await abrir();
    fireEvent.click(botao(sec("Cozinha"), "Renomear a categoria Cozinha"));
    const campo = within(sec("Cozinha")).getByLabelText("Nome da categoria");
    expect(campo).toHaveValue("Cozinha");
    fireEvent.change(campo, { target: { value: "Cozinhas" } });
    fireEvent.click(botao(sec("Cozinha"), "Guardar nome"));
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: C2, p_pai: null, p_nome: "Cozinhas" });
    cleanup(); base.chamadas = [];
    await abrir();
    fireEvent.click(botao(li(sec("Casa de banho"), "Torneiras"), "Renomear a subcategoria Torneiras em Casa de banho"));
    fireEvent.change(within(sec("Casa de banho")).getByLabelText("Nome da subcategoria"), { target: { value: "Misturadoras" } });
    fireEvent.click(botao(sec("Casa de banho"), "Guardar nome"));
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: S2, p_pai: C1, p_nome: "Misturadoras" });
  });

  it("uma usada por produtos pede confirmação no próprio ecrã e só grava ao confirmar", async () => {
    const anunciar = await abrir();
    fireEvent.click(botao(sec("Casa de banho"), "Renomear a categoria Casa de banho"));
    fireEvent.change(within(sec("Casa de banho")).getByLabelText("Nome da categoria"), { target: { value: "WC" } });
    fireEvent.click(botao(sec("Casa de banho"), "Guardar nome"));
    const conf = screen.getByRole("group", { name: "Mudar o nome de «Casa de banho» para «WC»?" });
    expect(conf).toHaveTextContent("5 produtos");
    expect(conf).toHaveFocus();
    expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(0);
    fireEvent.click(botao(conf, "Confirmar"));
    await waitFor(() => expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: C1, p_pai: null, p_nome: "WC" });
    expect(anunciar).toHaveBeenCalledWith("Categoria «WC» guardada.");
  });

  it("«Voltar» na confirmação não grava e devolve o foco ao botão de guardar o nome", async () => {
    await abrir();
    fireEvent.click(botao(sec("Casa de banho"), "Renomear a categoria Casa de banho"));
    fireEvent.change(within(sec("Casa de banho")).getByLabelText("Nome da categoria"), { target: { value: "WC" } });
    fireEvent.click(botao(sec("Casa de banho"), "Guardar nome"));
    fireEvent.click(botao(screen.getByRole("group", { name: /^Mudar o nome/ }), "Voltar"));
    expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(`gn-${C1}`)));
  });

  it("o botão de guardar só liga com um nome diferente", async () => {
    await abrir();
    fireEvent.click(botao(sec("Cozinha"), "Renomear a categoria Cozinha"));
    expect(botao(sec("Cozinha"), "Guardar nome")).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(within(sec("Cozinha")).getByLabelText("Nome da categoria"), { target: { value: "  " } });
    expect(botao(sec("Cozinha"), "Guardar nome")).toHaveAttribute("aria-disabled", "true");
  });

  it("erro ao confirmar (CT004): fica na confirmação, a lista é relida", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT004", "Já existe uma categoria com este nome."));
    await abrir();
    fireEvent.click(botao(sec("Casa de banho"), "Renomear a categoria Casa de banho"));
    fireEvent.change(within(sec("Casa de banho")).getByLabelText("Nome da categoria"), { target: { value: "Cozinha" } });
    fireEvent.click(botao(sec("Casa de banho"), "Guardar nome"));
    fireEvent.click(botao(screen.getByRole("group", { name: /^Mudar o nome/ }), "Confirmar"));
    expect(await within(sec("Casa de banho")).findByRole("alert")).toHaveTextContent("Já existe uma categoria com este nome.");
    expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2);
  });
});

describe("Categorias: acessibilidade (revisão)", () => {
  it("cada categoria é um «article» (não uma região), com o nome como título", async () => {
    await abrir();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(within(sec("Cozinha")).getByRole("heading", { level: 2, name: "Cozinha" })).toBeInTheDocument();
  });

  it("todo botão desativado traz a razão ligada (aria-describedby) e não faz nada ao clique", async () => {
    await abrir();
    const subir = botao(sec("Casa de banho"), "Subir Casa de banho, posição 1 de 3");
    expect(razao(subir)).toBe("Já é a primeira.");
    expect(razao(botao(sec("Antiguidades"), "Descer Antiguidades, posição 3 de 3"))).toBe("Já é a última.");
    expect(razao(botao(sec("Antiguidades"), "Nova subcategoria em Antiguidades"))).toMatch(/Reative a categoria/);
    expect(razao(botao(li(sec("Antiguidades"), "Velhas"), "Reativar Velhas em Antiguidades"))).toMatch(/Reative primeiro a categoria/);
    fireEvent.click(subir);
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadasDe("cat_reordenar_categorias")).toHaveLength(0);
  });

  it("formulários: «Criar categoria» sem nome e «Guardar nome» sem mudança dizem porquê; à espera da confirmação também", async () => {
    await abrir();
    fireEvent.click(botao(document, "Nova categoria"));
    expect(razao(botao(document, "Criar categoria"))).toBe("Escreva o nome.");
    fireEvent.click(botao(document, "Cancelar"));
    fireEvent.click(botao(sec("Casa de banho"), "Renomear a categoria Casa de banho"));
    expect(razao(botao(sec("Casa de banho"), "Guardar nome"))).toBe("Altere o nome para guardar.");
    fireEvent.change(within(sec("Casa de banho")).getByLabelText("Nome da categoria"), { target: { value: "WC" } });
    fireEvent.click(botao(sec("Casa de banho"), "Guardar nome"));
    expect(razao(botao(sec("Casa de banho"), "Guardar nome"))).toBe("À espera da confirmação.");
  });

  it("a gravar, o botão fica aria-disabled mas conserva o foco (não passa a disabled)", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : new Promise((res) => { soltar = res; }));
    await abrir();
    fireEvent.click(botao(document, "Nova categoria"));
    fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: "Jardim" } });
    const criar = botao(document, "Criar categoria");
    criar.focus();
    fireEvent.click(criar);
    await waitFor(() => expect(criar).toHaveAttribute("aria-disabled", "true"));
    expect(criar).not.toBeDisabled();
    expect(criar).toHaveFocus();
    soltar({ data: { ok: true }, error: null });
    await waitFor(() => expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2));
  });

  it("Esc na confirmação volta atrás sem gravar", async () => {
    await abrir();
    fireEvent.click(botao(sec("Casa de banho"), "Renomear a categoria Casa de banho"));
    fireEvent.change(within(sec("Casa de banho")).getByLabelText("Nome da categoria"), { target: { value: "WC" } });
    fireEvent.click(botao(sec("Casa de banho"), "Guardar nome"));
    fireEvent.keyDown(screen.getByRole("group", { name: /^Mudar o nome/ }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: /^Mudar o nome/ })).toBeNull();
    expect(chamadasDe("cat_guardar_categoria_produto")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(`gn-${C1}`)));
  });

  it("o anúncio da ordenação diz a posição nova", async () => {
    const anunciar = await abrir();
    fireEvent.click(botao(sec("Casa de banho"), "Descer Casa de banho, posição 1 de 3"));
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("«Casa de banho» passou para a posição 2 de 3."));
  });

  it("o campo com erro fica aria-invalid", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT004", "Já existe uma categoria com este nome."));
    await abrir();
    fireEvent.click(botao(document, "Nova categoria"));
    fireEvent.change(screen.getByLabelText("Nome da categoria"), { target: { value: "Cozinha" } });
    fireEvent.click(botao(document, "Criar categoria"));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Nome da categoria")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Categorias: ativar, desativar e ordenar", () => {
  it("desativar: grava o estado, avisa (com as subcategorias que se desativaram em cascata) e relê", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : { data: { categoria: { id: C1 }, subcategorias_desativadas: 2 }, error: null });
    const anunciar = await abrir();
    fireEvent.click(botao(sec("Casa de banho"), "Desativar Casa de banho"));
    await waitFor(() => expect(chamadasDe("cat_estado_categoria_produto")).toHaveLength(1));
    expect(chamadasDe("cat_estado_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: C1, p_ativo: false });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Categoria «Casa de banho» desativada, e 2 subcategorias com ela."));
    expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2);
  });

  it("reativar uma categoria diz que as subcategorias se reativam uma a uma", async () => {
    await abrir();
    expect(within(sec("Antiguidades")).getByText(/subcategorias reativam-se uma a uma/)).toBeInTheDocument();
    fireEvent.click(botao(sec("Antiguidades"), "Reativar Antiguidades"));
    await waitFor(() => expect(chamadasDe("cat_estado_categoria_produto")[0].a).toEqual({ p_org: ORG, p_id: C3, p_ativo: true }));
  });

  it("uma subcategoria com a categoria desativada não se reativa: o botão está desligado e diz porquê", async () => {
    await abrir();
    const velhas = li(sec("Antiguidades"), "Velhas");
    expect(botao(velhas, "Reativar Velhas em Antiguidades")).toHaveAttribute("aria-disabled", "true");
    expect(velhas).toHaveTextContent("Reative primeiro a categoria");
  });

  it("subir e descer: manda TODAS as irmãs da organização (sem as partilhadas) na ordem nova", async () => {
    await abrir();
    fireEvent.click(botao(sec("Casa de banho"), "Descer Casa de banho, posição 1 de 3"));
    await waitFor(() => expect(chamadasDe("cat_reordenar_categorias")).toHaveLength(1));
    expect(chamadasDe("cat_reordenar_categorias")[0].a).toEqual({ p_org: ORG, p_pai: null, p_ids: [C2, C1, C3] });
    cleanup(); base.chamadas = [];
    await abrir();
    fireEvent.click(botao(li(sec("Casa de banho"), "Louças"), "Descer Louças em Casa de banho, posição 1 de 3"));
    await waitFor(() => expect(chamadasDe("cat_reordenar_categorias")).toHaveLength(1));
    expect(chamadasDe("cat_reordenar_categorias")[0].a).toEqual({ p_org: ORG, p_pai: C1, p_ids: [S2, S1, S3] });
  });

  it("a primeira não sobe e a última não desce; a partilhada fica fora da conta", async () => {
    await abrir();
    expect(botao(sec("Casa de banho"), "Subir Casa de banho, posição 1 de 3")).toHaveAttribute("aria-disabled", "true");
    expect(botao(sec("Antiguidades"), "Descer Antiguidades, posição 3 de 3")).toHaveAttribute("aria-disabled", "true");
    expect(botao(sec("Cozinha"), "Subir Cozinha, posição 2 de 3")).not.toHaveAttribute("aria-disabled");
  });

  it("depois de ordenar o foco fica no botão da mesma linha (ou no outro, se este ficou desligado)", async () => {
    await abrir();
    fireEvent.click(botao(sec("Casa de banho"), "Descer Casa de banho, posição 1 de 3"));
    await waitFor(() => expect(chamadasDe("cat_reordenar_categorias")).toHaveLength(1));
    await waitFor(() => expect(document.activeElement?.id).toMatch(/^(desc|sub)-/));
  });

  it("falha ao ordenar (CT002): mostra a mensagem junto do sítio e relê", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT002", "A ordem tem de trazer todas as categorias deste nível, e só essas."));
    await abrir();
    fireEvent.click(botao(sec("Cozinha"), "Subir Cozinha, posição 2 de 3"));
    expect(await screen.findByRole("alert")).toHaveTextContent("A ordem tem de trazer todas as categorias deste nível");
    expect(chamadasDe("cat_ler_categorias_gestao")).toHaveLength(2);
  });

  it("falha ao reler depois de gravar: avisa que a lista pode estar desatualizada", async () => {
    await abrir();
    let n = 0;
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? (++n, erro("XX000", "sem rede")) : { data: { ok: true }, error: null });
    fireEvent.click(botao(sec("Cozinha"), "Desativar Cozinha"));
    expect(await screen.findByText(/pode estar desatualizada/)).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Cozinha" })).toBeInTheDocument();
  });

  it("avisa o Catálogo (recarregar) depois de gravar, mesmo em falha", async () => {
    const real = REAL();
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: lido(), error: null } : erro("CT002", "x"));
    await abrir(real);
    fireEvent.click(botao(sec("Cozinha"), "Desativar Cozinha"));
    await waitFor(() => expect(real.recarregar).toHaveBeenCalledTimes(1));
  });
});
