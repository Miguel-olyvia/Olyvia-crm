// A secção «Modelo 3D» da ficha do produto: o seletor mostra «Automático (herda: …)» e o texto «Herdado da subcategoria X: Y»; cada escolha grava logo
// (cat_definir_modelo_3d, alvo 'produto'); a recusa da base aparece em português e o seletor volta ao que a base tem; sem as chaves da migração (ainda por
// aplicar) tudo funciona como «Automático». A base é simulada; o Visualizador3D não abre (a pré-visualização fica fechada).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: unknown } | (() => { data: unknown; error: unknown })>,
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
      rpc: vi.fn(async (f: string, a: Record<string, unknown>) => {
        base.chamadas.push({ f, a });
        const r = base.respostas[f];
        return typeof r === "function" ? r() : r ?? { data: null, error: null };
      }),
      from: vi.fn(() => cadeia()),
    },
  };
});

import { FichaProduto } from "./FichaProduto";
import { reporCustos } from "./v2/custosStore";
import { reporCatalogo } from "./v2/catalogoStore";
import type { No, Produto } from "./v2/catalogoModelo";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const PID = "11111111-2222-4333-8444-555555555555";
const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const ARV: No[] = [
  { id: "c1", n: "Casa de banho", pai: null, modelo3d: "banheira" },
  { id: "s1", n: "Sanitas", pai: "c1", modelo3d: "sanita" },
  { id: "s2", n: "Peças soltas", pai: "c1" },
];
const PROD: Produto = { id: PID, n: "Peça misteriosa X1", custo: 60, pvp: 100, un: "un", marca: "Roca", fornecedor: "", data: "2026-10-01", no: "s1", sku: "RO-1" };
const real = (podeEditar = true): FichaProdutoReal => ({ org: ORG, podeEditar, podeMudarPrecos: true, recarregar: vi.fn(async () => {}) });
const ficha = (p: Produto = PROD, arvore: No[] = ARV, r: FichaProdutoReal | null = real(), anunciar = vi.fn()) => {
  render(<FichaProduto p={p} min={28} alvo={35} voltar={vi.fn()} anunciar={anunciar} nomeServico={(s) => s} onAbrirServico={vi.fn()} real={r ?? undefined} arvore={arvore} />);
  return anunciar;
};
const seletor = () => screen.getByRole("combobox", { name: /^Modelo 3D/ });
const escolherModelo = (nome: string | null) => { fireEvent.click(seletor()); fireEvent.click(nome === null ? screen.getAllByRole("option")[0] : screen.getByRole("option", { name: nome })); };
const chamadas = () => base.chamadas.filter((c) => c.f === "cat_definir_modelo_3d");

beforeEach(() => {
  base.chamadas = [];
  base.respostas = {
    cat_produto_stock: { data: { gere_stock: true, pode_editar: true, armazens: [] }, error: null },
    cat_definir_modelo_3d: { data: { alvo: "produto", id: PID, modelo: "bide", anterior: null }, error: null },
  };
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); });

describe("ficha do produto: Modelo 3D", () => {
  it("o seletor está na secção «Modelo 3D» e mostra o que vem de cima (subcategoria > categoria)", () => {
    ficha();
    expect(screen.getByRole("heading", { level: 2, name: "Modelo 3D" })).toBeInTheDocument();
    expect(seletor()).toHaveTextContent(/Automático/);
    expect(screen.getByText("Herdado da subcategoria Sanitas: Sanita de chão")).toBeInTheDocument();
    expect(screen.getByText(/Automático \(herda: Sanita de chão, da subcategoria Sanitas\)/)).toBeInTheDocument();
  });

  it("sem subcategoria escolhida, herda da categoria", () => {
    ficha({ ...PROD, no: "s2" });
    expect(screen.getByText("Herdado da categoria Casa de banho: Banheira")).toBeInTheDocument();
  });

  it("o rótulo da secção diz o modelo e a origem", () => {
    ficha();
    expect(screen.getByTestId("modelo3d-origem")).toHaveTextContent("Sanita de chão (da subcategoria Sanitas)");
  });

  it("com o modelo do próprio produto, mostra-o seleccionado e a origem passa a ser o produto", () => {
    ficha({ ...PROD, modelo3d: "bide" });
    expect(seletor()).toHaveTextContent("Bidé");
    expect(screen.getByTestId("modelo3d-origem")).toHaveTextContent("Bidé (escolhido neste produto)");
  });

  it("escolher grava logo: cat_definir_modelo_3d com a organização, o alvo 'produto', o id e o modelo; anuncia e relê o Catálogo", async () => {
    const r = real();
    const anunciar = ficha(PROD, ARV, r);
    escolherModelo("Bidé");
    await waitFor(() => expect(chamadas()).toHaveLength(1));
    expect(chamadas()[0].a).toEqual({ p_org: ORG, p_alvo: "produto", p_id: PID, p_modelo: "bide" });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith(expect.stringMatching(/Modelo 3D de Peça misteriosa X1: Bidé/)));
    expect(r.recarregar).toHaveBeenCalled();
    // mesmo antes de a ficha reler, o seletor mostra o que ficou gravado
    await waitFor(() => expect(seletor()).toHaveTextContent("Bidé"));
  });

  it("voltar a «Automático» limpa (p_modelo null) e anuncia que herda", async () => {
    const anunciar = ficha({ ...PROD, modelo3d: "bide" });
    base.respostas.cat_definir_modelo_3d = { data: { alvo: "produto", id: PID, modelo: null, anterior: "bide" }, error: null };
    escolherModelo(null);
    await waitFor(() => expect(chamadas()).toHaveLength(1));
    expect(chamadas()[0].a).toEqual({ p_org: ORG, p_alvo: "produto", p_id: PID, p_modelo: null });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith(expect.stringMatching(/herda|automático/i)));
  });

  it("uma recusa da base aparece em português e o seletor volta ao que a base tem", async () => {
    base.respostas.cat_definir_modelo_3d = { data: null, error: { code: "CT001", message: "Sem permissão para editar o catálogo." } };
    ficha();
    escolherModelo("Bidé");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão para editar o catálogo.");
    expect(seletor()).toHaveTextContent(/Automático/);
  });

  it("a função ainda não existe (migração por aplicar): frase em português, nunca o erro em bruto, e a ficha continua a funcionar", async () => {
    base.respostas.cat_definir_modelo_3d = { data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_definir_modelo_3d" } };
    ficha();
    escolherModelo("Bidé");
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/ainda não está disponível|ainda não disponível/i);
    expect(alerta).not.toHaveTextContent(/Could not find/);
    expect(screen.getByRole("heading", { level: 1, name: "Peça misteriosa X1" })).toBeInTheDocument();
  });

  it("não grava quando se escolhe o que já está", async () => {
    ficha({ ...PROD, modelo3d: "bide" });
    escolherModelo("Bidé");
    expect(chamadas()).toHaveLength(0);
  });

  it("sem permissão de editar: o seletor está desativado e diz porquê", () => {
    ficha(PROD, ARV, real(false));
    expect(seletor()).toBeDisabled();
    expect(screen.getByText(/Sem permissão para mudar o modelo 3D/)).toBeInTheDocument();
  });

  it("sem a chave modelo3d em nenhum nível (a migração ainda não está aplicada): «Automático», sem erros", () => {
    const sem: No[] = ARV.map(({ modelo3d: _m, ...x }) => x);
    ficha(PROD, sem);
    expect(seletor()).toHaveTextContent(/Automático/);
    expect(screen.getByTestId("modelo3d-origem")).toHaveTextContent(/automático/i);
    expect(screen.queryByText(/^Herdado da/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a ficha do protótipo (sem página real) não oferece o seletor, mas mostra o modelo e a origem", () => {
    ficha(PROD, ARV, null);
    expect(screen.queryByRole("combobox", { name: "Modelo 3D" })).toBeNull();
    expect(screen.getByTestId("modelo3d-origem")).toHaveTextContent("Sanita de chão (da subcategoria Sanitas)");
  });
});
