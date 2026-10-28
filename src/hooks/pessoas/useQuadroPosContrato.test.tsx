import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { seed, type Negocio } from "@/emylia/motor";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import type { FiltrosQuadro } from "./quadroPessoasTipos";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const m = vi.hoisted(() => {
  const ouvintes = new Set<() => void>();
  const estado = {
    versao: 0, leitura: { k: "pronto" } as { k: string; t?: string }, negocios: [] as { id: string; entityId: string; d: unknown }[], S: {} as unknown,
    utilizador: "" as string | undefined,
  };
  return {
    ouvintes, estado, atualizar: vi.fn(), reler: vi.fn(),
    avisar: () => { estado.versao++; for (const f of [...ouvintes]) f(); },
  };
});
vi.mock("@/components/pessoas/negocioEmylia/armazemNegocioEmylia", () => ({
  obterArmazem: (_sb: unknown, _org: string, utilizador?: string) => {
    m.estado.utilizador = utilizador;
    return {
      get S() { return m.estado.S; },
      versao: () => m.estado.versao, leitura: () => m.estado.leitura, negociosLidos: () => m.estado.negocios,
      atualizar: m.atualizar, reler: m.reler,
      subscrever: (f: () => void) => { m.ouvintes.add(f); return () => { m.ouvintes.delete(f); }; },
    };
  },
}));

import { useQuadroPosContrato } from "./useQuadroPosContrato";

const REAL: FontePessoas = { modo: "real", organizationId: "org-1", utilizadorId: "u1", momentoGanho: null };
const FILTROS: FiltrosQuadro = { papel: null, pesquisa: "", ordem: "recentes" };
const embrulho = (fonte: FontePessoas) => ({ children }: { children: ReactNode }) => <FontePessoasContext.Provider value={fonte}>{children}</FontePessoasContext.Provider>;
const montar = (filtros: FiltrosQuadro = FILTROS, ativo = true, fonte: FontePessoas = REAL) => renderHook((p: { f: FiltrosQuadro }) => useQuadroPosContrato(p.f, ativo), { wrapper: embrulho(fonte), initialProps: { f: filtros } });

const deal = (id: number, fase: number, extra: Partial<Negocio> = {}): Negocio => ({ ...structuredClone(seed().deals[0]), id, fase, perdido: false, nome: `Pessoa ${id}`, ...extra });
const lido = (d: Negocio) => ({ id: `uuid-${d.id}`, entityId: `ent-${d.id}`, d });

beforeEach(() => {
  m.estado.S = seed(); m.estado.leitura = { k: "pronto" }; m.estado.versao = 0; m.estado.utilizador = "";
  m.estado.negocios = [lido(deal(1003, 5)), lido(deal(1002, 4)), lido(deal(1001, 4)), lido(deal(1000, 3)), lido(deal(999, 4, { perdido: true }))];
});
afterEach(() => { cleanup(); m.ouvintes.clear(); vi.clearAllMocks(); });

describe("useQuadroPosContrato (lê da mesma leitura que a ficha e /negocios)", () => {
  it("Financeiro é a fase 4 e Obra a fase 5, só de negócios abertos, com o id da base e a pessoa para abrir a ficha", () => {
    const { result } = montar();
    expect(result.current.colunas.financeiro.cartoes.map((c) => [c.id, c.pessoaId])).toEqual([["uuid-1002", "ent-1002"], ["uuid-1001", "ent-1001"]]);
    expect(result.current.colunas.obra.cartoes.map((c) => c.id)).toEqual(["uuid-1003"]);
    expect(result.current.cartoes.map((c) => c.id)).toEqual(["uuid-1002", "uuid-1001", "uuid-1003"]);
    expect(result.current.colunas.financeiro.total).toBe(2);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it("não há dupla chamada: o hook só pede ao armazém que atualize (uma leitura por organização, partilhada) e passa-lhe o utilizador", () => {
    montar();
    expect(m.atualizar).toHaveBeenCalledTimes(1);
    expect(m.reler).not.toHaveBeenCalled();
    expect(m.estado.utilizador).toBe("u1");
  });

  it("enquanto a organização é lida diz que está a carregar e não mostra cartões nem «0» de verdade", () => {
    m.estado.leitura = { k: "a-ler" };
    const { result } = montar();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.cartoes).toEqual([]);
  });

  it("se a leitura falha: erro visível e «recarregar» relê (sem a mensagem «ainda não disponível»)", () => {
    m.estado.leitura = { k: "erro", t: "sem rede" };
    const { result } = montar();
    expect(result.current.isError).toBe(true);
    expect(result.current.erro).not.toBeNull();
    expect("indisponivel" in result.current).toBe(false);
    act(() => result.current.recarregar());
    expect(m.reler).toHaveBeenCalledTimes(1);
  });

  it("quando a ficha grava (o armazém avisa) as colunas refazem-se: o cartão muda de coluna sem sair do Pipeline", () => {
    const { result } = montar();
    expect(result.current.colunas.obra.cartoes.map((c) => c.id)).toEqual(["uuid-1003"]);
    const d = (m.estado.negocios[1].d as Negocio);
    d.fase = 5;
    act(() => m.avisar());
    expect(result.current.colunas.obra.cartoes.map((c) => c.id)).toEqual(["uuid-1003", "uuid-1002"]);
    expect(result.current.colunas.financeiro.cartoes.map((c) => c.id)).toEqual(["uuid-1001"]);
  });

  it("aplica o mesmo filtro do Pipeline: pesquisa, papel e ordem", () => {
    const { result, rerender } = montar({ ...FILTROS, pesquisa: "zzzz" });
    expect(result.current.cartoes).toEqual([]);
    rerender({ f: { ...FILTROS, pesquisa: "Pessoa 1002" } });
    expect(result.current.cartoes.map((c) => c.id)).toEqual(["uuid-1002"]);
    rerender({ f: { ...FILTROS, papel: "lead" } });
    expect(result.current.cartoes).toEqual([]);
    rerender({ f: { ...FILTROS, ordem: "nome" } });
    expect(result.current.colunas.financeiro.cartoes.map((c) => c.nome)).toEqual(["Pessoa 1001", "Pessoa 1002"]);
  });

  it("o total e o valor de cada coluna vêm dos cartões lidos", () => {
    const { result } = montar();
    expect(result.current.colunas.obra.total).toBe(1);
    expect(result.current.colunas.financeiro.valor).toBeGreaterThanOrEqual(0);
  });

  it("sem organização (o exemplo) ou desligado não lê nada", () => {
    const sem = montar(FILTROS, true, { modo: "exemplo" } as unknown as FontePessoas);
    expect(sem.result.current.isLoading).toBe(false);
    expect(sem.result.current.cartoes).toEqual([]);
    expect(m.atualizar).not.toHaveBeenCalled();
    const desligado = montar(FILTROS, false);
    expect(desligado.result.current.cartoes).toEqual([]);
    expect(m.atualizar).not.toHaveBeenCalled();
  });

  it("não há páginas: carregarMais nunca pede nada", () => {
    const { result } = montar();
    expect(result.current.carregarMais("financeiro")).toBe(false);
    expect(result.current.aCarregarMais.size).toBe(0);
  });
});
