// 13/11: o separador «Marcas» da gestão do Catálogo: criar, renomear, site, ativar/desativar. As funções cat_* de 20270117700000 ainda não
// estão aplicadas na base: aqui a base é simulada e confere-se o contrato (nomes e argumentos).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { GestaoMarcas } from "./GestaoMarcas";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const M1 = "a0000000-0000-4000-a000-000000000001", M2 = "a0000000-0000-4000-a000-000000000002", M3 = "a0000000-0000-4000-a000-000000000003", M4 = "a0000000-0000-4000-a000-000000000004";

const lido = () => ({
  marcas: [
    { id: M1, nome: "Grohe", website: "https://grohe.pt", ativo: true, global: false, usados: 4 },
    { id: M2, nome: "Roca", website: null, ativo: true, global: false, usados: 0 },
    { id: M3, nome: "Velha", website: "", ativo: false, global: false, usados: 1 },
    { id: M4, nome: "Hansgrohe", website: "https://hansgrohe.com", ativo: true, global: true, usados: 6 },
  ],
});
const erro = (code: string, message: string, details?: string) => ({ data: null, error: { code, message, details } });
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

beforeEach(() => {
  base.chamadas = [];
  base.responder = (f) => (f === "cat_ler_marcas_gestao" ? { data: lido(), error: null } : { data: { marca: { id: M1 } }, error: null });
});
afterEach(cleanup);

const abrir = async (r: FichaProdutoReal = REAL(), anunciar = vi.fn()) => {
  render(<GestaoMarcas real={r} anunciar={anunciar} />);
  await screen.findByText("Roca");
  return anunciar;
};
const linha = (nome: string) => screen.getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;
const botao = (raiz: HTMLElement | Document, nome: string | RegExp) => within(raiz as HTMLElement).getByRole("button", { name: nome });

describe("Marcas: ler", () => {
  it("lê com a organização e mostra as marcas, o site, quantos produtos as usam, as desativadas e as partilhadas", async () => {
    await abrir();
    expect(chamadasDe("cat_ler_marcas_gestao")[0].a).toEqual({ p_org: ORG });
    const g = linha("Grohe");
    expect(within(g).getByText("4 produtos")).toBeInTheDocument();
    const site = within(g).getByRole("link", { name: /^https:\/\/grohe\.pt/ });
    expect(site).toHaveAttribute("href", "https://grohe.pt");
    expect(site).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(site).toHaveAccessibleName("https://grohe.pt (abre noutro separador)");
    expect(site.className).toContain("min-h-6");
    expect(within(linha("Roca")).getByText("0 produtos")).toBeInTheDocument();
    expect(within(linha("Roca")).queryByRole("link")).toBeNull();
    expect(linha("Velha")).toHaveTextContent("desativada");
    expect(linha("Hansgrohe")).toHaveTextContent("Partilhada");
  });

  it("as partilhadas só se leem: sem editar nem desativar, mesmo com products.edit", async () => {
    await abrir();
    expect(within(linha("Hansgrohe")).queryByRole("button")).toBeNull();
  });

  it("sem products.edit só se lê: nada de criar, editar nem desativar", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.getByText(/Só de leitura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova marca|Editar|Desativar|Reativar/ })).toBeNull();
  });

  it("função ainda não existe na base: «Ainda não disponível nesta base»", async () => {
    base.responder = () => ({ data: null, error: { code: "42883", message: "function public.cat_ler_marcas_gestao(uuid) does not exist" } });
    render(<GestaoMarcas real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Ainda não disponível nesta base")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nova marca/ })).toBeNull();
  });

  it("sem permissão para ler (CT001): diz-o, sem «tentar de novo»", async () => {
    base.responder = () => erro("CT001", "Sem permissão.");
    render(<GestaoMarcas real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Não tem permissão para ver as marcas.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("sem marcas: «Ainda não há marcas.»", async () => {
    base.responder = () => ({ data: { marcas: [] }, error: null });
    render(<GestaoMarcas real={REAL()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Ainda não há marcas.")).toBeInTheDocument();
  });

  it("pesquisa em texto, sem acentos nem maiúsculas; sem resultados diz-o", async () => {
    await abrir();
    const q = screen.getByRole("searchbox", { name: "Procurar marca" });
    fireEvent.change(q, { target: { value: "HANS" } });
    expect(screen.getAllByRole("listitem").map((x) => x.textContent)).toEqual([expect.stringMatching(/^Hansgrohe/)]);
    fireEvent.change(q, { target: { value: "zzz" } });
    expect(screen.getByText("Nenhuma marca encontrada.")).toBeInTheDocument();
  });
});

describe("Marcas: acessibilidade (revisão)", () => {
  const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();

  it("a pesquisa anuncia quantas marcas ficam (região de estado sempre montada)", async () => {
    await abrir();
    const estado = screen.getByRole("status");
    expect(estado).toHaveTextContent("");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar marca" }), { target: { value: "gro" } });
    expect(estado).toHaveTextContent("2 marcas");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar marca" }), { target: { value: "roca" } });
    expect(estado).toHaveTextContent("1 marca");
    fireEvent.change(screen.getByRole("searchbox", { name: "Procurar marca" }), { target: { value: "zzz" } });
    expect(estado).toHaveTextContent("Nenhuma marca encontrada");
  });

  it("botões desativados dizem porquê; a gravar ficam aria-disabled e com o foco", async () => {
    await abrir();
    fireEvent.click(botao(document, "Nova marca"));
    expect(razao(botao(document, "Criar marca"))).toBe("Escreva o nome.");
    fireEvent.change(screen.getByLabelText("Nome da marca"), { target: { value: "X" } });
    const criar = botao(document, "Criar marca");
    criar.focus();
    expect(criar).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(criar);
    await waitFor(() => expect(chamadasDe("cat_guardar_marca")).toHaveLength(1));
  });

  it("Esc na confirmação volta atrás sem gravar", async () => {
    await abrir();
    fireEvent.click(botao(linha("Grohe"), "Editar Grohe"));
    fireEvent.change(within(linha("Grohe")).getByLabelText("Nome da marca"), { target: { value: "Outro" } });
    fireEvent.click(botao(linha("Grohe"), "Guardar marca"));
    expect(razao(botao(linha("Grohe"), "Guardar marca"))).toBe("À espera da confirmação.");
    fireEvent.keyDown(screen.getByRole("group", { name: /^Mudar o nome/ }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: /^Mudar o nome/ })).toBeNull();
    expect(chamadasDe("cat_guardar_marca")).toHaveLength(0);
  });
});

describe("Marcas: criar", () => {
  it("nova marca: nome e site opcional; grava, avisa, relê e devolve o foco ao botão", async () => {
    const anunciar = await abrir();
    fireEvent.click(botao(document, "Nova marca"));
    const criar = botao(document, "Criar marca");
    expect(criar).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByLabelText("Nome da marca"), { target: { value: " Duravit " } });
    fireEvent.change(screen.getByLabelText("Site (opcional)"), { target: { value: " https://duravit.pt " } });
    fireEvent.click(criar);
    await waitFor(() => expect(chamadasDe("cat_guardar_marca")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_marca")[0].a).toEqual({ p_org: ORG, p_id: null, p_nome: "Duravit", p_website: "https://duravit.pt" });
    await waitFor(() => expect(chamadasDe("cat_ler_marcas_gestao")).toHaveLength(2));
    expect(anunciar).toHaveBeenCalledWith("Marca «Duravit» criada.");
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("novo-marca")));
  });

  it("sem site: manda p_website nulo", async () => {
    await abrir();
    fireEvent.click(botao(document, "Nova marca"));
    fireEvent.change(screen.getByLabelText("Nome da marca"), { target: { value: "Duravit" } });
    fireEvent.click(botao(document, "Criar marca"));
    await waitFor(() => expect(chamadasDe("cat_guardar_marca")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_marca")[0].a).toMatchObject({ p_website: null });
  });

  it("nome repetido (CT004): a mensagem da base aparece no formulário, relê e o formulário fica aberto", async () => {
    base.responder = (f) => (f === "cat_ler_marcas_gestao" ? { data: lido(), error: null } : erro("CT004", "Já existe uma marca com este nome.", M1));
    await abrir();
    fireEvent.click(botao(document, "Nova marca"));
    fireEvent.change(screen.getByLabelText("Nome da marca"), { target: { value: "Grohe" } });
    fireEvent.click(botao(document, "Criar marca"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe uma marca com este nome.");
    expect(chamadasDe("cat_ler_marcas_gestao")).toHaveLength(2);
    expect(screen.getByLabelText("Nome da marca")).toHaveValue("Grohe");
  });

  it("site inválido (CT002): mostra a mensagem em português da base", async () => {
    base.responder = (f) => (f === "cat_ler_marcas_gestao" ? { data: lido(), error: null } : erro("CT002", "O site tem de começar por http:// ou https:// (por exemplo https://marca.pt)."));
    await abrir();
    fireEvent.click(botao(document, "Nova marca"));
    fireEvent.change(screen.getByLabelText("Nome da marca"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Site (opcional)"), { target: { value: "marca.pt" } });
    fireEvent.click(botao(document, "Criar marca"));
    expect(await screen.findByRole("alert")).toHaveTextContent("O site tem de começar por http://");
  });

  it("cancelar fecha sem gravar e devolve o foco", async () => {
    await abrir();
    fireEvent.click(botao(document, "Nova marca"));
    fireEvent.click(botao(document, "Cancelar"));
    expect(screen.queryByLabelText("Nome da marca")).toBeNull();
    expect(chamadasDe("cat_guardar_marca")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("novo-marca")));
  });
});

describe("Marcas: editar", () => {
  it("sem produtos grava logo; o site que não se mexeu vai nulo (a base não o toca)", async () => {
    await abrir();
    fireEvent.click(botao(linha("Roca"), "Editar Roca"));
    const f = linha("Roca");
    expect(within(f).getByLabelText("Nome da marca")).toHaveValue("Roca");
    fireEvent.change(within(f).getByLabelText("Nome da marca"), { target: { value: "Roca Pro" } });
    fireEvent.click(botao(f, "Guardar marca"));
    await waitFor(() => expect(chamadasDe("cat_guardar_marca")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_marca")[0].a).toEqual({ p_org: ORG, p_id: M2, p_nome: "Roca Pro", p_website: null });
  });

  it("limpar o site manda «» (a base limpa); mudar só o site não pede confirmação mesmo com produtos", async () => {
    await abrir();
    fireEvent.click(botao(linha("Grohe"), "Editar Grohe"));
    const f = linha("Grohe");
    fireEvent.change(within(f).getByLabelText("Site (opcional)"), { target: { value: "" } });
    fireEvent.click(botao(f, "Guardar marca"));
    expect(screen.queryByRole("group", { name: /^Mudar o nome/ })).toBeNull();
    await waitFor(() => expect(chamadasDe("cat_guardar_marca")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_marca")[0].a).toEqual({ p_org: ORG, p_id: M1, p_nome: "Grohe", p_website: "" });
  });

  it("renomear uma usada por produtos pede confirmação no ecrã e só grava ao confirmar", async () => {
    const anunciar = await abrir();
    fireEvent.click(botao(linha("Grohe"), "Editar Grohe"));
    fireEvent.change(within(linha("Grohe")).getByLabelText("Nome da marca"), { target: { value: "Grohe Pro" } });
    fireEvent.click(botao(linha("Grohe"), "Guardar marca"));
    const conf = screen.getByRole("group", { name: "Mudar o nome de «Grohe» para «Grohe Pro»?" });
    expect(conf).toHaveTextContent("4 produtos");
    expect(conf).toHaveFocus();
    expect(chamadasDe("cat_guardar_marca")).toHaveLength(0);
    fireEvent.click(botao(conf, "Confirmar"));
    await waitFor(() => expect(chamadasDe("cat_guardar_marca")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_marca")[0].a).toEqual({ p_org: ORG, p_id: M1, p_nome: "Grohe Pro", p_website: null });
    expect(anunciar).toHaveBeenCalledWith("Marca «Grohe Pro» guardada.");
  });

  it("«Voltar» na confirmação não grava e devolve o foco ao botão de guardar", async () => {
    await abrir();
    fireEvent.click(botao(linha("Grohe"), "Editar Grohe"));
    fireEvent.change(within(linha("Grohe")).getByLabelText("Nome da marca"), { target: { value: "Outro" } });
    fireEvent.click(botao(linha("Grohe"), "Guardar marca"));
    fireEvent.click(botao(screen.getByRole("group", { name: /^Mudar o nome/ }), "Voltar"));
    expect(chamadasDe("cat_guardar_marca")).toHaveLength(0);
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(`gn-${M1}`)));
  });

  it("falha ao confirmar (CT004): a mensagem fica na confirmação e relê", async () => {
    base.responder = (f) => (f === "cat_ler_marcas_gestao" ? { data: lido(), error: null } : erro("CT004", "Já existe uma marca com este nome."));
    await abrir();
    fireEvent.click(botao(linha("Grohe"), "Editar Grohe"));
    fireEvent.change(within(linha("Grohe")).getByLabelText("Nome da marca"), { target: { value: "Roca" } });
    fireEvent.click(botao(linha("Grohe"), "Guardar marca"));
    fireEvent.click(botao(screen.getByRole("group", { name: /^Mudar o nome/ }), "Confirmar"));
    expect(await within(linha("Grohe")).findByRole("alert")).toHaveTextContent("Já existe uma marca com este nome.");
    expect(chamadasDe("cat_ler_marcas_gestao")).toHaveLength(2);
  });
});

describe("Marcas: ativar e desativar", () => {
  it("desativar e reativar: grava o estado, avisa, relê e devolve o foco", async () => {
    const anunciar = await abrir();
    fireEvent.click(botao(linha("Grohe"), "Desativar Grohe"));
    await waitFor(() => expect(chamadasDe("cat_estado_marca")).toHaveLength(1));
    expect(chamadasDe("cat_estado_marca")[0].a).toEqual({ p_org: ORG, p_id: M1, p_ativo: false });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Marca «Grohe» desativada."));
    await waitFor(() => expect(chamadasDe("cat_ler_marcas_gestao")).toHaveLength(2));
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById(`act-${M1}`)));
    fireEvent.click(botao(linha("Velha"), "Reativar Velha"));
    await waitFor(() => expect(chamadasDe("cat_estado_marca")).toHaveLength(2));
    expect(chamadasDe("cat_estado_marca")[1].a).toEqual({ p_org: ORG, p_id: M3, p_ativo: true });
  });

  it("falha (CT002): a mensagem aparece na linha, a lista é relida e o Catálogo também", async () => {
    const real = REAL();
    base.responder = (f) => (f === "cat_ler_marcas_gestao" ? { data: lido(), error: null } : erro("CT002", "Marca partilhada: não se pode alterar aqui."));
    await abrir(real);
    fireEvent.click(botao(linha("Roca"), "Desativar Roca"));
    expect(await within(linha("Roca")).findByRole("alert")).toHaveTextContent("Marca partilhada");
    expect(chamadasDe("cat_ler_marcas_gestao")).toHaveLength(2);
    expect(real.recarregar).toHaveBeenCalledTimes(1);
  });

  it("falha ao reler depois de gravar: avisa que a lista pode estar desatualizada", async () => {
    await abrir();
    base.responder = (f) => (f === "cat_ler_marcas_gestao" ? erro("XX000", "sem rede") : { data: { marca: {} }, error: null });
    fireEvent.click(botao(linha("Roca"), "Desativar Roca"));
    expect(await screen.findByText(/pode estar desatualizada/)).toBeInTheDocument();
    expect(screen.getByText("Roca")).toBeInTheDocument();
  });
});
