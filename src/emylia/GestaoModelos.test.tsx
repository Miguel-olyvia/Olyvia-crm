// 16/11: o separador «Modelos» da gestão do Catálogo (GestaoModelos.tsx): lista agrupada por categoria › subcategoria («0001 · SORTY»), pesquisa e filtros,
// criar (subcategoria + nome, número automático ou fixado), renomear e ativar/desativar. A base é simulada e confere-se o contrato das cat_*.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { GestaoModelos } from "./GestaoModelos";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const C1 = "c0000000-0000-4000-a000-000000000001", C2 = "c0000000-0000-4000-a000-000000000002";
const S1 = "50000000-0000-4000-a000-000000000001", S2 = "50000000-0000-4000-a000-000000000002", S3 = "50000000-0000-4000-a000-000000000003", S4 = "50000000-0000-4000-a000-000000000004";
const M1 = "e0000000-0000-4000-a000-000000000001", M2 = "e0000000-0000-4000-a000-000000000002", M3 = "e0000000-0000-4000-a000-000000000003", M4 = "e0000000-0000-4000-a000-000000000004";

const sub = (id: string, nome: string, ativo = true) => ({ id, nome, sigla: "XX", ativo });
const modelos = () => ({ modelos: [
  { id: M1, nome: "SORTY", numero: 1, ativo: true, usados: 3, subcategoria: sub(S1, "Bases de Duche"), categoria: { id: C1, nome: "Casa de banho", sigla: "CB" } },
  { id: M2, nome: "STONE PLUS", numero: 2, ativo: true, usados: 0, subcategoria: sub(S1, "Bases de Duche"), categoria: { id: C1, nome: "Casa de banho", sigla: "CB" } },
  { id: M3, nome: "ZEUS", numero: 7, ativo: false, usados: 1, subcategoria: sub(S1, "Bases de Duche"), categoria: { id: C1, nome: "Casa de banho", sigla: "CB" } },
  { id: M4, nome: "NOVO", numero: 1, ativo: false, usados: 0, subcategoria: sub(S4, "Antiga", false), categoria: { id: C2, nome: "Cozinha", sigla: "CZ" } },
] });
const categorias = () => ({ categorias: [
  { id: C1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 0, sigla: "CB", subcategorias: [
    { id: S1, nome: "Bases de Duche", ordem: 1, ativo: true, global: false, usados: 0, sigla: "BD" },
    { id: S2, nome: "Torneiras", ordem: 2, ativo: true, global: false, usados: 0, sigla: "TO" },
    { id: S3, nome: "Velha", ordem: 3, ativo: false, global: false, usados: 0, sigla: "VE" },
  ] },
  { id: C2, nome: "Cozinha", ordem: 2, ativo: true, global: false, usados: 0, sigla: "CZ", subcategorias: [{ id: S4, nome: "Antiga", ordem: 1, ativo: false, global: false, usados: 0, sigla: "AN" }] },
] });

const erro = (code: string, message: string) => ({ data: null, error: { code, message } });
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

beforeEach(() => {
  base.chamadas = [];
  base.responder = (f) => (f === "cat_ler_modelos_gestao" ? { data: modelos(), error: null } : f === "cat_ler_categorias_gestao" ? { data: categorias(), error: null } : { data: { modelo: { id: M1, numero: 3 } }, error: null });
});
afterEach(cleanup);

const abrir = async (r: FichaProdutoReal = REAL(), anunciar = vi.fn()) => {
  render(<GestaoModelos real={r} anunciar={anunciar} />);
  await screen.findByText("0001 · SORTY");
  return anunciar;
};
const linha = (texto: string) => screen.getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(texto))!;
const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();
const escolher = (combo: string, opcao: string) => {
  fireEvent.click(screen.getByRole("combobox", { name: combo }));
  fireEvent.click(screen.getAllByRole("option").find((o) => o.textContent?.startsWith(opcao))!);
};

describe("Modelos: ler, agrupar e filtrar", () => {
  it("lê com a organização e mostra, agrupados por categoria › subcategoria, o número com o nome, os produtos e o estado", async () => {
    await abrir();
    expect(chamadasDe("cat_ler_modelos_gestao")[0].a).toEqual({ p_org: ORG });
    expect(screen.getByRole("heading", { name: "Casa de banho › Bases de Duche" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cozinha › Antiga" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(linha("0001 · SORTY")).toHaveTextContent("3 produtos");
    expect(linha("0002 · STONE PLUS")).toHaveTextContent("0 produtos");
    expect(linha("0007 · ZEUS")).toHaveTextContent("desativado");
    expect(linha("0001 · SORTY")).not.toHaveTextContent("desativado");
  });

  it("a pesquisa filtra por nome (sem acentos) e por número, e anuncia a contagem numa região de estado", async () => {
    await abrir();
    const campo = screen.getByRole("searchbox", { name: "Procurar modelo" });
    fireEvent.change(campo, { target: { value: "stone" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("1 modelo", { selector: "[role=status]" })).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "0007" } });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(linha("0007 · ZEUS")).toBeTruthy();
    fireEvent.change(campo, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Nenhum modelo encontrado", { selector: "[role=status]" })).toBeInTheDocument();
  });

  it("o filtro por subcategoria está desativado, com a razão, até haver categoria; depois limita a lista", async () => {
    await abrir();
    expect(screen.getByRole("combobox", { name: "Filtrar por subcategoria" })).toBeDisabled();
    expect(screen.getByText("Escolha primeiro a categoria.")).toBeInTheDocument();
    escolher("Filtrar por categoria", "Casa de banho");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("0001 · NOVO")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filtrar por subcategoria" })).toBeEnabled();
    escolher("Filtrar por subcategoria", "Bases de Duche");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("sem modelos diz «Ainda não há modelos»", async () => {
    base.responder = (f) => ({ data: f === "cat_ler_modelos_gestao" ? { modelos: [] } : categorias(), error: null });
    render(<GestaoModelos real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Ainda não há modelos.")).toBeInTheDocument();
  });

  it("função por criar: diz «Ainda não disponível nesta base», sem botão de tentar de novo; sem permissão: a frase da base", async () => {
    base.responder = () => erro("PGRST202", "Could not find the function");
    render(<GestaoModelos real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Ainda não disponível nesta base")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    cleanup();
    base.responder = () => erro("CT001", "Sem permissão.");
    render(<GestaoModelos real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Não tem permissão para ver os modelos.")).toBeInTheDocument();
  });
});

describe("Modelos: só leitura sem products.edit", () => {
  it("mostra a nota e nenhuma ação", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.getByRole("note")).toHaveTextContent("Só de leitura");
    expect(screen.queryByRole("button", { name: "Novo modelo" })).toBeNull();
    expect(within(linha("0001 · SORTY")).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("Modelos: criar", () => {
  it("o botão fica desativado, com a razão, se não houver subcategorias ativas", async () => {
    base.responder = (f) => ({ data: f === "cat_ler_modelos_gestao" ? modelos() : { categorias: [] }, error: null });
    await abrir();
    const b = await waitFor(() => { const x = screen.getByRole("button", { name: "Novo modelo" }); expect(x).toHaveAttribute("aria-disabled", "true"); return x; });
    expect(razao(b)).toMatch(/Não há subcategorias ativas/);
  });

  it("escolhe-se a subcategoria (só as ativas) e o nome; mostra o próximo número; grava com número null e relê", async () => {
    const anunciar = await abrir();
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo modelo" })).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(screen.getByRole("button", { name: "Novo modelo" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Subcategoria" }));
    const opcoes = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opcoes).toEqual(["Casa de banho › Bases de Duche", "Casa de banho › Torneiras"]);
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(screen.getByText(/Deixe vazio para o seguinte: 0008/)).toBeInTheDocument();
    const criar = screen.getByRole("button", { name: "Criar modelo" });
    expect(criar).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByRole("textbox", { name: /Nome do modelo/ }), { target: { value: "  Zeus 2  " } });
    const antes = chamadasDe("cat_ler_modelos_gestao").length;
    fireEvent.click(screen.getByRole("button", { name: "Criar modelo" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_modelo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_modelo")[0].a).toEqual({ p_org: ORG, p_id: null, p_subcategoria: S1, p_nome: "Zeus 2", p_numero: null });
    await waitFor(() => expect(chamadasDe("cat_ler_modelos_gestao").length).toBeGreaterThan(antes));
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Modelo «Zeus 2» criado em «Bases de Duche» com o número 0003."));
    expect(screen.queryByRole("button", { name: "Criar modelo" })).toBeNull();
  });

  it("o campo «Número» fixa o número; um valor fora de 1 a 9999 explica porquê e não grava", async () => {
    await abrir();
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo modelo" })).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(screen.getByRole("button", { name: "Novo modelo" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Subcategoria" }));
    fireEvent.click(screen.getAllByRole("option")[1]);
    fireEvent.change(screen.getByRole("textbox", { name: /Nome do modelo/ }), { target: { value: "Rio" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Número/ }), { target: { value: "0" } });
    const criar = screen.getByRole("button", { name: "Criar modelo" });
    expect(criar).toHaveAttribute("aria-disabled", "true");
    expect(razao(criar)).toBe("O número vai de 1 a 9999.");
    fireEvent.click(criar);
    expect(chamadasDe("cat_guardar_modelo")).toHaveLength(0);
    fireEvent.change(screen.getByRole("textbox", { name: /Número/ }), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar modelo" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_modelo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_modelo")[0].a).toMatchObject({ p_subcategoria: S2, p_nome: "Rio", p_numero: 12 });
  });

  it("um erro da base (número ou nome repetido, CT004) fica no formulário, que continua aberto, e a lista relê-se", async () => {
    base.responder = (f) => (f === "cat_guardar_modelo" ? erro("CT004", "Já existe um modelo com o número 0012 nesta subcategoria.") : f === "cat_ler_modelos_gestao" ? { data: modelos(), error: null } : { data: categorias(), error: null });
    await abrir();
    await waitFor(() => expect(screen.getByRole("button", { name: "Novo modelo" })).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(screen.getByRole("button", { name: "Novo modelo" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Subcategoria" }));
    fireEvent.click(screen.getAllByRole("option")[0]);
    fireEvent.change(screen.getByRole("textbox", { name: /Nome do modelo/ }), { target: { value: "Rio" } });
    const antes = chamadasDe("cat_ler_modelos_gestao").length;
    fireEvent.click(screen.getByRole("button", { name: "Criar modelo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe um modelo com o número 0012 nesta subcategoria.");
    expect(screen.getByRole("button", { name: "Criar modelo" })).toBeInTheDocument();
    expect(chamadasDe("cat_ler_modelos_gestao").length).toBeGreaterThan(antes);
  });
});

describe("Modelos: renomear e ativar", () => {
  it("renomear um modelo sem produtos grava logo (só o nome: sem subcategoria nem número) e devolve o foco ao botão", async () => {
    const anunciar = await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Renomear o modelo STONE PLUS" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do modelo" }), { target: { value: "STONE MAX" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nome" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_modelo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_modelo")[0].a).toEqual({ p_org: ORG, p_id: M2, p_subcategoria: null, p_nome: "STONE MAX", p_numero: null });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Modelo «STONE MAX» guardado."));
    await waitFor(() => expect(screen.getByRole("button", { name: "Renomear o modelo STONE PLUS" })).toHaveFocus());
  });

  it("renomear um modelo usado por produtos pede confirmação, com o número a dizer que não muda; «Voltar» não grava", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Renomear o modelo SORTY" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nome do modelo" }), { target: { value: "SORTY 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nome" }));
    const grupo = await screen.findByRole("group");
    expect(grupo).toHaveTextContent("Mudar o nome de «SORTY» para «SORTY 2»?");
    expect(grupo).toHaveTextContent("3 produtos");
    expect(grupo).toHaveTextContent("O número 0001 não muda");
    expect(chamadasDe("cat_guardar_modelo")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(chamadasDe("cat_guardar_modelo")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Guardar nome" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_modelo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_modelo")[0].a).toMatchObject({ p_id: M1, p_nome: "SORTY 2" });
  });

  it("desativa e reativa com cat_estado_modelo, anuncia e relê", async () => {
    const anunciar = await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desativar o modelo SORTY" }));
    await waitFor(() => expect(chamadasDe("cat_estado_modelo")).toHaveLength(1));
    expect(chamadasDe("cat_estado_modelo")[0].a).toEqual({ p_org: ORG, p_id: M1, p_ativo: false });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Modelo «SORTY» desativado."));
    fireEvent.click(screen.getByRole("button", { name: "Reativar o modelo ZEUS" }));
    await waitFor(() => expect(chamadasDe("cat_estado_modelo")).toHaveLength(2));
    expect(chamadasDe("cat_estado_modelo")[1].a).toEqual({ p_org: ORG, p_id: M3, p_ativo: true });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Modelo «ZEUS» reativado."));
  });

  it("um modelo desativado numa subcategoria desativada não se reativa: aria-disabled com a razão, e o clique não faz nada", async () => {
    await abrir();
    const b = screen.getByRole("button", { name: "Reativar o modelo NOVO" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(razao(b)).toBe("Reative primeiro a subcategoria na aba Subcategorias.");
    fireEvent.click(b);
    expect(chamadasDe("cat_estado_modelo")).toHaveLength(0);
  });

  it("um erro ao mudar o estado fica na linha, a vermelho, e a lista relê-se na mesma", async () => {
    base.responder = (f) => (f === "cat_estado_modelo" ? erro("CT002", "Esta organização já tem o máximo de modelos ativos (2000).") : f === "cat_ler_modelos_gestao" ? { data: modelos(), error: null } : { data: categorias(), error: null });
    await abrir();
    const antes = chamadasDe("cat_ler_modelos_gestao").length;
    fireEvent.click(screen.getByRole("button", { name: "Reativar o modelo ZEUS" }));
    const alerta = await within(linha("0007 · ZEUS")).findByRole("alert");
    expect(alerta).toHaveTextContent("máximo de modelos ativos");
    expect(alerta.className).toContain("text-red-700");
    expect(chamadasDe("cat_ler_modelos_gestao").length).toBeGreaterThan(antes);
  });
});
