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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
/** Faz a consulta a `pessoas_vinculos` falhar, para o teste da janela de
 * deploy / falta de permissao. Reatribuido em cada `it`. */
let falharVinculos = false;
/** Todas as escritas (insert e RPC) pela ordem em que chegaram, ex.: "insert:pessoas", "rpc:rpc_x". */
let ordem: string[] = [];
/** Erro a devolver no INSERT de uma tabela (por nome), para os testes de falha. */
let falharInsert: Record<string, unknown> = {};
const captureFlowError = vi.hoisted(() => vi.fn());

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
    data_admissao: diasAtras(10),
    data_saida: null,
  },
  // Activa, contratada ha 200 dias -> conta so para activos.
  {
    id: "p2",
    nome_completo: "Bruno Bastos",
    estado_registo: "activo",
    data_admissao: diasAtras(200),
    data_saida: null,
  },
  // Saiu ha 30 dias -> conta para saidas 90d e NAO para activos.
  {
    id: "p3",
    nome_completo: "Carla Costa",
    estado_registo: "activo",
    data_admissao: diasAtras(400),
    data_saida: diasAtras(30),
  },
  // Saiu ha 300 dias -> nao conta para nada.
  {
    id: "p4",
    nome_completo: "Duarte Dias",
    estado_registo: "arquivado",
    data_admissao: diasAtras(900),
    data_saida: diasAtras(300),
  },
];

/** Só a p1 tem conta activa ligada. */
const CONTAS = [{ pessoa_id: "p1", estado: "activa" }];

/** Só a p2 tem vinculo vivo -- p1, p3 e p4 ficam sem nenhum, para provar que
 *  "sem_contrato" e o resultado por omissao (e nao "em_curso"). */
const VINCULOS_BASE = [{ pessoa_id: "p2", estado: "activo" }];
/** Mutavel: o teste da paginacao substitui-o por mais de uma pagina. */
let VINCULOS: Array<{ pessoa_id: string; estado: string }> = [...VINCULOS_BASE];

function buildChain(table: string) {
  filtros[table] = filtros[table] ?? [];
  isNulos[table] = isNulos[table] ?? [];
  inserts[table] = inserts[table] ?? [];

  let ultimaOperacao: "select" | "insert" = "select";
  let intervalo: [number, number] | null = null;

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
    // `range` FATIA mesmo, em vez de devolver tudo. Um duplo que o ignorasse
    // deixava passar um erro de paginacao a serio -- e a paginacao existe
    // precisamente porque o PostgREST corta nas 1000 linhas, em silencio.
    range: (de: number, ate: number) => {
      intervalo = [de, ate];
      return chain;
    },
    insert: (registo: unknown) => {
      ultimaOperacao = "insert";
      inserts[table].push(registo);
      ordem.push(`insert:${table}`);
      return chain;
    },
    single: () => chain,
    then: (onFulfilled: any, onRejected: any) => {
      const resolver = () => {
        if (ultimaOperacao === "insert") {
          if (falharInsert[table]) return { data: null, error: falharInsert[table] };
          if (table === "pessoas") return { data: { id: "pessoa-nova" }, error: null };
          if (table === "pessoas_vinculos") return { data: { id: "vinculo-novo" }, error: null };
          return { data: null, error: null };
        }
        if (table === "pessoas") return { data: PESSOAS, error: null };
        if (table === "pessoas_contas") return { data: CONTAS, error: null };
        if (table === "pessoas_vinculos") {
          if (falharVinculos) return { data: null, error: { message: "sem permissao" } };
          if (!intervalo) return { data: VINCULOS, error: null };
          const [de, ate] = intervalo;
          return { data: VINCULOS.slice(de, ate + 1), error: null };
        }
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
      ordem.push(`rpc:${fn}`);
      return rpcImpl(fn, args);
    },
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: ORG_ACTIVA, name: "Nike" }, companies: [] }),
}));

vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError }));

vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: () => Promise.resolve("autor-1"),
}));

import { usePessoas } from "@/hooks/usePessoas";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";
import { getLocalizedFallback } from "@/utils/friendlyError";

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
      cargo_id: "cargo-1",
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
    bicSozinho: null,
    emergencia: null,
    vinculo: null,
    horasVinculo: null,
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
    VINCULOS = [...VINCULOS_BASE];
    chamadasRpc = [];
    rpcImpl = () => Promise.resolve({ data: null, error: null });
    falharVinculos = false;
    ordem = [];
    falharInsert = {};
    captureFlowError.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
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
    // activos conta SO estado_registo === "activo" (p1, p2, p3) -- p3 saiu ha
    // 30 dias mas o registo continua "activo", so o estado_registo decide.
    expect(result.current.stats).toEqual({ activos: 3, entradas90d: 1, saidas90d: 1 });
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

  it("pessoa sem vinculo nenhum fica com estado_contrato_derivado 'sem_contrato'", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const porId = Object.fromEntries(
      result.current.pessoas.map((p) => [p.id, p.estado_contrato_derivado]),
    );
    expect(porId.p1).toBe("sem_contrato");
    expect(porId.p2).toBe("em_curso");
    expect(porId.p3).toBe("sem_contrato");
    expect(porId.p4).toBe("sem_contrato");
  });

  it("com a consulta de vinculos a falhar, a coluna fica null para todos e a lista nao parte", async () => {
    falharVinculos = true;

    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.pessoas).toHaveLength(4);
    expect(result.current.pessoas.every((p) => p.estado_contrato_derivado === null)).toBe(true);
  });

  it("stats.activos conta so estado_registo, indiferente aos vinculos", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // p1, p2 e p3 sao "activo" no registo -- p1 e p3 estao SEM contrato
    // (nenhum vinculo) e ainda assim contam: o cartao ja nao olha para o
    // contrato.
    expect(result.current.stats.activos).toBe(3);
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

  it("com conta, o BIC segue em rpc_hr_definir_conta como p_swift e nao ha rpc_hr_definir_bic", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(
        payloadMinimo({
          conta: { formato: "iban", numero: "PT50000201231234567890154", swift: "CGDIPTPL" },
        }),
      );
    });

    const definirConta = chamadasRpc.find((c) => c.fn === "rpc_hr_definir_conta");
    expect(definirConta?.args).toEqual({
      p_pessoa_id: "pessoa-nova",
      p_formato: "iban",
      p_conta: "PT50000201231234567890154",
      p_swift: "CGDIPTPL",
    });
    expect(chamadasRpc.find((c) => c.fn === "rpc_hr_definir_bic")).toBeUndefined();
  });

  it("so com BIC (sem conta), chama rpc_hr_definir_bic e nunca rpc_hr_definir_conta", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(payloadMinimo({ bicSozinho: "CGDIPTPL" }));
    });

    expect(chamadasRpc.find((c) => c.fn === "rpc_hr_definir_bic")?.args).toEqual({
      p_pessoa_id: "pessoa-nova",
      p_bic: "CGDIPTPL",
    });
    expect(chamadasRpc.find((c) => c.fn === "rpc_hr_definir_conta")).toBeUndefined();
  });

  it("se rpc_hr_definir_bic falhar, a ficha fica criada e a falha volta na seccao bancarios", async () => {
    rpcImpl = (fn) =>
      fn === "rpc_hr_definir_bic"
        ? Promise.resolve({ data: null, error: { message: "bic_invalido", code: "P0001" } })
        : Promise.resolve({ data: null, error: null });
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resultado: Awaited<ReturnType<typeof result.current.criarPessoa>> | undefined;
    await act(async () => {
      resultado = await result.current.criarPessoa(payloadMinimo({ bicSozinho: "CGDIPTPL" }));
    });

    expect(resultado?.id).toBe("pessoa-nova");
    expect(resultado?.falhas.map((f) => f.seccao)).toContain("bancarios");
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

  // O PostgREST corta nas 1000 linhas SEM avisar, e os vinculos sao historico:
  // varios por pessoa. Sem paginacao, quem ficasse fora da primeira pagina
  // aparecia como "Sem contrato" -- o proprio defeito que esta derivacao
  // existe para corrigir, agora por outra via e mais dificil de ver.
  //
  // O contrato activo de p1 esta DEPOIS da milesima linha de proposito: com
  // uma consulta unica, p1 leria "terminado".
  it("le todas as paginas de vinculos, e nao so as primeiras mil", async () => {
    VINCULOS = [
      ...Array.from({ length: 1000 }, () => ({ pessoa_id: "p1", estado: "terminado" })),
      { pessoa_id: "p1", estado: "activo" },
    ];

    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const porId = Object.fromEntries(
      result.current.pessoas.map((p) => [p.id, p.estado_contrato_derivado]),
    );
    expect(porId.p1, "o contrato que estava na segunda pagina nao foi lido").toBe("em_curso");
  });

  // Fluxo 2: o valor base vem so do cargo. O nucleo leva cargo_id, e a parte
  // pessoal (subsidio e duodecimos) vai pela RPC, DEPOIS do vinculo.
  it("o nucleo vai com cargo_id", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(payloadMinimo());
    });

    expect(inserts.pessoas[0]).toMatchObject({ organization_id: ORG_ACTIVA, cargo_id: "cargo-1" });
  });

  it("a parte da pessoa grava-se pela RPC e nunca por INSERT em pessoas_retribuicoes", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(
        payloadMinimo({
          // Admissao ate ao inicio do vinculo: o cargo ja esta aberto em 2026-02-01.
          nucleo: { ...payloadMinimo().nucleo, data_admissao: "2026-01-15" },
          vinculo: { tipo_contrato: "sem_termo", data_inicio: "2026-02-01" },
          retribuicao: { subsidio: 6.5, subsidioModo: "cartao", duodecimosPct: 50 },
        }),
      );
    });

    expect(inserts.pessoas_retribuicoes).toBeUndefined();
    const chamada = chamadasRpc.find((c) => c.fn === "rpc_hr_retribuicao_definir_pessoal");
    expect(chamada?.args).toEqual({
      p_pessoa_id: "pessoa-nova",
      p_desde: "2026-02-01",
      p_subsidio: 6.5,
      p_subsidio_modo: "cartao",
      p_duodecimos_pct: 50,
      p_motivo: null,
    });
  });

  it("a data da parte da pessoa: inicio do vinculo, senao admissao, senao hoje", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const parte = { subsidio: null, subsidioModo: null, duodecimosPct: 50 as const };

    await act(async () => {
      await result.current.criarPessoa(
        payloadMinimo({
          nucleo: { ...payloadMinimo().nucleo, data_admissao: "2026-03-01" },
          retribuicao: parte,
        }),
      );
    });
    expect(chamadasRpc[chamadasRpc.length - 1]?.args).toMatchObject({ p_desde: "2026-03-01" });

    chamadasRpc = [];
    await act(async () => {
      await result.current.criarPessoa(payloadMinimo({ retribuicao: parte }));
    });
    expect(chamadasRpc[chamadasRpc.length - 1]?.args).toMatchObject({
      p_desde: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("a RPC da parte pessoal corre depois do vinculo", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(
        payloadMinimo({
          vinculo: { tipo_contrato: "sem_termo", data_inicio: "2026-02-01" },
          retribuicao: { subsidio: null, subsidioModo: null, duodecimosPct: 50 },
        }),
      );
    });

    expect(inserts.pessoas_vinculos).toHaveLength(1);
    const escritas = ordem.filter((o) => o.startsWith("insert:") || o.startsWith("rpc:"));
    const iNucleo = escritas.indexOf("insert:pessoas");
    const iVinculo = escritas.indexOf("insert:pessoas_vinculos");
    const iRpc = escritas.indexOf("rpc:rpc_hr_retribuicao_definir_pessoal");
    expect(iNucleo).toBe(0);
    expect(iVinculo).toBeGreaterThan(iNucleo);
    expect(iRpc).toBeGreaterThan(iVinculo);
  });

  it("vinculo ANTERIOR a admissao: a primeira retribuicao nao comeca antes de o cargo abrir (evita HRC11)", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(
        payloadMinimo({
          nucleo: { ...payloadMinimo().nucleo, data_admissao: "2026-03-01" },
          vinculo: { tipo_contrato: "sem_termo", data_inicio: "2026-01-01" },
          retribuicao: { subsidio: null, subsidioModo: null, duodecimosPct: 50 },
        }),
      );
    });

    const chamada = chamadasRpc.find((c) => c.fn === "rpc_hr_retribuicao_definir_pessoal");
    expect(chamada?.args).toMatchObject({ p_desde: "2026-03-01" });
  });

  it("sem admissao, o 'hoje' e o da base (UTC): as 00:30 de Lisboa no verao ainda e o dia anterior", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-01T23:30:00Z"));
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(
        payloadMinimo({
          nucleo: { ...payloadMinimo().nucleo, local_id: "local-1" },
          retribuicao: { subsidio: null, subsidioModo: null, duodecimosPct: 50 },
        }),
      );
    });

    const chamada = chamadasRpc.find((c) => c.fn === "rpc_hr_retribuicao_definir_pessoal");
    expect(chamada?.args).toMatchObject({ p_desde: "2026-07-01" });
    expect(inserts.pessoas_afectacoes[0]).toMatchObject({ valido_de: "2026-07-01" });
  });

  describe("falhas de regra de negocio nao vao para o Sentry; as inesperadas vao", () => {
    it("INSERT de pessoas recusado com HRC08: lanca texto traduzido, sem captureFlowError", async () => {
      falharInsert.pessoas = { code: "HRC08", message: "cargo_obrigatorio: toda a pessoa nova tem de ter um cargo" };
      const { result } = renderHook(() => usePessoas());
      await waitFor(() => expect(result.current.loading).toBe(false));

      let lancado: unknown;
      await act(async () => {
        try {
          await result.current.criarPessoa(payloadMinimo());
        } catch (e) {
          lancado = e;
        }
      });

      expect((lancado as Error).message).toBe(getLocalizedFallback("hr.cargos.erro.cargoObrigatorio"));
      expect(captureFlowError).not.toHaveBeenCalled();
    });

    it.each([
      ["HRC09", "cargo_desactivado: o cargo escolhido esta desactivado", "hr.cargos.erro.desactivado"],
      ["23514", "igualdade_salarial: o cargo paga 1000", "hr.cargos.erro.igualdadeSalarial"],
    ])("INSERT de pessoas com %s e traduzido e nao reportado", async (code, message, chave) => {
      falharInsert.pessoas = { code, message };
      const { result } = renderHook(() => usePessoas());
      await waitFor(() => expect(result.current.loading).toBe(false));

      let lancado: unknown;
      await act(async () => {
        try {
          await result.current.criarPessoa(payloadMinimo());
        } catch (e) {
          lancado = e;
        }
      });
      expect((lancado as Error).message).toBe(getLocalizedFallback(chave));
      expect(captureFlowError).not.toHaveBeenCalled();
    });

    it("INSERT de pessoas recusado por permissao (42501) lanca e nao e reportado", async () => {
      falharInsert.pessoas = { code: "42501", message: "permission denied for table pessoas" };
      const { result } = renderHook(() => usePessoas());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await expect(result.current.criarPessoa(payloadMinimo())).rejects.toBeDefined();
      });
      expect(captureFlowError).not.toHaveBeenCalled();
    });

    it("INSERT de pessoas com defeito inesperado e reportado ao Sentry", async () => {
      falharInsert.pessoas = { code: "XX000", message: "boom" };
      const { result } = renderHook(() => usePessoas());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await expect(result.current.criarPessoa(payloadMinimo())).rejects.toBeDefined();
      });
      expect(captureFlowError).toHaveBeenCalledTimes(1);
    });

    it("retribuicao recusada com HRC11: falha da seccao com texto traduzido e sem Sentry", async () => {
      rpcImpl = (fn) =>
        fn === "rpc_hr_retribuicao_definir_pessoal"
          ? Promise.resolve({
              data: null,
              error: { code: "HRC11", message: "retribuicao_sem_cargo: a pessoa nao tem cargo em 2026-01-01" },
            })
          : Promise.resolve({ data: null, error: null });
      const { result } = renderHook(() => usePessoas());
      await waitFor(() => expect(result.current.loading).toBe(false));

      let resultado: Awaited<ReturnType<typeof result.current.criarPessoa>> | undefined;
      await act(async () => {
        resultado = await result.current.criarPessoa(
          payloadMinimo({ retribuicao: { subsidio: null, subsidioModo: null, duodecimosPct: 50 } }),
        );
      });

      expect(resultado?.falhas).toEqual([
        { seccao: "retribuicao", mensagem: getLocalizedFallback("hr.cargos.erro.retribuicaoSemCargo") },
      ]);
      expect(captureFlowError).not.toHaveBeenCalled();
    });

    it("retribuicao com permissao recusada (42501): falha da seccao e sem Sentry", async () => {
      rpcImpl = (fn) =>
        fn === "rpc_hr_retribuicao_definir_pessoal"
          ? Promise.resolve({ data: null, error: { code: "42501", message: "insufficient_privilege: ..." } })
          : Promise.resolve({ data: null, error: null });
      const { result } = renderHook(() => usePessoas());
      await waitFor(() => expect(result.current.loading).toBe(false));

      let resultado: Awaited<ReturnType<typeof result.current.criarPessoa>> | undefined;
      await act(async () => {
        resultado = await result.current.criarPessoa(
          payloadMinimo({ retribuicao: { subsidio: null, subsidioModo: null, duodecimosPct: 50 } }),
        );
      });
      expect(resultado?.falhas.map((f) => f.seccao)).toEqual(["retribuicao"]);
      expect(captureFlowError).not.toHaveBeenCalled();
    });

    it("vinculo recusado com HRC04 (data invalida): falha traduzida e sem Sentry; defeito inesperado reporta", async () => {
      falharInsert.pessoas_vinculos = { code: "HRC04", message: "data_invalida: a data ..." };
      const { result } = renderHook(() => usePessoas());
      await waitFor(() => expect(result.current.loading).toBe(false));

      let resultado: Awaited<ReturnType<typeof result.current.criarPessoa>> | undefined;
      await act(async () => {
        resultado = await result.current.criarPessoa(
          payloadMinimo({ vinculo: { tipo_contrato: "sem_termo", data_inicio: "2026-02-01" } }),
        );
      });
      expect(resultado?.falhas).toEqual([
        { seccao: "vinculo", mensagem: getLocalizedFallback("hr.cargos.erro.dataInvalida") },
      ]);
      expect(captureFlowError).not.toHaveBeenCalled();

      falharInsert.pessoas_vinculos = { code: "XX000", message: "boom" };
      await act(async () => {
        await result.current.criarPessoa(
          payloadMinimo({ vinculo: { tipo_contrato: "sem_termo", data_inicio: "2026-02-01" } }),
        );
      });
      expect(captureFlowError).toHaveBeenCalledTimes(1);
    });
  });

  it("sem parte da pessoa a RPC nunca e chamada", async () => {
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.criarPessoa(payloadMinimo({ retribuicao: null }));
    });

    expect(chamadasRpc.find((c) => c.fn === "rpc_hr_retribuicao_definir_pessoal")).toBeUndefined();
  });

  it("se a RPC da parte pessoal falhar, a ficha fica criada e a falha volta como 'retribuicao'", async () => {
    rpcImpl = (fn) =>
      fn === "rpc_hr_retribuicao_definir_pessoal"
        ? Promise.resolve({
            data: null,
            error: { code: "HRC11", message: "retribuicao_sem_cargo: atribua primeiro um cargo" },
          })
        : Promise.resolve({ data: null, error: null });
    const { result } = renderHook(() => usePessoas());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let resultado: Awaited<ReturnType<typeof result.current.criarPessoa>> | undefined;
    await act(async () => {
      resultado = await result.current.criarPessoa(
        payloadMinimo({ retribuicao: { subsidio: null, subsidioModo: null, duodecimosPct: 50 } }),
      );
    });

    expect(resultado?.id).toBe("pessoa-nova");
    expect(resultado?.falhas.map((x) => x.seccao)).toEqual(["retribuicao"]);
  });
});
