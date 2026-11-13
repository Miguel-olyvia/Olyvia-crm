// 13/11: o ecrã de gestão do Catálogo, com os separadores «Categorias», «Marcas» e «Atributos» (este reutiliza GestaoAtributos), e o acesso
// «Gestão» na página real (?atributos=1 continua a abrir os atributos).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({ chamadas: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  const dados: Record<string, unknown> = {
    cat_ler_categorias_gestao: { categorias: [{ id: "c1", nome: "Cozinha", ordem: 1, ativo: true, global: false, usados: 0, subcategorias: [] }] },
    cat_ler_marcas_gestao: { marcas: [{ id: "m1", nome: "Roca", website: null, ativo: true, global: false, usados: 0 }] },
    cat_ler_atributos_gestao: { atributos: [{ id: "a1", codigo: "brilho", nome: "Brilho", tipo: "lista", tem_hex: false, ordem: 1, ativo: true, usados: 0, opcoes: [] }] },
  };
  return {
    supabase: {
      rpc: vi.fn(async (f: string) => { base.chamadas.push(f); return { data: dados[f] ?? null, error: dados[f] ? null : { code: "PGRST202", message: "Could not find the function" } }; }),
      from: vi.fn(() => cadeia()),
    },
  };
});

import { EnderecoAtivo } from "@/lib/paramUrl";
import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { GestaoCatalogo, type SeparadorGestao } from "./GestaoCatalogo";
import { reporCustos } from "./v2/custosStore";
import { reporCatalogo } from "./v2/catalogoStore";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: "org-1", podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
beforeEach(() => { base.chamadas = []; });
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); window.history.replaceState(null, "", "/"); });

describe("GestaoCatalogo: separadores", () => {
  const montar = (sep: SeparadorGestao = "categorias") => {
    const onSeparador = vi.fn(), voltar = vi.fn();
    const { rerender } = render(<GestaoCatalogo real={REAL()} separador={sep} onSeparador={onSeparador} voltar={voltar} anunciar={vi.fn()} />);
    return { onSeparador, voltar, rerender };
  };

  it("um título, o «Voltar ao Catálogo» e três separadores pela ordem Categorias, Marcas, Atributos, com o escolhido marcado", async () => {
    const { voltar } = montar("marcas");
    expect(screen.getByRole("heading", { level: 1, name: "Gestão do Catálogo" })).toBeInTheDocument();
    const t = screen.getAllByRole("tab");
    expect(t.map((x) => x.textContent)).toEqual(["Categorias", "Marcas", "Atributos"]);
    expect(t.map((x) => x.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(t.map((x) => x.tabIndex)).toEqual([-1, 0, -1]); // só o escolhido entra na ordem do Tab
    expect(screen.getByRole("tabpanel", { name: "Marcas" })).toBeInTheDocument();
    expect(await screen.findByText("Roca")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(voltar).toHaveBeenCalledTimes(1);
  });

  it("só o separador escolhido lê da base", async () => {
    montar("categorias");
    await screen.findByRole("article", { name: "Cozinha" });
    expect(base.chamadas).toEqual(["cat_ler_categorias_gestao"]);
  });

  it("tocar num separador avisa quem usa; setas, Home e End movem e escolhem", () => {
    const { onSeparador } = montar("categorias");
    fireEvent.click(screen.getByRole("tab", { name: "Atributos" }));
    expect(onSeparador).toHaveBeenLastCalledWith("atributos");
    const cat = screen.getByRole("tab", { name: "Categorias" });
    fireEvent.keyDown(cat, { key: "ArrowRight" });
    expect(onSeparador).toHaveBeenLastCalledWith("marcas");
    fireEvent.keyDown(cat, { key: "ArrowLeft" });
    expect(onSeparador).toHaveBeenLastCalledWith("atributos"); // dá a volta
    fireEvent.keyDown(cat, { key: "End" });
    expect(onSeparador).toHaveBeenLastCalledWith("atributos");
    fireEvent.keyDown(cat, { key: "Home" });
    expect(onSeparador).toHaveBeenLastCalledWith("categorias");
  });

  it("o separador Atributos mostra a gestão dos atributos, sem repetir o título nem o «Voltar»", async () => {
    montar("atributos");
    expect(await screen.findByRole("region", { name: "Brilho" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Voltar ao Catálogo" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Novo atributo" })).toBeInTheDocument();
  });

  it("os separadores têm alvos de 44 px e o painel é ligado ao separador", () => {
    montar("categorias");
    for (const t of screen.getAllByRole("tab")) expect(t.className).toContain("min-h-11");
    const sel = screen.getByRole("tab", { name: "Categorias" });
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", sel.id);
    expect(sel).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
  });
});

describe("Catálogo: entrada «Gestão»", () => {
  const pagina = (r?: FichaProdutoReal) => {
    const S = seed(), run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={r} />);
  };

  it("na página real o acesso «Gestão» abre o ecrã nas Categorias e o «Voltar» devolve o foco ao acesso", async () => {
    pagina(REAL());
    fireEvent.click(screen.getByRole("button", { name: "Gestão" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Gestão do Catálogo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Categorias", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Cozinha" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Gestão" })).toHaveFocus());
  });

  it("trocar de separador muda o que se vê", async () => {
    pagina(REAL());
    fireEvent.click(screen.getByRole("button", { name: "Gestão" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Marcas" }));
    expect(await screen.findByText("Roca")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Atributos" }));
    expect(await screen.findByRole("region", { name: "Brilho" })).toBeInTheDocument();
  });

  it("?atributos=1 continua a abrir os atributos", async () => {
    window.history.replaceState(null, "", "/#/?atributos=1");
    const S = seed(), run = (fn: () => void) => fn();
    render(<EnderecoAtivo.Provider value={true}><CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={REAL()} /></EnderecoAtivo.Provider>);
    expect(await screen.findByRole("tab", { name: "Atributos", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Brilho" })).toBeInTheDocument();
  });

  it("sem a página real (protótipo) não há acesso", () => {
    pagina(undefined);
    expect(screen.queryByRole("button", { name: "Gestão" })).toBeNull();
    expect(within(document.body).queryByRole("button", { name: "Atributos" })).toBeNull();
  });
});
