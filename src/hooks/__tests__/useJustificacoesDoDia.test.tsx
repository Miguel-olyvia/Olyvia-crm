/**
 * `useJustificacoesDoDia` e `useAccoesJustificacaoDia`: a justificação do dia lida e escrita na base por RPC.
 * `hrRpc` simulado; nada toca em base nenhuma. As RPCs ainda podem não existir na base: o ecrã não parte.
 *
 * O que estes testes guardam:
 *  - a leitura chama `rpc_hr_justificacao_dia_listar` com a organização activa e o filtro pedido;
 *  - uma RPC por aplicar, uma recusa e uma falha ficam distintas entre si e de «não há justificações»;
 *  - registar e decidir fazem UMA chamada cada e mandam as outras leituras relerem, em silêncio;
 *  - uma escrita falhada devolve texto visível (chave ou mensagem), nunca lança.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let organizacao: { id: string } | null = { id: "org-nike" };
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: organizacao }),
}));

const captura = vi.hoisted(() => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/observability/captureFlowError", () => captura);

vi.mock("@/utils/friendlyError", () => ({
  getFriendlyErrorMessage: async (e: unknown) => `amigavel:${(e as { message?: string })?.message ?? "?"}`,
}));

type Resposta = { data: unknown; error: unknown };
const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
let respostas: Record<string, Resposta | (() => Promise<Resposta>)> = {};

vi.mock("@/lib/hr/hrDb", () => ({
  hrRpc: async (fn: string, args: Record<string, unknown>) => {
    chamadas.push({ fn, args });
    const r = respostas[fn] ?? { data: null, error: null };
    return typeof r === "function" ? r() : r;
  },
  isPermissionError: (erro: unknown) => !!erro && typeof erro === "object" && (erro as { code?: string }).code === "42501",
}));

import { useAccoesJustificacaoDia, useJustificacoesDoDia } from "@/hooks/useJustificacoesDoDia";

const RECUSA = { code: "42501", message: "insufficient_privilege" };
const FALHA = { code: "57014", message: "statement timeout" };
const POR_APLICAR = { code: "PGRST202", message: "Could not find the function public.rpc_hr_justificacao_dia_listar" };

// As colunas do RETURNS TABLE de rpc_hr_justificacao_dia_listar no rascunho (sem organization_id nem created_at).
const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id, pessoa_id: "pessoa-1", pessoa_nome: "Ana", data: "2026-10-08", tipo: "transporte", de_atraso: false,
  periodo_inicio: "09:00:00", periodo_fim: "09:15:00", minutos: 15, hora_real: null, motivo: "Autocarro avariado",
  texto_sensivel: false, anexos_nomes: [], estado: "pendente", enviada_em: "2026-10-12T10:00:00Z", decidida_por: null,
  decidida_por_nome: null, decidida_em: null, motivo_recusa: null, falta_id: null, mes_fechado_na_decisao: false,
  sem_efeito_em: null, ...extra,
});

const ARGS_REGISTO = {
  pessoaId: "pessoa-1", data: "2026-10-08", tipo: "transporte" as const, deAtraso: false, periodoInicio: "09:00", periodoFim: "09:15",
  motivo: "Autocarro avariado", horaReal: null, anexosNomes: ["a.pdf", "b.pdf"] as const,
};

beforeEach(() => {
  chamadas.length = 0;
  respostas = {};
  organizacao = { id: "org-nike" };
  captura.captureFlowError.mockClear();
});

describe("useJustificacoesDoDia: leitura", () => {
  it("lê pela RPC com a organização activa e os filtros pedidos", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: [linha("j-1"), linha("j-2")], error: null };
    const { result } = renderHook(() => useJustificacoesDoDia({ pessoaId: "pessoa-1", de: "2026-10-01", ate: "2026-10-31", soPendentes: true }));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.linhas.map((l) => l.id)).toEqual(["j-1", "j-2"]);
    expect(result.current.leitura).toBe("ok");
    expect(chamadas).toEqual([
      {
        fn: "rpc_hr_justificacao_dia_listar",
        args: { _organization_id: "org-nike", _pessoa_id: "pessoa-1", _de: "2026-10-01", _ate: "2026-10-31", _so_pendentes: true },
      },
    ]);
  });

  it("sem pessoa pede a organização inteira (a fila do RH)", async () => {
    const { result } = renderHook(() => useJustificacoesDoDia({ soPendentes: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chamadas[0].args).toMatchObject({ _pessoa_id: null, _de: null, _ate: null, _so_pendentes: true });
  });

  it("uma resposta que não é lista conta como vazia, sem partir", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: null, error: null };
    const { result } = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.linhas).toEqual([]);
    expect(result.current.leitura).toBe("ok");
  });

  it("sem organização activa ou com activo=false não chama a base", async () => {
    organizacao = null;
    const semOrg = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(semOrg.result.current.loading).toBe(false));
    organizacao = { id: "org-nike" };
    const inactivo = renderHook(() => useJustificacoesDoDia({ activo: false }));
    await waitFor(() => expect(inactivo.result.current.loading).toBe(false));
    expect(chamadas).toEqual([]);
  });

  it("RPC por aplicar: fica «indisponivel», sem lista, sem relatório de erro e sem partir", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: null, error: POR_APLICAR };
    const { result } = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ leitura: "indisponivel", indisponivel: true, erro: false, recusado: false, linhas: [] });
    expect(captura.captureFlowError).not.toHaveBeenCalled();
  });

  it("recusa de permissão: «recusado», e não é um defeito a reportar", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: null, error: RECUSA };
    const { result } = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ leitura: "recusado", recusado: true, indisponivel: false, erro: false, linhas: [] });
    expect(captura.captureFlowError).not.toHaveBeenCalled();
  });

  it("falha de rede ou timeout: «erro» e é reportada", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: null, error: FALHA };
    const { result } = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ leitura: "erro", erro: true, linhas: [] });
    expect(captura.captureFlowError).toHaveBeenCalledWith(FALHA, "hr-assiduidade-load");
  });

  it("uma excepção na chamada também fica «erro» (não rebenta o ecrã)", async () => {
    respostas.rpc_hr_justificacao_dia_listar = async () => {
      throw new Error("rede em baixo");
    };
    const { result } = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.leitura).toBe("erro");
    expect(captura.captureFlowError).toHaveBeenCalled();
  });

  it("recarregar relê em silêncio: loading nunca volta a true", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: [linha("j-1")], error: null };
    const { result } = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    respostas.rpc_hr_justificacao_dia_listar = { data: [linha("j-1"), linha("j-2")], error: null };
    const vistos: boolean[] = [];
    await act(async () => {
      const promessa = result.current.recarregar();
      vistos.push(result.current.loading);
      await promessa;
    });
    expect(vistos).toEqual([false]);
    expect(result.current.linhas).toHaveLength(2);
  });

  it("só a resposta do pedido mais recente escreve no estado", async () => {
    let libertarLenta: (r: Resposta) => void = () => undefined;
    const lenta = new Promise<Resposta>((resolver) => {
      libertarLenta = resolver;
    });
    let chamada = 0;
    respostas.rpc_hr_justificacao_dia_listar = () => {
      chamada += 1;
      return chamada === 1 ? lenta : Promise.resolve({ data: [linha("novo")], error: null });
    };
    const { result, rerender } = renderHook(({ de }) => useJustificacoesDoDia({ pessoaId: "pessoa-1", de, ate: de }), {
      initialProps: { de: "2026-09-01" },
    });
    rerender({ de: "2026-10-01" });
    await waitFor(() => expect(result.current.linhas.map((l) => l.id)).toEqual(["novo"]));
    await act(async () => {
      libertarLenta({ data: [linha("velho")], error: null });
      await lenta;
    });
    expect(result.current.linhas.map((l) => l.id)).toEqual(["novo"]);
  });
});

describe("useAccoesJustificacaoDia: registar", () => {
  it("manda uma só chamada com os argumentos do desenho e devolve o id", async () => {
    respostas.rpc_hr_justificacao_dia_registar = { data: "j-novo", error: null };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.registar>> | undefined;
    await act(async () => {
      resultado = await result.current.registar(ARGS_REGISTO);
    });
    expect(resultado).toEqual({ erro: null, id: "j-novo" });
    expect(chamadas).toEqual([
      {
        fn: "rpc_hr_justificacao_dia_registar",
        args: {
          _organization_id: "org-nike", _pessoa_id: "pessoa-1", _data: "2026-10-08", _tipo: "transporte", _de_atraso: false,
          _periodo_inicio: "09:00", _periodo_fim: "09:15", _motivo: "Autocarro avariado", _hora_real: null, _anexos_nomes: ["a.pdf", "b.pdf"],
        },
      },
    ]);
    expect(result.current.aGravar).toBe(false);
  });

  it("depois de registar manda as outras leituras montadas relerem", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: [], error: null };
    respostas.rpc_hr_justificacao_dia_registar = { data: "j-novo", error: null };
    const leitura = renderHook(() => useJustificacoesDoDia({ pessoaId: "pessoa-1" }));
    await waitFor(() => expect(leitura.result.current.loading).toBe(false));
    const accoes = renderHook(() => useAccoesJustificacaoDia());
    respostas.rpc_hr_justificacao_dia_listar = { data: [linha("j-novo")], error: null };
    await act(async () => {
      await accoes.result.current.registar(ARGS_REGISTO);
    });
    await waitFor(() => expect(leitura.result.current.linhas.map((l) => l.id)).toEqual(["j-novo"]));
  });

  it("traduz o erro de regra de negócio em chave e não o reporta como defeito", async () => {
    respostas.rpc_hr_justificacao_dia_registar = { data: null, error: { message: "justificacao_dia_fora_do_prazo" } };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.registar>> | undefined;
    await act(async () => {
      resultado = await result.current.registar(ARGS_REGISTO);
    });
    expect(resultado).toEqual({ erro: "rhJust.erro.foraDoPrazo", id: null });
    expect(captura.captureFlowError).not.toHaveBeenCalled();
  });

  it("RPC por aplicar: devolve a chave «indisponivel» em vez de lançar", async () => {
    respostas.rpc_hr_justificacao_dia_registar = { data: null, error: POR_APLICAR };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.registar>> | undefined;
    await act(async () => {
      resultado = await result.current.registar(ARGS_REGISTO);
    });
    expect(resultado).toEqual({ erro: "rhJust.erro.indisponivel", id: null });
  });

  it("erro desconhecido: mensagem amigável e reportado", async () => {
    respostas.rpc_hr_justificacao_dia_registar = { data: null, error: FALHA };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.registar>> | undefined;
    await act(async () => {
      resultado = await result.current.registar(ARGS_REGISTO);
    });
    expect(resultado?.id).toBeNull();
    expect(resultado?.erro).toBe("amigavel:statement timeout");
    expect(captura.captureFlowError).toHaveBeenCalledWith(FALHA, "hr-assiduidade-write");
  });

  it("recusa de permissão não é reportada como defeito", async () => {
    respostas.rpc_hr_justificacao_dia_registar = { data: null, error: RECUSA };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    await act(async () => {
      await result.current.registar(ARGS_REGISTO);
    });
    expect(captura.captureFlowError).not.toHaveBeenCalled();
  });
});

describe("useAccoesJustificacaoDia: decidir", () => {
  it("aceitar é UMA chamada e devolve o id da falta e o mês fechado", async () => {
    respostas.rpc_hr_justificacao_dia_decidir = { data: [{ falta_id: "falta-9", mes_fechado: true }], error: null };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.decidir>> | undefined;
    await act(async () => {
      resultado = await result.current.decidir({ justificacaoId: "j-1", decisao: "aceitar_paga" });
    });
    expect(resultado).toEqual({ erro: null, faltaId: "falta-9", mesFechado: true });
    expect(chamadas).toEqual([
      {
        fn: "rpc_hr_justificacao_dia_decidir",
        args: { _justificacao_id: "j-1", _decisao: "aceitar_paga", _motivo: null, _confirmar_mes_fechado: false },
      },
    ]);
  });

  it("confirmarMesFechado chega à base como _confirmar_mes_fechado = true", async () => {
    respostas.rpc_hr_justificacao_dia_decidir = { data: [{ falta_id: "falta-9", mes_fechado: true }], error: null };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    await act(async () => {
      await result.current.decidir({ justificacaoId: "j-1", decisao: "aceitar_paga", confirmarMesFechado: true });
    });
    expect(chamadas[0].args).toMatchObject({ _confirmar_mes_fechado: true });
  });

  it("mês fechado sem confirmação: devolve a chave própria e não é reportado como defeito", async () => {
    respostas.rpc_hr_justificacao_dia_decidir = {
      data: null,
      error: { code: "55000", message: "justificacao_dia_mes_fechado: o processamento de 2/2001 ja esta fechado" },
    };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.decidir>> | undefined;
    await act(async () => {
      resultado = await result.current.decidir({ justificacaoId: "j-1", decisao: "aceitar_paga" });
    });
    expect(resultado).toEqual({ erro: "rhJust.erro.mesFechado", faltaId: null, mesFechado: false });
    expect(captura.captureFlowError).not.toHaveBeenCalled();
  });

  it("decidir a própria justificação: chave própria, sem relatório de defeito", async () => {
    respostas.rpc_hr_justificacao_dia_decidir = {
      data: null,
      error: { code: "42501", message: "justificacao_dia_propria_decisao: nao pode decidir uma justificacao sua" },
    };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.decidir>> | undefined;
    await act(async () => {
      resultado = await result.current.decidir({ justificacaoId: "j-1", decisao: "recusar", motivo: "abc" });
    });
    expect(resultado?.erro).toBe("rhJust.erro.propriaDecisao");
    expect(captura.captureFlowError).not.toHaveBeenCalled();
  });

  it("recusar manda o motivo e não devolve falta", async () => {
    respostas.rpc_hr_justificacao_dia_decidir = { data: [{ falta_id: null, mes_fechado: false }], error: null };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.decidir>> | undefined;
    await act(async () => {
      resultado = await result.current.decidir({ justificacaoId: "j-1", decisao: "recusar", motivo: "Sem comprovativo" });
    });
    expect(chamadas[0].args).toEqual({
      _justificacao_id: "j-1", _decisao: "recusar", _motivo: "Sem comprovativo", _confirmar_mes_fechado: false,
    });
    expect(resultado).toEqual({ erro: null, faltaId: null, mesFechado: false });
  });

  it("se a base recusa (já decidida, falta divergente, trigger) devolve a chave e nenhuma falta", async () => {
    respostas.rpc_hr_justificacao_dia_decidir = { data: null, error: { message: "justificacao_dia_falta_divergente" } };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.decidir>> | undefined;
    await act(async () => {
      resultado = await result.current.decidir({ justificacaoId: "j-1", decisao: "aceitar_nao_paga" });
    });
    expect(resultado).toEqual({ erro: "rhJust.erro.faltaDivergente", faltaId: null, mesFechado: false });
  });

  it("um erro das faltas chamadas por dentro traduz-se pelo mapa da assiduidade ou cai na mensagem amigável", async () => {
    respostas.rpc_hr_justificacao_dia_decidir = { data: null, error: { message: "erro qualquer das faltas" } };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.decidir>> | undefined;
    await act(async () => {
      resultado = await result.current.decidir({ justificacaoId: "j-1", decisao: "aceitar_paga" });
    });
    expect(resultado?.faltaId).toBeNull();
    expect(typeof resultado?.erro).toBe("string");
    expect(resultado?.erro).not.toBeNull();
  });

  it("decidir avisa as leituras montadas, para a fila e o contador acompanharem", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: [linha("j-1")], error: null };
    respostas.rpc_hr_justificacao_dia_decidir = { data: [{ falta_id: "f", mes_fechado: false }], error: null };
    const fila = renderHook(() => useJustificacoesDoDia({ soPendentes: true }));
    await waitFor(() => expect(fila.result.current.linhas).toHaveLength(1));
    const accoes = renderHook(() => useAccoesJustificacaoDia());
    respostas.rpc_hr_justificacao_dia_listar = { data: [], error: null };
    await act(async () => {
      await accoes.result.current.decidir({ justificacaoId: "j-1", decisao: "aceitar_paga" });
    });
    await waitFor(() => expect(fila.result.current.linhas).toHaveLength(0));
  });

  it("uma decisão falhada não manda reler (nada mudou na base)", async () => {
    respostas.rpc_hr_justificacao_dia_listar = { data: [linha("j-1")], error: null };
    respostas.rpc_hr_justificacao_dia_decidir = { data: null, error: { message: "justificacao_dia_ja_decidida" } };
    const fila = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(fila.result.current.linhas).toHaveLength(1));
    const antes = chamadas.filter((c) => c.fn === "rpc_hr_justificacao_dia_listar").length;
    const accoes = renderHook(() => useAccoesJustificacaoDia());
    await act(async () => {
      await accoes.result.current.decidir({ justificacaoId: "j-1", decisao: "recusar", motivo: "abc" });
    });
    expect(chamadas.filter((c) => c.fn === "rpc_hr_justificacao_dia_listar")).toHaveLength(antes);
  });
});

describe("useAccoesJustificacaoDia: ver o texto e quem leu", () => {
  it("verTexto chama a RPC que regista o acesso e devolve o texto", async () => {
    respostas.rpc_hr_justificacao_dia_ver_texto = { data: "Consulta de rotina", error: null };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.verTexto>> | undefined;
    await act(async () => {
      resultado = await result.current.verTexto("j-1");
    });
    expect(resultado).toEqual({ erro: null, texto: "Consulta de rotina" });
    expect(chamadas).toEqual([{ fn: "rpc_hr_justificacao_dia_ver_texto", args: { _justificacao_id: "j-1" } }]);
  });

  it("sem permissão para ver o texto: erro visível e texto nulo", async () => {
    respostas.rpc_hr_justificacao_dia_ver_texto = { data: null, error: { message: "justificacao_dia_sem_permissao" } };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.verTexto>> | undefined;
    await act(async () => {
      resultado = await result.current.verTexto("j-1");
    });
    expect(resultado).toEqual({ erro: "rhJust.erro.semPermissao", texto: null });
  });

  it("verTexto nunca é chamado ao montar o hook de leitura (cada chamada deixa rasto)", async () => {
    const { result } = renderHook(() => useJustificacoesDoDia());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(chamadas.some((c) => c.fn === "rpc_hr_justificacao_dia_ver_texto")).toBe(false);
  });

  it("acessos devolve quem leu e quando; uma resposta que não é lista dá lista vazia", async () => {
    respostas.rpc_hr_justificacao_dia_acessos = { data: [{ quem: "Rita", quando: "2026-10-13T09:00:00Z" }], error: null };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.acessos>> | undefined;
    await act(async () => {
      resultado = await result.current.acessos("j-1");
    });
    expect(resultado).toEqual({ erro: null, acessos: [{ quem: "Rita", quando: "2026-10-13T09:00:00Z" }] });

    respostas.rpc_hr_justificacao_dia_acessos = { data: null, error: null };
    await act(async () => {
      resultado = await result.current.acessos("j-1");
    });
    expect(resultado).toEqual({ erro: null, acessos: [] });
  });

  it("acessos com erro devolve lista vazia e a chave", async () => {
    respostas.rpc_hr_justificacao_dia_acessos = { data: null, error: POR_APLICAR };
    const { result } = renderHook(() => useAccoesJustificacaoDia());
    let resultado: Awaited<ReturnType<typeof result.current.acessos>> | undefined;
    await act(async () => {
      resultado = await result.current.acessos("j-1");
    });
    expect(resultado).toEqual({ erro: "rhJust.erro.indisponivel", acessos: [] });
  });
});
