// 16/11: a referência (SKU) na ficha do produto: «Gerar/Recalcular referência» (só com products.edit), a confirmação no ecrã quando a atual foi escrita
// à mão (só então se força), as faltas em texto, e a oferta de recalcular depois de mudar a classificação ou os atributos (nunca sozinho).
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
  return {
    supabase: {
      rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }),
      from: vi.fn(() => cadeia()),
    },
  };
});

import { FichaProduto } from "./FichaProduto";
import { reporCustos } from "./v2/custosStore";
import { reporCatalogo } from "./v2/catalogoStore";
import type { AtributoDef, No, Produto } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const PID = "11111111-2222-4333-8444-555555555555";
const PC1 = "c0000000-0000-4000-a000-000000000001", PS1 = "50000000-0000-4000-a000-000000000001";
const A_COR = "aaaaaaaa-0000-4000-a000-000000000001", O_AZUL = "bbbbbbbb-0000-4000-a000-000000000001";
const ARVORE: No[] = [{ id: "c1", n: "Casa de banho", pai: null }, { id: "s2", n: "Torneiras", pai: "c1" }, { id: "c2", n: "Cozinha", pai: null }];
const DEFS: AtributoDef[] = [{ id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: false, ordem: 1, opcoes: [{ id: O_AZUL, valor: "AZUL", nome: "Azul", hex: null, ordem: 1 }] }];
const PROD: Produto = { id: PID, n: "Torneira Teste", custo: 60, pvp: 100, un: "un", marca: "Grohe", fornecedor: "", data: "2026-10-01", no: "s2", sku: "BC-TO-0001-AZ", attrs: [{ atributoId: A_COR, opcaoId: O_AZUL, valor: "Azul" }] };
const real = (podeEditar = true): FichaProdutoReal => ({ org: ORG, podeEditar, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);
const ok = (data: unknown) => ({ data, error: null });
const erro = (code: string, message: string) => ({ data: null, error: { code, message } });
const GERADO = { sku: "BC-TO-0002-AZ", gerado: true, faltas: [], motivo: null };

const ficha = (p: Produto = PROD, r: FichaProdutoReal = real(), extra: { tipo?: "produto" | "consumivel" } = {}) => {
  const anunciar = vi.fn();
  render(<FichaProduto p={p} min={28} alvo={35} voltar={vi.fn()} anunciar={anunciar} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={r} arvore={ARVORE} marcas={["Grohe"]} atributos={DEFS} {...extra} />);
  return { anunciar, r };
};
const botao = () => screen.getByRole("button", { name: /(Gerar|Recalcular) referência/ });
const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();

beforeEach(() => {
  base.chamadas = [];
  base.responder = (f) => (f === "cat_produto_stock" ? ok({ gere_stock: true, pode_editar: true, armazens: [] })
    : f === "cat_gerar_sku_produto" ? ok(GERADO)
    : f === "cat_ler_categorias_gestao" ? ok({ categorias: [{ id: PC1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, sigla: "BC", subcategorias: [{ id: PS1, nome: "Torneiras", ordem: 1, ativo: true, global: false, usados: 0, sigla: "TO" }] }] })
    : f === "cat_prever_sku" ? ok({ sku: "BC-TO-0003-AZ", faltas: [] }) : ok({ ok: true }));
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("Ficha: botão de gerar/recalcular a referência", () => {
  it("só com products.edit, na ficha real de um produto (nem sem permissão, nem consumível, nem sem página real)", () => {
    ficha(PROD, real(false));
    expect(screen.queryByRole("button", { name: /referência/ })).toBeNull();
    cleanup();
    ficha({ ...PROD }, real(true), { tipo: "consumivel" });
    expect(screen.queryByRole("button", { name: /referência/ })).toBeNull();
    cleanup();
    render(<FichaProduto p={PROD} min={28} alvo={35} voltar={vi.fn()} anunciar={vi.fn()} nomeServico={(s) => s} onAbrirServico={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /referência/ })).toBeNull();
  });
  it("«Gerar referência» quando não há (ou é a provisória CAT-…); «Recalcular referência» quando já há uma", () => {
    ficha({ ...PROD, sku: undefined });
    expect(botao()).toHaveTextContent("Gerar referência");
    cleanup();
    ficha({ ...PROD, sku: "CAT-0A1B2C3D4E" });
    expect(botao()).toHaveTextContent("Gerar referência");
    cleanup();
    ficha();
    expect(botao()).toHaveTextContent("Recalcular referência");
  });
  it("gera: chama cat_gerar_sku_produto sem forçar, anuncia a nova referência e relê o Catálogo", async () => {
    const { anunciar, r } = ficha();
    fireEvent.click(botao());
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Referência gerada: BC-TO-0002-AZ."));
    expect(chamadasDe("cat_gerar_sku_produto")).toHaveLength(1);
    expect(chamadasDe("cat_gerar_sku_produto")[0].a).toEqual({ p_org: ORG, p_produto: PID, p_forcar: false });
    expect(r.recarregar).toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /escrita à mão/ })).toBeNull();
  });
  it("guarda de reentrada: dois cliques seguidos fazem uma só chamada, e o botão diz porquê enquanto trabalha", async () => {
    let soltar: (v: unknown) => void = () => {};
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? new Promise((res) => { soltar = res as never; }) : f === "cat_produto_stock" ? ok({ gere_stock: true, pode_editar: true, armazens: [] }) : ok({ ok: true }));
    const { anunciar } = ficha();
    fireEvent.click(botao());
    fireEvent.click(botao());
    await waitFor(() => expect(botao()).toHaveAttribute("aria-disabled", "true"));
    expect(razao(botao())).toBe("A gerar a referência…");
    expect(chamadasDe("cat_gerar_sku_produto")).toHaveLength(1);
    soltar(ok(GERADO));
    await waitFor(() => expect(anunciar).toHaveBeenCalled());
    await waitFor(() => expect(botao()).not.toHaveAttribute("aria-disabled"));
  });
  it("faltam siglas: mostra as faltas em texto, com o nome da categoria, e não relê nem anuncia como gerada", async () => {
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? ok({ sku: "X", gerado: false, faltas: ["sigla_categoria", "sigla:cor"], motivo: "faltas" }) : ok({ ok: true }));
    const { anunciar } = ficha();
    fireEvent.click(botao());
    await waitFor(() => expect(screen.getByRole("status", { name: "Resultado da referência" })).toHaveTextContent("Falta a sigla da categoria «Casa de banho»"));
    expect(screen.getByRole("status", { name: "Resultado da referência" })).toHaveTextContent("Falta a sigla da opção escolhida em «Cor»");
    expect(anunciar).not.toHaveBeenCalledWith(expect.stringContaining("Referência gerada"));
  });
  it("referência escrita à mão: pede confirmação no ecrã com a nova, e só depois de confirmar chama com p_forcar=true", async () => {
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? ok({ sku: "GR-77", gerado: false, faltas: [], motivo: "sku_manual" }) : f === "cat_ler_categorias_gestao" ? ok({ categorias: [{ id: PC1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, sigla: "BC", subcategorias: [{ id: PS1, nome: "Torneiras", ordem: 1, ativo: true, global: false, usados: 0, sigla: "TO" }] }] }) : f === "cat_prever_sku" ? ok({ sku: "BC-TO-0003-AZ", faltas: [] }) : ok({ ok: true }));
    const { anunciar, r } = ficha({ ...PROD, sku: "GR-77" });
    fireEvent.click(botao());
    const grupo = await screen.findByRole("group", { name: "A referência atual foi escrita à mão: substituir por BC-TO-0003-AZ?" });
    expect(grupo).toHaveFocus();
    expect(chamadasDe("cat_prever_sku")[0].a).toEqual({ p_org: ORG, p_categoria: PC1, p_subcategoria: PS1, p_atributos: [{ atributo: A_COR, opcao: O_AZUL }] });
    expect(chamadasDe("cat_gerar_sku_produto").map((c) => c.a.p_forcar)).toEqual([false]);
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? ok({ sku: "BC-TO-0003-AZ", gerado: true, faltas: [], motivo: null }) : ok({ ok: true }));
    fireEvent.click(within(grupo).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Referência gerada: BC-TO-0003-AZ."));
    expect(chamadasDe("cat_gerar_sku_produto").map((c) => c.a.p_forcar)).toEqual([false, true]);
    expect(r.recarregar).toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /escrita à mão/ })).toBeNull();
  });
  it("«Voltar» na confirmação não muda nada, não força e devolve o foco ao botão; Esc faz o mesmo", async () => {
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? ok({ sku: "GR-77", gerado: false, faltas: [], motivo: "sku_manual" }) : f === "cat_ler_categorias_gestao" ? erro("CT001", "Sem permissão.") : ok({ ok: true }));
    ficha({ ...PROD, sku: "GR-77" });
    fireEvent.click(botao());
    // sem a nova (a leitura falhou) a pergunta continua a fazer-se, sem inventar a referência
    const grupo = await screen.findByRole("group", { name: "A referência atual foi escrita à mão: substituir por uma referência gerada?" });
    fireEvent.click(within(grupo).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("group", { name: /escrita à mão/ })).toBeNull();
    await waitFor(() => expect(botao()).toHaveFocus());
    fireEvent.click(botao());
    const g2 = await screen.findByRole("group", { name: /escrita à mão/ });
    fireEvent.keyDown(g2, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /escrita à mão/ })).toBeNull();
    expect(chamadasDe("cat_gerar_sku_produto").every((c) => c.a.p_forcar === false)).toBe(true);
  });
  it("erro da base: aparece junto ao botão em vermelho acessível; função por aplicar: «Ainda não disponível nesta base»", async () => {
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? erro("CT002", "Já não há números livres (9999) para o SKU BC-TO.") : ok({ ok: true }));
    ficha();
    fireEvent.click(botao());
    const a = await screen.findByRole("alert");
    expect(a).toHaveTextContent("Já não há números livres (9999) para o SKU BC-TO.");
    expect(a.className).toMatch(/text-red-700 dark:text-red-400/);
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? erro("PGRST202", "Could not find the function") : ok({ ok: true }));
    fireEvent.click(botao());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Ainda não disponível nesta base"));
  });
});

describe("Ficha: casos de borda da confirmação", () => {
  const MANUAL = { sku: "GR-77", gerado: false, faltas: [], motivo: "sku_manual" };
  const cat = (id: string, subs: unknown[] = []) => ({ id, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, sigla: "BC", subcategorias: subs });
  it("duas categorias com o mesmo nome: não adivinha a nova referência, não prevê, e diz porquê na confirmação", async () => {
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? ok(MANUAL) : f === "cat_ler_categorias_gestao" ? ok({ categorias: [cat(PC1), cat("c0000000-0000-4000-a000-000000000009")] }) : ok({ ok: true }));
    ficha({ ...PROD, sku: "GR-77", no: "c1" });
    fireEvent.click(botao());
    const grupo = await screen.findByRole("group", { name: "A referência atual foi escrita à mão: substituir por uma referência gerada?" });
    expect(grupo).toHaveTextContent("Não é possível prever: há categorias com o mesmo nome.");
    expect(chamadasDe("cat_prever_sku")).toHaveLength(0);
  });
  it("se forçar falha, o erro aparece num só sítio (na confirmação, que continua aberta)", async () => {
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? ok(MANUAL) : f === "cat_ler_categorias_gestao" ? erro("CT001", "Sem permissão.") : ok({ ok: true }));
    ficha({ ...PROD, sku: "GR-77" });
    fireEvent.click(botao());
    const grupo = await screen.findByRole("group", { name: /escrita à mão/ });
    base.responder = (f) => (f === "cat_gerar_sku_produto" ? erro("CT002", "Já não há números livres (9999).") : ok({ ok: true }));
    fireEvent.click(within(grupo).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
    expect(within(screen.getByRole("group", { name: /escrita à mão/ })).getByRole("alert")).toHaveTextContent("Já não há números livres (9999).");
  });
  it("uma classificação que falha ao guardar NÃO acende a oferta de recalcular", async () => {
    base.responder = (f) => (f === "cat_guardar_produto_tabelas" ? erro("CT002", "Não foi possível.") : f === "cat_produto_stock" ? ok({ gere_stock: true, pode_editar: true, armazens: [] }) : ok({ ok: true }));
    ficha();
    const sec = screen.getByRole("region", { name: "Classificação" });
    fireEvent.click(within(sec).getByRole("combobox", { name: "Categoria" }));
    fireEvent.click(screen.getByRole("option", { name: "Cozinha" })); // a lista flutua no body
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar classificação" }));
    await waitFor(() => expect(within(sec).getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText(/A referência não muda sozinha/)).toBeNull();
  });
});

describe("Ficha: depois de mudar a classificação, oferece recalcular (não recalcula sozinho)", () => {
  it("guardar a classificação mostra a oferta, sem chamar cat_gerar_sku_produto", async () => {
    ficha();
    expect(screen.queryByText(/não muda sozinha/)).toBeNull();
    const sec = screen.getByRole("region", { name: "Classificação" });
    fireEvent.click(within(sec).getByRole("combobox", { name: "Categoria" }));
    fireEvent.click(screen.getByRole("option", { name: "Cozinha" }));
    fireEvent.click(within(sec).getByRole("button", { name: "Guardar classificação" }));
    await waitFor(() => expect(screen.getByText(/A referência não muda sozinha/)).toBeInTheDocument());
    expect(chamadasDe("cat_gerar_sku_produto")).toHaveLength(0);
    expect(botao()).toBeInTheDocument();
  });
});
