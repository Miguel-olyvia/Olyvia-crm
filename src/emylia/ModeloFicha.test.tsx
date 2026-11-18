// 16/11 (20270118300000): o MODELO do produto na ficha (secção «Classificação»): o campo vem a seguir à Subcategoria, grava por cat_guardar_produto_modelo
// DEPOIS da classificação (o modelo tem de ser da subcategoria já gravada), um modelo novo cria-se na subcategoria do produto, mudar de subcategoria
// desliga o modelo, e a referência não muda sozinha (oferece-se recalcular). A base é simulada.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return { supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }), from: vi.fn(() => cadeia()) } };
});

import { FichaProduto } from "./FichaProduto";
import { reporCustos } from "./v2/custosStore";
import { reporCatalogo } from "./v2/catalogoStore";
import type { ModeloK, No, Produto } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PID = "11111111-2222-4333-8444-555555555555";
const PC1 = "c0000000-0000-4000-a000-000000000001", PS1 = "50000000-0000-4000-a000-000000000001", PS2 = "50000000-0000-4000-a000-000000000002";
const M1 = "e0000000-0000-4000-a000-000000000001", M2 = "e0000000-0000-4000-a000-000000000002", M3 = "e0000000-0000-4000-a000-000000000003", MNOVO = "e0000000-0000-4000-a000-000000000009";
const ARVORE: No[] = [{ id: "c1", n: "Casa de banho", pai: null }, { id: "s1", n: "Louças", pai: "c1" }, { id: "s2", n: "Torneiras", pai: "c1" }];
const MODELOS: ModeloK[] = [
  { id: M1, n: "SORTY", numero: 1, sub: "s2", ativo: true }, { id: M2, n: "STONE PLUS", numero: 2, sub: "s2", ativo: true }, { id: M3, n: "OUTRO", numero: 1, sub: "s1", ativo: true },
];
const PROD: Produto = { id: PID, n: "Torneira Teste", custo: 60, pvp: 100, un: "un", marca: "Grohe", fornecedor: "", data: "2026-10-01", no: "s2", modeloId: M1, modelo: "SORTY", modeloNumero: 1 };
const CATS = { categorias: [{ id: PC1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, sigla: "BC", subcategorias: [
  { id: PS1, nome: "Louças", ordem: 1, ativo: true, global: false, usados: 0, sigla: "LO" }, { id: PS2, nome: "Torneiras", ordem: 2, ativo: true, global: false, usados: 0, sigla: "TO" }] }] };
const ok = (data: unknown) => ({ data, error: null });
const erro = (code: string, message: string) => ({ data: null, error: { code, message } });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

beforeEach(() => {
  base.chamadas = [];
  base.responder = (f) => (f === "cat_produto_stock" ? ok({ gere_stock: true, pode_editar: true, armazens: [] }) : f === "cat_ler_categorias_gestao" ? ok(CATS)
    : f === "cat_guardar_modelo" ? ok({ modelo: { id: MNOVO, numero: 3 } }) : f === "cat_guardar_produto_tabelas" ? ok(PID) : ok({ ok: true }));
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

const real = (podeEditar = true): FichaProdutoReal => ({ org: ORG, podeEditar, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) });
const ficha = (o: { p?: Produto; r?: FichaProdutoReal; modelos?: ModeloK[] | undefined } = {}) => {
  const anunciar = vi.fn(), r = o.r ?? real();
  render(<FichaProduto p={o.p ?? PROD} min={28} alvo={35} voltar={vi.fn()} anunciar={anunciar} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={r} arvore={ARVORE} marcas={["Grohe"]}
    modelos={"modelos" in o ? o.modelos : MODELOS} />);
  return { anunciar, r, sec: screen.getByRole("region", { name: "Classificação" }) };
};
const combo = (ctx: HTMLElement, nome: string) => within(ctx).getByRole("combobox", { name: new RegExp(`^${nome}( |$)`) }) as HTMLButtonElement;
const escolher = (ctx: HTMLElement, campo: string, opcao: string) => { fireEvent.click(combo(ctx, campo)); fireEvent.click(screen.getByRole("option", { name: opcao })); };
const guardar = (sec: HTMLElement) => fireEvent.click(within(sec).getByRole("button", { name: "Guardar classificação" }));
const ordemDasChamadas = () => base.chamadas.map((c) => c.f).filter((f) => ["cat_guardar_produto_tabelas", "cat_ler_categorias_gestao", "cat_guardar_modelo", "cat_guardar_produto_modelo"].includes(f));

describe("ficha: o campo Modelo", () => {
  it("vem a seguir à Subcategoria, mostra o modelo atual com o número e só oferece os da subcategoria do produto", () => {
    const { sec } = ficha();
    const ordem = within(sec).getAllByRole("combobox").map((c) => document.querySelector(`label[for="${c.id}"]`)?.textContent ?? c.getAttribute("aria-label")); // o nome vem do rótulo visível quando o há
    expect(ordem).toEqual(["Marca", "Categoria", "Subcategoria", "Modelo"]);
    expect(combo(sec, "Modelo").textContent).toBe("0001 · SORTY");
    fireEvent.click(combo(sec, "Modelo"));
    expect(screen.getAllByRole("option").map((o) => o.textContent?.replace(/\s*\(escolhida\)$/, ""))).toEqual(["Sem modelo", "0001 · SORTY", "0002 · STONE PLUS", "Novo modelo…"]);
  });
  it("o cabeçalho da ficha mostra o modelo do produto", () => {
    ficha();
    expect(screen.getByText(/modelo 0001 · SORTY/)).toBeInTheDocument();
  });
  it("sem products.edit só se lê: «Modelo: 0001 · SORTY» (ou «sem modelo»), sem campo", () => {
    ficha({ r: real(false) });
    const sec = screen.getByRole("region", { name: "Classificação" });
    expect(within(sec).queryByRole("combobox")).toBeNull();
    expect(sec).toHaveTextContent("Modelo: 0001 · SORTY");
    cleanup();
    ficha({ r: real(false), p: { ...PROD, modeloId: undefined, modelo: undefined, modeloNumero: undefined } });
    expect(screen.getByRole("region", { name: "Classificação" })).toHaveTextContent("Modelo: sem modelo");
  });
  it("sem a lista de modelos na base o campo fica desativado, «Ainda não disponível nesta base», e a classificação continua a gravar-se", async () => {
    const { sec } = ficha({ modelos: undefined });
    expect(combo(sec, "Modelo")).toBeDisabled();
    expect(within(sec).getByText("Ainda não disponível nesta base")).toBeInTheDocument();
    const botao = within(sec).getByRole("button", { name: "Guardar classificação" });
    expect(botao).toHaveAccessibleDescription("Mude a marca, a categoria ou a subcategoria para guardar.");
  });
});

describe("ficha: gravar o modelo", () => {
  it("só o modelo mudou: não toca na classificação, liga o modelo, relê e oferece recalcular a referência (nunca sozinho)", async () => {
    const { sec, r, anunciar } = ficha();
    escolher(sec, "Modelo", "0002 · STONE PLUS");
    guardar(sec);
    await waitFor(() => expect(chamadasDe("cat_guardar_produto_modelo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_produto_modelo")[0].a).toEqual({ p_org: ORG, p_produto: PID, p_modelo: M2 });
    expect(chamadasDe("cat_guardar_produto_tabelas")).toHaveLength(0);
    expect(chamadasDe("cat_gerar_sku_produto")).toHaveLength(0);
    await within(sec).findByText("Modelo guardado.");
    expect(r.recarregar).toHaveBeenCalled();
    expect(anunciar).toHaveBeenCalledWith("Modelo de Torneira Teste guardado.");
    expect(screen.getByText(/A classificação ou os atributos mudaram/)).toBeInTheDocument();
  });
  it("«Sem modelo» desliga-o (p_modelo null)", async () => {
    const { sec } = ficha();
    escolher(sec, "Modelo", "Sem modelo");
    guardar(sec);
    await waitFor(() => expect(chamadasDe("cat_guardar_produto_modelo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_produto_modelo")[0].a).toMatchObject({ p_modelo: null });
  });
  it("mudar a subcategoria tira o modelo (é da subcategoria): guarda a classificação e depois desliga o modelo antigo", async () => {
    const { sec } = ficha();
    escolher(sec, "Subcategoria", "Louças");
    expect(combo(sec, "Modelo").textContent).toBe("Escolher…");
    guardar(sec);
    await waitFor(() => expect(chamadasDe("cat_guardar_produto_modelo")).toHaveLength(1));
    expect(ordemDasChamadas()).toEqual(["cat_guardar_produto_tabelas", "cat_guardar_produto_modelo"]);
    expect(chamadasDe("cat_guardar_produto_modelo")[0].a).toMatchObject({ p_modelo: null });
    await within(sec).findByText("Classificação e modelo guardados.");
  });
  it("mudar a subcategoria e escolher um modelo dela: classificação primeiro, modelo depois", async () => {
    const { sec } = ficha();
    escolher(sec, "Subcategoria", "Louças");
    escolher(sec, "Modelo", "0001 · OUTRO");
    guardar(sec);
    await waitFor(() => expect(chamadasDe("cat_guardar_produto_modelo")).toHaveLength(1));
    expect(ordemDasChamadas()).toEqual(["cat_guardar_produto_tabelas", "cat_guardar_produto_modelo"]);
    expect(chamadasDe("cat_guardar_produto_modelo")[0].a).toMatchObject({ p_modelo: M3 });
  });
  it("«Novo modelo…» cria-o na subcategoria do produto (achada pelos nomes, número automático) e liga-o, por esta ordem", async () => {
    const { sec } = ficha();
    fireEvent.click(combo(sec, "Modelo"));
    fireEvent.click(screen.getByRole("option", { name: "Novo modelo…" }));
    fireEvent.change(screen.getByLabelText("Nome do novo modelo"), { target: { value: "Rio" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(chamadasDe("cat_guardar_modelo")).toHaveLength(0); // pendente: nada se grava até «Guardar classificação»
    guardar(sec);
    await waitFor(() => expect(chamadasDe("cat_guardar_produto_modelo")).toHaveLength(1));
    expect(ordemDasChamadas()).toEqual(["cat_ler_categorias_gestao", "cat_guardar_modelo", "cat_guardar_produto_modelo"]);
    expect(chamadasDe("cat_guardar_modelo")[0].a).toEqual({ p_org: ORG, p_id: null, p_subcategoria: PS2, p_nome: "Rio", p_numero: null });
    expect(chamadasDe("cat_guardar_produto_modelo")[0].a).toEqual({ p_org: ORG, p_produto: PID, p_modelo: MNOVO });
  });
  it("se a classificação falha, o modelo não se grava, o erro aparece e o ecrã relê", async () => {
    base.responder = (f) => (f === "cat_guardar_produto_tabelas" ? erro("CT002", "A categoria está desativada.") : ok({ ok: true }));
    const { sec, r } = ficha();
    escolher(sec, "Subcategoria", "Louças");
    guardar(sec);
    expect(await within(sec).findByRole("alert")).toHaveTextContent("A categoria está desativada.");
    expect(chamadasDe("cat_guardar_produto_modelo")).toHaveLength(0);
    expect(r.recarregar).toHaveBeenCalled();
  });
  it("se a classificação grava e o modelo falha, diz que a classificação ficou guardada e porque o modelo não, e relê", async () => {
    base.responder = (f) => (f === "cat_guardar_produto_modelo" ? erro("CT002", "O modelo «OUTRO» não é da subcategoria deste produto.") : ok(f === "cat_guardar_produto_tabelas" ? PID : { ok: true }));
    const { sec, r } = ficha();
    escolher(sec, "Subcategoria", "Louças");
    escolher(sec, "Modelo", "0001 · OUTRO");
    guardar(sec);
    const a = await within(sec).findByRole("alert");
    expect(a).toHaveTextContent("A classificação ficou guardada, mas o modelo não: O modelo «OUTRO» não é da subcategoria deste produto.");
    expect(a.className).toContain("text-destructive");
    expect(r.recarregar).toHaveBeenCalled();
  });
  it("a guardar, o botão fica aria-disabled e um segundo clique não repete a gravação", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    base.responder = (f) => (f === "cat_guardar_produto_modelo" ? new Promise((res) => { soltar = res as never; }) : ok({ ok: true }));
    const { sec } = ficha();
    escolher(sec, "Modelo", "0002 · STONE PLUS");
    const botao = within(sec).getByRole("button", { name: "Guardar classificação" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    await waitFor(() => expect(botao).toHaveAttribute("aria-disabled", "true"));
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadasDe("cat_guardar_produto_modelo")).toHaveLength(1);
    soltar(ok({ ok: true }));
  });
  it("sem alterações o botão diz porquê: «Mude a marca, a categoria, a subcategoria ou o modelo para guardar.»", () => {
    const { sec } = ficha();
    expect(within(sec).getByRole("button", { name: "Guardar classificação" })).toHaveAccessibleDescription("Mude a marca, a categoria, a subcategoria ou o modelo para guardar.");
  });
});
