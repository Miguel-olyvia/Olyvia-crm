/**
 * A lista de pessoas de RH: ambito e os tres numeros dos cartoes.
 *
 * O que estes testes fecham:
 *
 *  1. a lista filtra SEMPRE pela organizacao activa e por `deleted_at is null`
 *     -- se alguem trocar o filtro por `get_user_visible_org_ids` (a funcao
 *     proibida em RH) ou o deixar cair, o teste rebenta;
 *  2. os tres agregados dao os numeros certos numa amostra conhecida. Sao
 *     calculados em memoria, por isso um erro aqui e um erro de aritmetica,
 *     nao da base -- e e exactamente o tipo de numero que se apresenta ao
 *     utilizador como se fosse medido;
 *  3. o estado do acesso vem de `pessoas_contas` e nao de uma coluna: quem nao
 *     tem conta activa aparece como "sem conta".
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const ORG_ACTIVA = "org-activa";

/** Filtros que cada tabela recebeu, para as asserçoes de ambito. */
let filtros: Record<string, Array<[string, unknown]>> = {};
/** Colunas passadas a `is(...)`, para confirmar o `deleted_at is null`. */
let isNulos: Record<string, string[]> = {};

/**
 * Amostra fixa. As datas sao calculadas a partir do momento em que a suite
 * corre, e nao de um dia fixo no calendario: um dia fixo torna o teste verde
 * hoje e vermelho dentro de tres meses, quando a janela de 90 dias o deixar
 * atras. Os desvios escolhidos (10, 30, 200, 300, 400, 900 dias) estao todos
 * longe da fronteira dos 90, por isso a hora exacta nao muda o resultado.
 */
const AGORA = new Date();
const diasAtras = (dias: number) => {
  const data = new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000);
  return data.toISOString().slice(0, 10);
};

const PESSOAS = [
  // Activa e contratada ha 10 dias -> conta para activos E para entradas 90d.
  {
    id: "p1",
    nome_completo: "Ana Alves",
    estado_registo: "activo",
    estado_contrato: "em_curso",
    data_admissao: diasAtras(10),
    data_saida: null,
  },
  // Activa, contratada ha 200 dias -> conta so para activos.
  {
    id: "p2",
    nome_completo: "Bruno Bastos",
    estado_registo: "activo",
    estado_contrato: "em_curso",
    data_admissao: diasAtras(200),
    data_saida: null,
  },
  // Saiu ha 30 dias -> conta para saidas 90d e NAO para activos.
  {
    id: "p3",
    nome_completo: "Carla Costa",
    estado_registo: "activo",
    estado_contrato: "terminado",
    data_admissao: diasAtras(400),
    data_saida: diasAtras(30),
  },
  // Saiu ha 300 dias -> nao conta para nada.
  {
    id: "p4",
    nome_completo: "Duarte Dias",
    estado_registo: "arquivado",
    estado_contrato: "terminado",
    data_admissao: diasAtras(900),
    data_saida: diasAtras(300),
  },
];

/** Só a p1 tem conta activa ligada. */
const CONTAS = [{ pessoa_id: "p1", estado: "activa" }];

function buildChain(table: string) {
  filtros[table] = filtros[table] ?? [];
  isNulos[table] = isNulos[table] ?? [];

  const resolver = () => {
    if (table === "pessoas") return { data: PESSOAS, error: null };
    if (table === "pessoas_contas") return { data: CONTAS, error: null };
    return { data: [], error: null };
  };

  const chain: any = {
    select: () => chain,
    eq: (coluna: string, valor: unknown) => {
      filtros[table].push([coluna, valor]);
      return chain;
    },
    is: (coluna: string) => {
      isNulos[table].push(coluna);
      return chain;
    },
    order: () => chain,
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(resolver()).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildChain(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ACTIVA, name: "Nike" }, companies: [] }),
}));

vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: vi.fn(),
}));

import { usePessoas } from "@/hooks/usePessoas";

describe("usePessoas", () => {
  beforeEach(() => {
    filtros = {};
    isNulos = {};
  });

  it("filtra pela organizacao activa e ignora as fichas apagadas", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(filtros.pessoas).toContainEqual(["organization_id", ORG_ACTIVA]);
    expect(isNulos.pessoas).toContain("deleted_at");
    // As contas tambem sao lidas dentro da organizacao, nunca em toda a base.
    expect(filtros.pessoas_contas).toContainEqual(["organization_id", ORG_ACTIVA]);
  });

  it("conta activos, entradas e saidas dos ultimos 90 dias na amostra conhecida", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pessoas).toHaveLength(4);
    expect(result.current.stats).toEqual({ activos: 2, entradas90d: 1, saidas90d: 1 });
  });

  it("deriva o estado do acesso das contas ligadas, nao de uma coluna", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const porId = Object.fromEntries(result.current.pessoas.map((p) => [p.id, p.estadoAcesso]));
    expect(porId.p1).toBe("ativo");
    expect(porId.p2).toBe("semConta");
    expect(porId.p3).toBe("semConta");
    expect(porId.p4).toBe("semConta");
  });
});
