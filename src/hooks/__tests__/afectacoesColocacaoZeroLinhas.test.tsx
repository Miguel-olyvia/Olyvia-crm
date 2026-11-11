/**
 * E6-2 (gravação): um UPDATE que a RLS filtra devolve 0 linhas SEM erro. Em `usePessoaAfectacoes` e
 * `usePessoaColocacaoOrganograma` isso passa a ser uma recusa («Não foi gravado: não tem permissão…»), com a
 * permissão que a linha exigia pelo seu `valido_ate` -- nunca sucesso. Com 1 linha, tudo igual a antes.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const estado = vi.hoisted(() => ({
  linhas: [] as unknown[],
  /** `count` devolvido pelo UPDATE (`{ count: "exact" }`). */
  count: 1 as number | null,
  erroUpdate: null as unknown,
  opcoesUpdate: [] as unknown[],
}));

vi.mock("@/lib/hr/hrDb", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hr/hrDb")>("@/lib/hr/hrDb");
  return {
    ...actual,
    hrFrom: () => {
      let escrita = false;
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        is: () => chain,
        eq: () => chain,
        insert: () => {
          escrita = true;
          return chain;
        },
        update: (_valores: unknown, opcoes?: unknown) => {
          escrita = true;
          estado.opcoesUpdate.push(opcoes);
          return chain;
        },
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve(
            escrita
              ? { data: null, error: estado.erroUpdate, count: estado.erroUpdate ? null : estado.count }
              : { data: estado.linhas, error: null },
          ).then(ok, ko),
      };
      return chain;
    },
  };
});

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({ resolveCurrentBusinessUserId: async () => "u1" }));
const captureFlowError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError }));

import { usePessoaAfectacoes } from "@/hooks/usePessoaAfectacoes";
import { usePessoaColocacaoOrganograma } from "@/hooks/usePessoaColocacaoOrganograma";
import { getLocalizedFallback } from "@/utils/friendlyError";

const naoGravado = (permissao: string) =>
  getLocalizedFallback("hr.erroNaoGravadoSemPermissao").replace("{permissao}", permissao);

const linha = (id: string, validoAte: string | null) => ({
  id,
  pessoa_id: "p1",
  organization_id: "org",
  vinculo_id: null,
  local_id: "loc1",
  organograma_node_id: "n1",
  valido_de: "2000-01-01",
  valido_ate: validoAte,
  motivo: null,
  origem: "do_horario",
  confirmada_por: null,
  confirmada_em: null,
  created_at: "2000-01-01T00:00:00Z",
  updated_at: "2000-01-01T00:00:00Z",
});
const FUTURA = linha("futura", "2999-12-31");
const ABERTA = linha("aberta", null);
const DECORRIDA = linha("decorrida", "2001-03-31");

beforeEach(() => {
  estado.linhas = [FUTURA, ABERTA, DECORRIDA];
  estado.count = 1;
  estado.erroUpdate = null;
  estado.opcoesUpdate = [];
  captureFlowError.mockReset();
});

async function montarAfectacoes() {
  const h = renderHook(() => usePessoaAfectacoes("p1", "org"));
  await waitFor(() => expect(h.result.current.afectacoes).toHaveLength(3));
  return h;
}
async function montarColocacao() {
  const h = renderHook(() => usePessoaColocacaoOrganograma("p1", "org"));
  await waitFor(() => expect(h.result.current.colocacoes).toHaveLength(3));
  return h;
}

const PATCH_AFECTACAO = { localId: "loc1", validoDe: "2000-01-01", validoAte: "2001-03-31", motivo: "m" };
const PATCH_COLOCACAO = { organogramaNodeId: "n1", validoDe: "2000-01-01", validoAte: "2001-03-31", motivo: "m" };

describe("E6-2 — usePessoaAfectacoes: 0 linhas é recusa", () => {
  it("a mensagem é a pedida e não é «Alterações guardadas»", () => {
    localStorage.setItem("language", "pt");
    const msg = naoGravado("hr.pessoas.afectacoes.edit");
    expect(msg).toMatch(/^Não foi gravado: não tem permissão para esta alteração \(exige hr\.pessoas\.afectacoes\.edit\)\.$/);
    expect(msg).not.toBe(getLocalizedFallback("hr.sucesso.guardado"));
    localStorage.removeItem("language");
  });

  it("corrigir numa linha ainda não decorrida com 0 linhas: recusa a pedir .edit", async () => {
    const { result } = await montarAfectacoes();
    estado.count = 0;
    let r: string | null = null;
    await act(async () => {
      r = await result.current.corrigir("futura", PATCH_AFECTACAO);
    });
    expect(r).toBe(naoGravado("hr.pessoas.afectacoes.edit"));
    expect(estado.opcoesUpdate).toEqual([{ count: "exact" }]);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("corrigir numa linha decorrida com 0 linhas: recusa a pedir .corrigir", async () => {
    const { result } = await montarAfectacoes();
    estado.count = 0;
    let r: string | null = null;
    await act(async () => {
      r = await result.current.corrigir("decorrida", PATCH_AFECTACAO);
    });
    expect(r).toBe(naoGravado("hr.pessoas.afectacoes.corrigir"));
  });

  it("corrigir com 1 linha gravada continua a ser sucesso (null)", async () => {
    const { result } = await montarAfectacoes();
    let r: string | null = "x";
    await act(async () => {
      r = await result.current.corrigir("decorrida", PATCH_AFECTACAO);
    });
    expect(r).toBeNull();
  });

  it("fechar com 0 linhas devolve erro, não ok", async () => {
    const { result } = await montarAfectacoes();
    estado.count = 0;
    let r: unknown;
    await act(async () => {
      r = await result.current.fechar("aberta", "2999-01-01", null);
    });
    expect(r).toEqual({ tipo: "erro", mensagem: naoGravado("hr.pessoas.afectacoes.edit") });
  });

  it("fechar com 1 linha continua ok", async () => {
    const { result } = await montarAfectacoes();
    let r: unknown;
    await act(async () => {
      r = await result.current.fechar("aberta", "2999-01-01", null);
    });
    expect(r).toEqual({ tipo: "ok" });
  });

  it("confirmar com 0 linhas também é recusa", async () => {
    const { result } = await montarAfectacoes();
    estado.count = 0;
    let r: string | null = null;
    await act(async () => {
      r = await result.current.confirmar("decorrida");
    });
    expect(r).toBe(naoGravado("hr.pessoas.afectacoes.corrigir"));
  });

  it("um erro da base continua a ser o erro da base (não a mensagem de 0 linhas)", async () => {
    const { result } = await montarAfectacoes();
    estado.erroUpdate = { code: "42501", message: "new row violates row-level security policy" };
    let r: string | null = null;
    await act(async () => {
      r = await result.current.corrigir("decorrida", PATCH_AFECTACAO);
    });
    expect(r).not.toBeNull();
    expect(r).not.toBe(naoGravado("hr.pessoas.afectacoes.corrigir"));
  });
});

describe("E6-2 — usePessoaColocacaoOrganograma: 0 linhas é recusa", () => {
  it("corrigir numa linha ainda não decorrida com 0 linhas: recusa a pedir .edit", async () => {
    const { result } = await montarColocacao();
    estado.count = 0;
    let r: string | null = null;
    await act(async () => {
      r = await result.current.corrigir("futura", PATCH_COLOCACAO);
    });
    expect(r).toBe(naoGravado("hr.pessoas.colocacao.edit"));
    expect(estado.opcoesUpdate).toEqual([{ count: "exact" }]);
  });

  it("corrigir numa linha decorrida: 0 linhas pede .corrigir; 1 linha é sucesso", async () => {
    const { result } = await montarColocacao();
    estado.count = 0;
    let r: string | null = null;
    await act(async () => {
      r = await result.current.corrigir("decorrida", PATCH_COLOCACAO);
    });
    expect(r).toBe(naoGravado("hr.pessoas.colocacao.corrigir"));
    estado.count = 1;
    await act(async () => {
      r = await result.current.corrigir("decorrida", PATCH_COLOCACAO);
    });
    expect(r).toBeNull();
  });

  it("fechar: 0 linhas é erro; 1 linha é ok", async () => {
    const { result } = await montarColocacao();
    estado.count = 0;
    let r: unknown;
    await act(async () => {
      r = await result.current.fechar("aberta", "2999-01-01", null);
    });
    expect(r).toEqual({ tipo: "erro", mensagem: naoGravado("hr.pessoas.colocacao.edit") });
    estado.count = 1;
    await act(async () => {
      r = await result.current.fechar("aberta", "2999-01-01", null);
    });
    expect(r).toEqual({ tipo: "ok" });
  });
});
