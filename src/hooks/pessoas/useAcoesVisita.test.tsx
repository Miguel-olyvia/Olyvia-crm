// useAcoesVisita: marcar, alterar, cancelar e resultado da visita, com o Supabase simulado (nunca a base).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { FICHA, invalidadas, limparAcoes, prepararAcoes, semear } from "./acoesFichaTestUtil";
import { ErroNeg } from "./chamarNeg";
import { fichaDb, PESSOA_ID, seccaoDb, visitaDb } from "./fichaFabrica";
import { captureMock, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { recursoEmConflito } from "./errosVisita";
import { useAcoesVisita } from "./useAcoesVisita";
import type { EntradaVisita } from "./visitaDb";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const V = "pessoasPagina.real.visit.";
const RECURSO = "44444444-4444-4444-8444-444444444444";

const entrada = (sobre: Partial<EntradaVisita> = {}): EntradaVisita => ({
  boardId: "quadro-1", data: "2026-10-24", hora: "10:00", duracao: "h1", recursos: ["rec-1"], tipo: "levantamento", titulo: "Levantamento · Ana Lopes",
  nota: "", morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }, igualALead: false, quemVaiEstar: "", ...sobre,
});

function montar(opcoes: { ficha?: typeof FICHA | null; fonte?: ReturnType<typeof fonteReal> | { modo: "exemplo" } } = {}) {
  const r = montarHook(
    (p: { ficha: typeof FICHA | null }) => useAcoesVisita(PESSOA_ID, p.ficha),
    { ficha: opcoes.ficha === undefined ? FICHA : opcoes.ficha },
    { fonte: opcoes.fonte ?? fonteReal() },
  );
  return r;
}

/** O hook com a pessoa a mudar entre renders (a ficha da outra pessoa chega junto). */
function montarComPessoa(inicial: { pessoaId: string; ficha: typeof FICHA | null }) {
  return montarHook((p: { pessoaId: string; ficha: typeof FICHA | null }) => useAcoesVisita(p.pessoaId, p.ficha), inicial, { fonte: fonteReal() });
}

const chamadas = (): string[] => rpcMock.mock.calls.map((c) => c[0] as string);
const erroDe = async (p: Promise<unknown>): Promise<ErroNeg> => (await Promise.resolve(p).then(() => null, (e) => e)) as ErroNeg;
const agendaInvalidada = (client: QueryClient): boolean | undefined => client.getQueryState(["neg-agenda-visita", "org-1"])?.isInvalidated;

beforeEach(prepararAcoes);
afterEach(limparAcoes);

describe("marcar", () => {
  it("chama neg_guardar_visita com os parâmetros do contrato e mais nada (não é um contacto: sem nota nem registo de contacto)", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaOk({ visita_id: "v-novo", mudou: true, ligado_a: null }));
    const r = await act(async () => result.current.marcar(entrada({ negocioId: "neg-1" })));
    expect(chamadas()).toEqual(["neg_guardar_visita"]);
    expect(parametros(0)).toMatchObject({
      p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_board_id: "quadro-1", p_inicio: "2026-10-24T09:00:00.000Z", p_fim: "2026-10-24T10:00:00.000Z",
      p_recursos: ["rec-1"], p_lat: null, p_lng: null, p_negocio_id: "neg-1", p_visit_kind: "levantamento",
    });
    expect(r).toEqual({ visitaId: "v-novo", mudou: true });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("sem recursos (ou sem hora) não chama a base e lança o erro traduzido, sem invalidar", async () => {
    const { result, client } = montar();
    semear(client);
    const semRecurso = await erroDe(act(async () => result.current.marcar(entrada({ recursos: [] }))));
    expect(semRecurso).toBeInstanceOf(ErroNeg);
    expect(semRecurso.chave).toBe(`${V}err.noResource`);
    const semHora = await erroDe(act(async () => result.current.marcar(entrada({ hora: "" }))));
    expect(semHora.chave).toBe(`${V}err.badTime`);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("NG010: erro lido para o diálogo, com o recurso em conflito à mão, e sem invalidar a ficha (falha total)", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(Promise.resolve({ data: null, error: { code: "NG010", message: "x", details: RECURSO } }));
    const erro = await erroDe(act(async () => result.current.marcar(entrada())));
    expect(erro.chave).toBe(`${V}err.marcar.ng010`);
    expect(erro.codigo).toBe("NG010");
    expect(recursoEmConflito(erro)).toBe(RECURSO);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("NG008: mensagem de quadro ou recurso e refaz a lista de quadros e recursos (não a ficha)", async () => {
    const { result, client } = montar();
    semear(client);
    client.setQueryData(["neg-agenda-visita", "org-1"], { quadros: [], recursos: [] });
    rpcMock.mockReturnValueOnce(respostaErro("NG008"));
    const erro = await erroDe(act(async () => result.current.marcar(entrada())));
    expect(erro.chave).toBe(`${V}err.marcar.ng008`);
    expect(agendaInvalidada(client)).toBe(true);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("duplo clique: dois pedidos iguais seguidos partilham a mesma chamada e a mesma resposta", async () => {
    const { result } = montar();
    let responder: (v: unknown) => void = () => {};
    rpcMock.mockReturnValueOnce(new Promise((r) => { responder = r; }));
    let a: unknown;
    let b: unknown;
    await act(async () => {
      const pa = result.current.marcar(entrada());
      const pb = result.current.marcar(entrada());
      responder({ data: { visita_id: "v-1", mudou: true, ligado_a: null }, error: null });
      [a, b] = await Promise.all([pa, pb]);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ visitaId: "v-1", mudou: true });
    expect(b).toBe(a);
  });

  it("duplo clique com falha: ambos recebem o mesmo erro; depois de acabar, um pedido novo volta a chamar a base", async () => {
    const { result } = montar();
    let responder: (v: unknown) => void = () => {};
    rpcMock.mockReturnValueOnce(new Promise((r) => { responder = r; }));
    let erros: ErroNeg[] = [];
    await act(async () => {
      const pa = erroDe(result.current.marcar(entrada()));
      const pb = erroDe(result.current.marcar(entrada()));
      responder({ data: null, error: { code: "NG009", message: "x" } });
      erros = await Promise.all([pa, pb]);
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(erros[0]).toBe(erros[1]);
    rpcMock.mockReturnValueOnce(respostaOk({ visita_id: "v-2", mudou: true, ligado_a: null }));
    await act(async () => { await result.current.marcar(entrada()); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("pedidos diferentes ao mesmo tempo não se partilham", async () => {
    const { result } = montar();
    rpcMock.mockReturnValue(respostaOk({ visita_id: "v", mudou: true, ligado_a: null }));
    await act(async () => { await Promise.all([result.current.marcar(entrada()), result.current.marcar(entrada({ hora: "11:00" }))]); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("na fonte de exemplo (sem organização) não chama a base", async () => {
    const { result } = montar({ fonte: { modo: "exemplo" } });
    const erro = await erroDe(act(async () => result.current.marcar(entrada())));
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("alterar", () => {
  const RESPOSTA = { visita_id: "futura", mudou: true, recursos_mudaram: true, dono_alterado: true, novo_dono: "u9", outras_visitas: ["x", "y"], desconfirmada: true };

  it("reenvia todos os campos, devolve o que mudou e invalida a ficha e as listas", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaOk(RESPOSTA));
    const r = await act(async () => result.current.alterar("futura", entrada({ nota: "n" }), ["outro"]));
    expect(nomeChamado(0)).toBe("neg_alterar_visita");
    expect(Object.keys(parametros(0)).sort()).toEqual([
      "p_board_id", "p_detalhes", "p_fim", "p_inicio", "p_local", "p_notas", "p_recursos", "p_titulo", "p_visit_kind", "p_visita_id",
    ]);
    expect(parametros(0)).toMatchObject({ p_visita_id: "futura", p_notas: "n", p_recursos: ["rec-1"], p_visit_kind: "levantamento" });
    expect(r).toEqual({ mudou: true, recursosMudaram: true, donoAlterado: true, novoDono: "u9", outrasVisitas: ["x", "y"], desconfirmada: true });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("a mesma lista de recursos vai como NULL; uma resposta sem os campos novos dá valores seguros", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaOk({ visita_id: "futura", mudou: false }));
    const r = await act(async () => result.current.alterar("futura", entrada({ recursos: ["rec-1"] }), ["rec-1"]));
    expect(parametros(0).p_recursos).toBeNull();
    expect(r).toEqual({ mudou: false, recursosMudaram: false, donoAlterado: false, novoDono: null, outrasVisitas: [], desconfirmada: false });
  });

  it("42501 ao trocar recursos: a mensagem própria de quem não pode mudar o responsável; sem invalidar", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaErro("42501"));
    const erro = await erroDe(act(async () => result.current.alterar("futura", entrada(), ["outro"])));
    expect(erro.chave).toBe(`${V}ownerForbidden`);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("42501 sem mexer nos recursos (só a hora): a permissão geral sobre a visita, NÃO «mudaria o responsável»", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaErro("42501"));
    const erro = await erroDe(act(async () => result.current.alterar("futura", entrada({ recursos: ["rec-1"] }), ["rec-1"])));
    expect(parametros(0).p_recursos).toBeNull();
    expect(erro.chave).toBe("pessoasPagina.erroNeg.permissao");
    expect(erro.codigo).toBe("42501");
  });

  it.each([["NG017", "pessoasPagina.erroNeg.ng017"], ["NG018", "pessoasPagina.erroNeg.ng018"], ["NG010", `${V}err.alterar.ng010`], ["NG008", `${V}err.alterar.ng008`]])(
    "%s é lido para o diálogo de alterar", async (codigo, chave) => {
      const { result } = montar();
      rpcMock.mockReturnValueOnce(respostaErro(codigo));
      expect((await erroDe(act(async () => result.current.alterar("futura", entrada())))).chave).toBe(chave);
    },
  );

  it("sem id de visita, ou sem recursos, não chama a base", async () => {
    const { result } = montar();
    expect((await erroDe(act(async () => result.current.alterar("", entrada())))).chave).toBe(`${V}err.noVisit`);
    expect((await erroDe(act(async () => result.current.alterar("futura", entrada({ recursos: [] }))))).chave).toBe(`${V}err.noResource`);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("duplo clique partilha a resposta", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaOk(RESPOSTA));
    await act(async () => { await Promise.all([result.current.alterar("futura", entrada()), result.current.alterar("futura", entrada())]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("cancelar", () => {
  it("chama neg_cancelar_visita só com o id e invalida a ficha e as listas", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaOk({ visita_id: "futura", mudou: true }));
    const r = await act(async () => result.current.cancelar("futura"));
    expect(nomeChamado(0)).toBe("neg_cancelar_visita");
    expect(parametros(0)).toEqual({ p_visita_id: "futura" });
    expect(r).toEqual({ mudou: true });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("mudou=false (já estava cancelada) é um sucesso silencioso", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaOk({ visita_id: "futura", mudou: false }));
    expect(await act(async () => result.current.cancelar("futura"))).toEqual({ mudou: false });
  });

  it("NG018 (feita, com resultado ou de negócio fechado) é lido para o diálogo de cancelar", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaErro("NG018"));
    expect((await erroDe(act(async () => result.current.cancelar("passada")))).chave).toBe(`${V}err.cancelar.ng018`);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("NG017 fica com a mensagem geral; sem id não chama a base; duplo clique partilha", async () => {
    const { result } = montar();
    rpcMock.mockReturnValueOnce(respostaErro("NG017"));
    expect((await erroDe(act(async () => result.current.cancelar("futura")))).chave).toBe("pessoasPagina.erroNeg.ng017");
    rpcMock.mockReset();
    expect((await erroDe(act(async () => result.current.cancelar("")))).chave).toBe(`${V}err.noVisit`);
    expect(rpcMock).not.toHaveBeenCalled();
    rpcMock.mockReturnValueOnce(respostaOk({ visita_id: "futura", mudou: true }));
    await act(async () => { await Promise.all([result.current.cancelar("futura"), result.current.cancelar("futura")]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("resultado", () => {
  const encerra = { resultado: "semInteresse" as const, motivo: "preco" as const };

  it("um resultado que não encerra: só neg_resultado_visita, com p_feita certo pelo instante da visita", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    await act(async () => { await result.current.resultado("passada", { resultado: "aPensar" }); });
    expect(chamadas()).toEqual(["neg_resultado_visita"]);
    expect(parametros(0)).toEqual({ p_visita_id: "passada", p_resultado: "aPensar", p_feita: true });
    expect(invalidadas(client)).toEqual([true, true]);
    // Uma visita no futuro não se dá como feita.
    await act(async () => { await result.current.resultado("futura", { resultado: "aPensar" }); });
    expect(parametros(1)).toEqual({ p_visita_id: "futura", p_resultado: "aPensar", p_feita: false });
  });

  it("marcar como feita sem resultado: p_resultado nulo e p_feita verdadeiro, sem encerrar nada", async () => {
    const { result } = montar();
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    await act(async () => { await result.current.resultado("passada", { resultado: null }); });
    expect(chamadas()).toEqual(["neg_resultado_visita"]);
    expect(parametros(0)).toEqual({ p_visita_id: "passada", p_resultado: null, p_feita: true });
  });

  it("um resultado que encerra: neg_encerrar_abordagem PRIMEIRO, com o motivo, e só depois neg_resultado_visita", async () => {
    const { result } = montar();
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    await act(async () => { await result.current.resultado("passada", encerra); });
    expect(chamadas()).toEqual(["neg_encerrar_abordagem", "neg_resultado_visita"]);
    expect(parametros(0)).toMatchObject({ p_organization_id: "org-1", p_entity_id: PESSOA_ID, p_resultado: "semInteresse", p_motivo: "preco" });
  });

  it("NG011 ao encerrar pára: o resultado não se escreve e nada se invalida", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaErro("NG011"));
    const erro = await erroDe(act(async () => result.current.resultado("passada", encerra)));
    expect(erro.chave).toBe("pessoasPagina.erroNeg.ng011");
    expect(chamadas()).toEqual(["neg_encerrar_abordagem"]);
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("falha parcial: encerrou e o resultado falhou. Avisa das duas coisas, com a mensagem do diálogo, e invalida", async () => {
    const { result, client } = montar();
    semear(client);
    rpcMock.mockReturnValueOnce(respostaOk({ mudou: true })).mockReturnValueOnce(respostaErro("NG018"));
    const erro = await erroDe(act(async () => result.current.resultado("passada", encerra)));
    expect(erro.chave).toBe("pessoasPagina.real.ficha.partialVisit");
    expect(erro.chaveExtra).toBe(`${V}err.resultado.ng018`);
    expect(erro.codigo).toBe("NG018");
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("um resultado que não encerra e falha é falha total, lida para o diálogo (NG004, NG018, NG009), sem invalidar", async () => {
    const { result, client } = montar();
    semear(client);
    for (const [codigo, chave] of [["NG004", `${V}err.resultado.ng004`], ["NG018", `${V}err.resultado.ng018`], ["NG009", `${V}err.resultado.ng009`]]) {
      rpcMock.mockReturnValueOnce(respostaErro(codigo));
      const erro = await erroDe(act(async () => result.current.resultado("passada", { resultado: "interessado" })));
      expect(erro.chave).toBe(chave);
      expect(erro.chaveExtra).toBeUndefined();
    }
    expect(invalidadas(client)).toEqual([false, false]);
  });

  it("uma visita que a ficha não tem (ou a ficha a recarregar) não chama a base e pede para recarregar, em vez de parecer uma falha de rede", async () => {
    const { result } = montar();
    expect((await erroDe(act(async () => result.current.resultado("nao-existe", { resultado: "aPensar" })))).chave).toBe(`${V}err.visitNotLoaded`);
    const sem = montar({ ficha: null });
    expect((await erroDe(act(async () => sem.result.current.resultado("passada", { resultado: "aPensar" })))).chave).toBe(`${V}err.visitNotLoaded`);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("trocar de pessoa a meio: a ficha nova não tem a visita da anterior, e recusa sem chamar a base", async () => {
    const { result, rerender } = montarComPessoa({ pessoaId: PESSOA_ID, ficha: FICHA });
    rerender({ pessoaId: "outra-pessoa", ficha: fichaDb({ visitas: seccaoDb([]) }) });
    expect((await erroDe(act(async () => result.current.resultado("passada", { resultado: "aPensar" })))).chave).toBe(`${V}err.visitNotLoaded`);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([["NG018", `${V}err.resultado.ng018`], ["NG004", `${V}err.resultado.ng004`], ["NG009", `${V}err.resultado.ng009`]])(
    "um resultado que encerra: %s no encerramento é lido para o diálogo de resultado (não a leitura geral) e o resultado não se escreve", async (codigo, chave) => {
      const { result, client } = montar();
      semear(client);
      rpcMock.mockReturnValueOnce(respostaErro(codigo));
      const erro = await erroDe(act(async () => result.current.resultado("passada", encerra)));
      expect(erro.chave).toBe(chave);
      expect(erro.codigo).toBe(codigo);
      expect(chamadas()).toEqual(["neg_encerrar_abordagem"]);
      expect(invalidadas(client)).toEqual([false, false]);
    },
  );

  it("o mesmo pedido de duas pessoas diferentes não se partilha (a pessoa conta na assinatura do pedido em curso)", async () => {
    const { result, rerender } = montarComPessoa({ pessoaId: PESSOA_ID, ficha: FICHA });
    let responder: (v: unknown) => void = () => {};
    rpcMock.mockReturnValueOnce(new Promise((r) => { responder = r; }));
    rpcMock.mockReturnValueOnce(respostaOk({ visita_id: "futura", mudou: true }));
    let primeira: Promise<unknown> = Promise.resolve();
    act(() => { primeira = result.current.cancelar("futura"); });
    rerender({ pessoaId: "outra-pessoa", ficha: FICHA });
    await act(async () => { await result.current.cancelar("futura"); });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    await act(async () => { responder({ data: { visita_id: "futura", mudou: true }, error: null }); await primeira; });
  });

  it("duplo clique partilha a resposta (uma só ida à base)", async () => {
    const { result } = montar();
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    await act(async () => { await Promise.all([result.current.resultado("passada", { resultado: "aPensar" }), result.current.resultado("passada", { resultado: "aPensar" })]); });
    expect(chamadas()).toEqual(["neg_resultado_visita"]);
  });

  it("usa a visita mais recente da ficha (a ficha pode mudar entre renders)", async () => {
    const { result, rerender } = montar({ ficha: fichaDb({ visitas: seccaoDb([]) }) });
    rerender({ ficha: fichaDb({ visitas: seccaoDb([visitaDb({ id: "nova", inicio: "2026-10-18T09:00:00Z" })]) }) });
    rpcMock.mockReturnValue(respostaOk({ mudou: true }));
    await act(async () => { await result.current.resultado("nova", { resultado: "aPensar" }); });
    expect(chamadas()).toEqual(["neg_resultado_visita"]);
  });
});
