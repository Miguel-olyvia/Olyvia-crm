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
import { MODELOS_ESCOLHA } from "./planta3d/modelos3dEscolha";
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
  fireEvent.click(screen.getByRole("combobox", { name: new RegExp(`^${combo}( |$)`) }));
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
    expect(screen.getByRole("combobox", { name: /^Filtrar por subcategoria( |$)/ })).toBeDisabled();
    expect(screen.getByText("Escolha primeiro a categoria.")).toBeInTheDocument();
    escolher("Filtrar por categoria", "Casa de banho");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("0001 · NOVO")).toBeNull();
    expect(screen.getByRole("combobox", { name: /^Filtrar por subcategoria( |$)/ })).toBeEnabled();
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
  it("mostra a nota e nenhuma ação (as únicas exceções são os botões do modelo 3D e do modelo 3D próprio, desativados e com a razão)", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.getByRole("note")).toHaveTextContent("Só de leitura");
    expect(screen.queryByRole("button", { name: "Novo modelo" })).toBeNull();
    const botoes = within(linha("0001 · SORTY")).queryAllByRole("button");
    expect(botoes).toHaveLength(2);
    expect(botoes.every((b) => b.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(botoes.map((b) => b.getAttribute("aria-label"))).toEqual(["Mudar o modelo 3D do modelo SORTY", "Modelo 3D próprio do modelo SORTY"]);
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
    fireEvent.click(screen.getByRole("combobox", { name: /^Subcategoria( |$)/ }));
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
    fireEvent.click(screen.getByRole("combobox", { name: /^Subcategoria( |$)/ }));
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
    fireEvent.click(screen.getByRole("combobox", { name: /^Subcategoria( |$)/ }));
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

// 27/11: o seletor de modelo 3D em cada Modelo (0001 SMOOTH…), igual ao das categorias e subcategorias (CampoModelo3D + definirModelo3d, alvo 'modelo').
describe("Modelos: Modelo 3D", () => {
  const catsComModelo = () => {
    const c = categorias();
    return { categorias: c.categorias.map((x) => ({ ...x, ...(x.id === C1 ? { modelo3d: "banheira" } : {}), subcategorias: x.subcategorias.map((s) => ({ ...s, ...(s.id === S1 ? { modelo3d: "sanita" } : {}) })) })) };
  };
  beforeEach(() => {
    base.responder = (f) => {
      if (f === "cat_ler_modelos_gestao") return { data: { modelos: modelos().modelos.map((m) => (m.id === M1 ? { ...m, modelo3d: "base_duche" } : m)) }, error: null };
      if (f === "cat_ler_categorias_gestao") return { data: catsComModelo(), error: null };
      if (f === "cat_definir_modelo_3d") return { data: { alvo: "modelo", id: M2, modelo: "bide", anterior: null }, error: null };
      return { data: { ok: true }, error: null };
    };
  });
  const abrirPainel = (linhaTexto: string, modelo: string) => fireEvent.click(within(linha(linhaTexto)).getByRole("button", { name: `Mudar o modelo 3D do modelo ${modelo}` }));
  const seletor = () => screen.getByRole("combobox", { name: /^Modelo 3D/ });
  const escolherModelo3d = (nome: string | null) => { fireEvent.click(seletor()); fireEvent.click(nome === null ? screen.getAllByRole("option")[0]! : screen.getByRole("option", { name: nome })); };

  it("cada modelo mostra o seu modelo 3D («Modelo 3D: Base de duche») ou «automático»", async () => {
    await abrir();
    expect(within(linha("0001 · SORTY")).getByText("Modelo 3D: Base de duche")).toBeInTheDocument();
    expect(within(linha("0002 · STONE PLUS")).getByText("Modelo 3D: automático")).toBeInTheDocument();
  });

  it("sem a chave modelo3d na leitura (migração por aplicar) tudo aparece como «automático», sem erros", async () => {
    base.responder = (f) => ({ data: f === "cat_ler_modelos_gestao" ? modelos() : categorias(), error: null });
    await abrir();
    expect(screen.getAllByText("Modelo 3D: automático")).toHaveLength(4);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("o seletor abre por baixo da linha, com a omissão «Automático (herda…)» da subcategoria, e a lista é a mesma das categorias", async () => {
    await abrir();
    const botaoAbrir = within(linha("0002 · STONE PLUS")).getByRole("button", { name: "Mudar o modelo 3D do modelo STONE PLUS" });
    expect(botaoAbrir).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botaoAbrir);
    expect(botaoAbrir).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(seletor()).toHaveTextContent("Automático (herda: Sanita de chão, da subcategoria Bases de Duche)"));
    expect(screen.getByText("Herdado da subcategoria Bases de Duche: Sanita de chão.")).toBeInTheDocument();
    fireEvent.click(seletor());
    expect(screen.getAllByRole("option")).toHaveLength(MODELOS_ESCOLHA.length + 1);
  });

  it("sem escolha na subcategoria, herda da categoria; sem nada, do classificador", async () => {
    base.responder = (f) => {
      if (f === "cat_ler_categorias_gestao") { const c = catsComModelo(); return { data: { categorias: c.categorias.map((x) => ({ ...x, subcategorias: x.subcategorias.map((s) => ({ ...s, modelo3d: null })) })) }, error: null }; }
      return { data: modelos(), error: null };
    };
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    await waitFor(() => expect(seletor()).toHaveTextContent("Automático (herda: Banheira, da categoria Casa de banho)"));
  });

  it("se a leitura das categorias falha, a omissão não afirma o classificador: diz que a herança não pôde ser lida (e a gravação continua possível)", async () => {
    base.responder = (f) => {
      if (f === "cat_ler_categorias_gestao") return erro("XX000", "boom");
      if (f === "cat_ler_modelos_gestao") return { data: modelos(), error: null };
      return { data: { alvo: "modelo", id: M2, modelo: "bide", anterior: null }, error: null };
    };
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    await waitFor(() => expect(seletor()).toHaveTextContent("Automático (herda do nível de cima)"));
    expect(screen.getByText(/não foi possível ler a escolha da subcategoria e da categoria/)).toBeInTheDocument();
    expect(screen.queryByText(/classificador/)).toBeNull();
    escolherModelo3d("Bidé");
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
  });

  it("enquanto as categorias ainda se leem, a omissão também é neutra (não «classificador»)", async () => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? new Promise(() => {}) : { data: modelos(), error: null });
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    expect(seletor()).toHaveTextContent("Automático (herda do nível de cima)");
    expect(screen.getByText(/a ler a escolha da subcategoria e da categoria/)).toBeInTheDocument();
    expect(screen.queryByText(/classificador/)).toBeNull();
  });

  it("escolher e guardar: grava com o alvo 'modelo' e o id do modelo, anuncia, relê a lista, fecha o painel e devolve o foco ao botão", async () => {
    const anunciar = await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    escolherModelo3d("Bidé");
    const antes = chamadasDe("cat_ler_modelos_gestao").length;
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_modelo_3d")[0]!.a).toEqual({ p_org: ORG, p_alvo: "modelo", p_id: M2, p_modelo: "bide" });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Modelo 3D de «STONE PLUS»: Bidé."));
    await waitFor(() => expect(chamadasDe("cat_ler_modelos_gestao").length).toBeGreaterThan(antes));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardar modelo 3D" })).toBeNull());
    await waitFor(() => expect(within(linha("0002 · STONE PLUS")).getByRole("button", { name: "Mudar o modelo 3D do modelo STONE PLUS" })).toHaveFocus());
  });

  it("voltar a «Automático» limpa: p_modelo null, e o aviso diz que herda", async () => {
    const anunciar = await abrir();
    abrirPainel("0001 · SORTY", "SORTY");
    expect(seletor()).toHaveTextContent("Base de duche");
    escolherModelo3d(null);
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_modelo_3d")[0]!.a).toEqual({ p_org: ORG, p_alvo: "modelo", p_id: M1, p_modelo: null });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Modelo 3D de «SORTY»: automático, herda do nível de cima."));
  });

  it("o botão de guardar só vale quando o modelo mudou", async () => {
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    const g = screen.getByRole("button", { name: "Guardar modelo 3D" });
    expect(g).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(g);
    expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(0);
  });

  it("Cancelar fecha sem gravar e devolve o foco ao botão", async () => {
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("button", { name: "Guardar modelo 3D" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Mudar o modelo 3D do modelo STONE PLUS" })).toHaveFocus());
    expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(0);
  });

  it("a recusa da base (CT003) aparece em português junto do seletor; o painel fica aberto e a lista relê-se", async () => {
    const orig = base.responder;
    base.responder = (f, a) => (f === "cat_definir_modelo_3d" ? erro("CT003", "Modelo não encontrado.") : orig(f, a));
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    escolherModelo3d("Bidé");
    const antes = chamadasDe("cat_ler_modelos_gestao").length;
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Modelo não encontrado.");
    expect(screen.getByRole("button", { name: "Guardar modelo 3D" })).toBeInTheDocument();
    expect(seletor()).toHaveTextContent("Bidé");
    expect(chamadasDe("cat_ler_modelos_gestao").length).toBeGreaterThan(antes);
  });

  it("um erro técnico da base nunca aparece em bruto: sai a frase em português", async () => {
    const orig = base.responder;
    base.responder = (f, a) => (f === "cat_definir_modelo_3d" ? erro("XX000", "duplicate key value violates unique constraint") : orig(f, a));
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    escolherModelo3d("Bidé");
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível gravar o modelo 3D.");
    expect(alerta.textContent).not.toMatch(/duplicate|violates/);
  });

  it("função por criar na base: «ainda não está disponível», em português", async () => {
    const orig = base.responder;
    base.responder = (f, a) => (f === "cat_definir_modelo_3d" ? erro("PGRST202", "Could not find the function public.cat_definir_modelo_3d") : orig(f, a));
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    escolherModelo3d("Bidé");
    fireEvent.click(screen.getByRole("button", { name: "Guardar modelo 3D" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/ainda não está disponível/);
  });

  it("enquanto grava, o seletor e os botões usam aria-disabled (não disabled) e o Cancelar não fecha", async () => {
    let largar!: (v: { data: unknown; error: unknown }) => void;
    const orig = base.responder;
    base.responder = (f, a) => (f === "cat_definir_modelo_3d" ? new Promise((r) => { largar = r; }) : orig(f, a));
    await abrir();
    abrirPainel("0002 · STONE PLUS", "STONE PLUS");
    escolherModelo3d("Bidé");
    const guardar = screen.getByRole("button", { name: "Guardar modelo 3D" });
    guardar.focus();
    fireEvent.click(guardar);
    await waitFor(() => expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(1));
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    for (const el of [seletor(), guardar, cancelar]) { expect(el).toHaveAttribute("aria-disabled", "true"); expect(el).not.toBeDisabled(); }
    expect(guardar).toHaveFocus();
    fireEvent.click(cancelar);
    expect(screen.getByRole("button", { name: "Guardar modelo 3D" })).toBeInTheDocument();
    largar({ data: { alvo: "modelo", id: M2, modelo: "bide", anterior: null }, error: null });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardar modelo 3D" })).toBeNull());
  });

  it("sem permissão de editar: o botão fica desativado, com a razão ligada, e o clique não abre nada", async () => {
    await abrir(REAL({ podeEditar: false }));
    const b = within(linha("0002 · STONE PLUS")).getByRole("button", { name: "Mudar o modelo 3D do modelo STONE PLUS" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(razao(b)).toBe("Só quem pode editar produtos muda o modelo 3D.");
    fireEvent.click(b);
    expect(screen.queryByRole("combobox", { name: /^Modelo 3D/ })).toBeNull();
    expect(chamadasDe("cat_definir_modelo_3d")).toHaveLength(0);
  });

  it("um modelo desativado também aceita modelo 3D; só abre um painel de cada vez (abrir o de renomear fecha o do 3D)", async () => {
    await abrir();
    abrirPainel("0007 · ZEUS", "ZEUS");
    expect(seletor()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renomear o modelo STONE PLUS" }));
    expect(screen.queryByRole("combobox", { name: /^Modelo 3D/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Nome do modelo" })).toBeInTheDocument();
  });
});
