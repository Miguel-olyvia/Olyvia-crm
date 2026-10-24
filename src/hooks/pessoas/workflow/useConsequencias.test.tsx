// useConsequencias: lê a recusa do orçamento e a cadeia de documentos da organização (sempre com o filtro organization_id), tolera a falha de uma
// leitura sem esconder as outras e deixa-a observável, e grava SÓ por neg_guardar_cadeia e neg_guardar_recusa_orcamento. O Supabase é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { captureMock, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "../fichaTestUtil";
import { useConsequencias } from "./useConsequencias";

type Resposta = { data: unknown; error: unknown };
const respostas = vi.hoisted(() => ({ porTabela: {} as Record<string, unknown> }));
const chamadas = vi.hoisted(() => ({ lista: [] as Array<{ tabela: string; metodo: string; args: unknown[] }> }));

function construtor(tabela: string) {
  const b: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "is", "maybeSingle"]) {
    b[metodo] = (...args: unknown[]) => {
      chamadas.lista.push({ tabela, metodo, args });
      return b;
    };
  }
  b.then = (ok: (r: Resposta) => unknown, ko: (e: unknown) => unknown) => {
    const r = respostas.porTabela[tabela] as Resposta | (() => Promise<Resposta>);
    return Promise.resolve(typeof r === "function" ? r() : r).then(ok, ko);
  };
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args), from: (tabela: string) => construtor(tabela) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const ok = (data: unknown): Resposta => ({ data, error: null });
const ERRO_LEITURA: Resposta = { data: null, error: { code: "42703", message: "column recusa_orcamento does not exist" } };

function leiturasBoas() {
  respostas.porTabela = {
    negocio_workflow_config: ok({ recusa_orcamento: "perder_se_ultimo" }),
    quote_workflow_stages: ok([{ id: "fase-orc" }]),
    quote_stage_actions: ok([{ stage_id: "fase-orc", action_type: "create_proposal", is_active: true }]),
    proposal_workflow_stages: ok([{ id: "fase-prop" }]),
    proposal_stage_actions: ok([
      { stage_id: "fase-prop", action_type: "convert_to_client", is_active: false },
      { stage_id: "fase-prop", action_type: "create_contract", is_active: false },
    ]),
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  captureMock.mockReset();
  chamadas.lista = [];
  leiturasBoas();
});

const montar = (habilitado = true, opcoes: Parameters<typeof montarHook>[2] = {}) => montarHook((h: boolean) => useConsequencias(h), habilitado, opcoes);

describe("useConsequencias: leitura", () => {
  it("lê a recusa do orçamento e a cadeia efetiva da organização", async () => {
    const { result } = montar();
    expect(result.current.estado).toBe("a-carregar");
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(result.current.dados).toEqual({ recusaOrcamento: "perder_se_ultimo", orcamentoCriaProposta: true, propostaCriaContrato: false });
  });

  it("toda a leitura de dados leva o filtro da organização (as fases são as globais, organization_id nulo)", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    for (const tabela of ["negocio_workflow_config", "quote_stage_actions", "proposal_stage_actions"]) {
      const eqs = chamadas.lista.filter((c) => c.tabela === tabela && c.metodo === "eq").map((c) => c.args);
      expect(eqs, tabela).toContainEqual(["organization_id", "org-1"]);
    }
    for (const tabela of ["quote_workflow_stages", "proposal_workflow_stages"]) {
      expect(chamadas.lista.filter((c) => c.tabela === tabela && c.metodo === "is").map((c) => c.args), tabela).toContainEqual(["organization_id", null]);
    }
    expect(new Set(chamadas.lista.map((c) => c.tabela))).toEqual(new Set(Object.keys(respostas.porTabela)));
  });

  it("não lê nada com o hook desligado nem fora do modo real", async () => {
    const desligado = montar(false);
    const demo = montar(true, { fonte: { modo: "demo" } as never });
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadas.lista).toEqual([]);
    expect(desligado.result.current.estado).toBe("a-carregar");
    expect(demo.result.current.estado).toBe("a-carregar");
  });

  it("uma organização sem a configuração (sem linha): a recusa fica desconhecida (null), sem erro", async () => {
    respostas.porTabela.negocio_workflow_config = ok(null);
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(result.current.dados.recusaOrcamento).toBeNull();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("se a coluna da recusa ainda não existe (migration por aplicar) o erro é observável e o resto da cadeia continua lido", async () => {
    respostas.porTabela.negocio_workflow_config = ERRO_LEITURA;
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.dados).toEqual({ recusaOrcamento: null, orcamentoCriaProposta: true, propostaCriaContrato: false });
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("se as ações dos orçamentos falham, só esse valor fica desconhecido", async () => {
    respostas.porTabela.quote_stage_actions = ERRO_LEITURA;
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.dados).toEqual({ recusaOrcamento: "perder_se_ultimo", orcamentoCriaProposta: null, propostaCriaContrato: false });
  });

  it("uma leitura que lança (rede) também é erro observável", async () => {
    respostas.porTabela.proposal_stage_actions = () => Promise.reject(new Error("rede"));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.dados.propostaCriaContrato).toBeNull();
    expect(captureMock).toHaveBeenCalled();
  });

  it("a fase aceite que não é única (0 ou 2 linhas) deixa o valor desconhecido e conta como erro", async () => {
    respostas.porTabela.quote_workflow_stages = ok([]);
    respostas.porTabela.proposal_workflow_stages = ok([{ id: "a" }, { id: "b" }]);
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.dados.orcamentoCriaProposta).toBeNull();
    expect(result.current.dados.propostaCriaContrato).toBeNull();
  });

  it("um valor de recusa que a base não aceita é erro, não um valor mostrado", async () => {
    respostas.porTabela.negocio_workflow_config = ok({ recusa_orcamento: "talvez" });
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.dados.recusaOrcamento).toBeNull();
  });

  it("recarregar volta a ler e sai do erro", async () => {
    respostas.porTabela.negocio_workflow_config = ERRO_LEITURA;
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    respostas.porTabela.negocio_workflow_config = ok({ recusa_orcamento: "manter_aberto" });
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(result.current.dados.recusaOrcamento).toBe("manter_aberto");
  });
});

describe("useConsequencias: guardar a cadeia", () => {
  const depois = { orcamento_cria_proposta: false, proposta_cria_contrato: true, contrato_assinado_cria_nada: true };

  it("chama neg_guardar_cadeia com os nomes da assinatura real e põe o que a base devolveu na cache", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true, depois }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    let r;
    await act(async () => {
      r = await result.current.guardarCadeia({ orcamentoCriaProposta: false, propostaCriaContrato: true });
    });
    expect(r).toEqual({ mudou: true, depois: { orcamentoCriaProposta: false, propostaCriaContrato: true } });
    expect(nomeChamado(0)).toBe("neg_guardar_cadeia");
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_orcamento_cria_proposta: false, p_proposta_cria_contrato: true });
    expect(result.current.dados).toEqual({ recusaOrcamento: "perder_se_ultimo", orcamentoCriaProposta: false, propostaCriaContrato: true });
  });

  it("sem resposta reconhecível, relê da base em vez de mostrar o que se enviou", async () => {
    rpcMock.mockReturnValue(respostaOk(null));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    const antes = chamadas.lista.length;
    await act(async () => {
      await result.current.guardarCadeia({ orcamentoCriaProposta: false, propostaCriaContrato: true });
    });
    await waitFor(() => expect(chamadas.lista.length).toBeGreaterThan(antes));
  });

  it("os erros chegam como ErroNeg com o código (NG008, 42501) e a cache fica como estava", async () => {
    for (const codigo of ["NG008", "42501"]) {
      rpcMock.mockReturnValueOnce(respostaErro(codigo));
      const { result } = montar();
      await waitFor(() => expect(result.current.estado).toBe("pronto"));
      await act(async () => {
        await expect(result.current.guardarCadeia({ orcamentoCriaProposta: false, propostaCriaContrato: true })).rejects.toMatchObject({ name: "ErroNeg", codigo });
      });
      expect(result.current.dados.orcamentoCriaProposta).toBe(true);
    }
  });

  it("NG026 (várias organizações) chega como erro, mesmo sem o código estar no mapa geral", async () => {
    rpcMock.mockReturnValueOnce(Promise.resolve({ data: null, error: { code: "NG026", message: "x" } }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    await act(async () => {
      await expect(result.current.guardarCadeia({ orcamentoCriaProposta: false, propostaCriaContrato: true })).rejects.toBeInstanceOf(Error);
    });
  });

  it("um duplo pedido dá uma só chamada", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((r) => { acabar = r; }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    let a: Promise<unknown> = Promise.resolve();
    let b: Promise<unknown> = Promise.resolve();
    act(() => {
      a = result.current.guardarCadeia({ orcamentoCriaProposta: false, propostaCriaContrato: true });
      b = result.current.guardarCadeia({ orcamentoCriaProposta: false, propostaCriaContrato: true });
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.current.aGuardar).toBe(true);
    await act(async () => {
      acabar(await respostaOk({ mudou: false, depois }));
      await Promise.all([a, b]);
    });
    expect(result.current.aGuardar).toBe(false);
  });
});

describe("useConsequencias: guardar a recusa do orçamento", () => {
  it("chama neg_guardar_recusa_orcamento (organização e valor) e atualiza a cache", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true, depois: { recusa_orcamento: "manter_aberto" } }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    await act(async () => {
      await result.current.guardarRecusaOrcamento("manter_aberto");
    });
    expect(nomeChamado(0)).toBe("neg_guardar_recusa_orcamento");
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_valor: "manter_aberto" });
    expect(result.current.dados.recusaOrcamento).toBe("manter_aberto");
  });

  it("um valor fora das duas escolhas recusa-se sem ir à base (NG009)", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    await act(async () => {
      await expect(result.current.guardarRecusaOrcamento("perder" as never)).rejects.toMatchObject({ codigo: "NG009" });
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sem organização (fora do modo real) não grava", async () => {
    const { result } = montar(true, { fonte: { modo: "demo" } as never });
    await act(async () => {
      await expect(result.current.guardarRecusaOrcamento("manter_aberto")).rejects.toBeInstanceOf(Error);
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("os dois pedidos não se cruzam: um segundo pedido durante outro devolve o que está em curso", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((r) => { acabar = r; }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    let a: Promise<unknown> = Promise.resolve();
    act(() => {
      a = result.current.guardarRecusaOrcamento("manter_aberto");
      void result.current.guardarCadeia({ orcamentoCriaProposta: false, propostaCriaContrato: false }).catch(() => undefined);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      acabar(await respostaOk({ mudou: false, depois: { recusa_orcamento: "manter_aberto" } }));
      await a;
    });
  });
});

describe("a organização vem da fonte", () => {
  it("usa a organização da fonte real", async () => {
    const { result } = montar(true, { fonte: fonteReal("org-9") });
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(chamadas.lista.filter((c) => c.metodo === "eq" && c.args[0] === "organization_id").every((c) => c.args[1] === "org-9")).toBe(true);
  });
});
