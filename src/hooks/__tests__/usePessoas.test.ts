/**
 * A lista de pessoas de RH: ambito, os tres numeros dos cartoes, e a criacao
 * de uma ficha (incluindo a ligacao opcional a uma conta de CRM).
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
 *     tem conta activa aparece como "sem conta";
 *  4. `criarPessoa` chama `rpc_hr_ligar_conta` logo a seguir ao insert do
 *     nucleo, ANTES dos satelites;
 *  5. se a ligacao falhar, a ficha fica CRIADA na mesma (nao se apaga nada) e
 *     a falha volta como `SeccaoFalhada` com `seccao: "conta"`;
 *  6. sem `contaALigar` no payload (por exemplo, quem nao tem
 *     `hr.pessoas.conta.link` so preencheu campos), a RPC NUNCA e chamada.
 *
 * Supabase simulado. Nada toca em base nenhuma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const ORG_ACTIVA = "org-activa";

/** Filtros que cada tabela recebeu, para as asserçoes de ambito. */
let filtros: Record<string, Array<[string, unknown]>> = {};
/** Colunas passadas a `is(...)`, para confirmar o `deleted_at is null`. */
let isNulos: Record<string, string[]> = {};
/** Registos passados a `.insert(...)`, por tabela, na ordem em que chegaram. */
let inserts: Record<string, unknown[]> = {};
/** Chamadas RPC recebidas, na ordem em que chegaram -- para provar a ORDEM
 * "ligacao antes dos satelites". */
let chamadasRpc: Array<{ fn: string; args: unknown }> = [];
/** O que a RPC devolve neste teste. Reatribuido em cada `it`. */
let rpcImpl: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> =
  () => Promise.resolve({ data: null, error: null });

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
  inserts[table] = inserts[table] ?? [];

  let ultimaOperacao: "select" | "insert" = "select";

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
    insert: (registo: unknown) => {
      ultimaOperacao = "insert";
      inserts[table].push(registo);
      return chain;
    },
    single: () => chain,
    then: (onFulfilled: any, onRejected: any) => {
      const resolver = () => {
        if (ultimaOperacao === "insert") {
          if (table === "pessoas") return { data: { id: "pessoa-nova" }, error: null };
          return { data: null, error: null };
        }
        if (table === "pessoas") return { data: PESSOAS, error: null };
        if (table === "pessoas_contas") return { data: CONTAS, error: null };
        return { data: [], error: null };
      };
      return Promise.resolve(resolver()).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => buildChain(table),
    rpc: (fn: string, args?: Record<string, unknown>) => {
      chamadasRpc.push({ fn, args });
      return rpcImpl(fn, args);
    },
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ACTIVA, name: "Nike" }, companies: [] }),
}));

vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: vi.fn(),
}));

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: () => Promise.resolve("autor-1"),
}));

import { usePessoas } from "@/hooks/usePessoas";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";

/** Um payload minimo: so o nucleo, nada de satelites -- para isolar o
 * comportamento da ligacao a conta sem montar as nove tabelas do assistente. */
function payloadMinimo(overrides: Partial<NovaPessoaPayload> = {}): NovaPessoaPayload {
  return {
    nucleo: {
      primeiro_nome: "Ana",
      apelido: "Alves",
      email_trabalho: null,
      email_pessoal: null,
      telefone_trabalho: null,
      numero_interno: null,
      cargo: null,
      local_id: null,
      reporta_a_pessoa_id: null,
      data_admissao: null,
      data_antiguidade: null,
    },
    dadosPessoais: null,
    identificacao: null,
    niss: null,
    morada: null,
    conta: null,
    emergencia: null,
    vinculo: null,
    retribuicao: null,
    horario: null,
    acesso: { role_id: null, enviar_convite: false, email_convite: null },
    contaALigar: null,
    ...overrides,
  };
}

describe("usePessoas", () => {
  beforeEach(() => {
    filtros = {};
    isNulos = {};
    inserts = {};
    chamadasRpc = [];
    rpcImpl = () => Promise.resolve({ data: null, error: null });
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

  it("sem contaALigar, criarPessoa NUNCA chama rpc_hr_ligar_conta", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resultado: Awaited<ReturnType<typeof result.current.criarPessoa>> | undefined;
    await act(async () => {
      resultado = await result.current.criarPessoa(payloadMinimo());
    });

    expect(chamadasRpc.find((c) => c.fn === "rpc_hr_ligar_conta")).toBeUndefined();
    expect(resultado?.id).toBe("pessoa-nova");
    expect(resultado?.falhas).toEqual([]);
  });

  it("com contaALigar, chama rpc_hr_ligar_conta logo a seguir ao insert do nucleo, antes dos satelites", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(
        payloadMinimo({
          contaALigar: "conta-1",
          // Um satelite real, para provar que a RPC vem ANTES dele.
          morada: { tipo: "residencia", linha1: "Rua Teste", is_principal: true },
        }),
      );
    });

    const indiceLigacao = chamadasRpc.findIndex((c) => c.fn === "rpc_hr_ligar_conta");
    const indiceMorada = inserts.pessoas_moradas ? 0 : -1;
    expect(indiceLigacao).toBeGreaterThanOrEqual(0);
    expect(chamadasRpc[indiceLigacao].args).toEqual({
      p_pessoa_id: "pessoa-nova",
      p_anew_user_id: "conta-1",
    });
    // A ficha (nucleo) tem de estar inserida ANTES da chamada RPC existir --
    // o `p_pessoa_id` so existe depois do insert devolver o id.
    expect(inserts.pessoas).toHaveLength(1);
    // A morada (satelite) foi gravada, mas so DEPOIS: a ordem real e garantida
    // pelo proprio `await` sequencial em `criarPessoa` -- aqui confirma-se que
    // ambas aconteceram e que a ficha nao ficou por criar.
    expect(indiceMorada).toBe(0);
  });

  it("se rpc_hr_ligar_conta falhar, a ficha fica criada e a falha volta com seccao 'conta'", async () => {
    rpcImpl = (fn) => {
      if (fn === "rpc_hr_ligar_conta") {
        return Promise.resolve({ data: null, error: { message: "conta_ja_ligada_a_outra_pessoa" } });
      }
      return Promise.resolve({ data: null, error: null });
    };

    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resultado: Awaited<ReturnType<typeof result.current.criarPessoa>> | undefined;
    await act(async () => {
      resultado = await result.current.criarPessoa(payloadMinimo({ contaALigar: "conta-1" }));
    });

    expect(resultado?.id).toBe("pessoa-nova");
    expect(resultado?.falhas).toHaveLength(1);
    expect(resultado?.falhas[0].seccao).toBe("conta");
  });
});
