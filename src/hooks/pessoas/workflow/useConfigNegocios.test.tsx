// useConfigNegocios: lê a configuração do fecho da tabela negocio_workflow_config (pela regra de acesso dela, como o separador «Qualificação» lê as
// regras) e escreve SÓ por neg_guardar_config_negocios (6 argumentos). Parâmetros exatos, cache depois de sucesso, erros traduzíveis, valores
// inválidos recusados sem ir à base e um só pedido em voo. O Supabase é simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { erroDe } from "../acoesFichaTestUtil";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "../fichaTestUtil";
import type { ConfigNegocios } from "./configNegocios";
import { configNegociosQueryKey, useConfigNegocios } from "./useConfigNegocios";

const fromMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const maybeSingleMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args), from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const LINHA = { conversao_ao_ganhar: "automatica", recusa_proposta: "perder", recusa_contrato: "perder", cancelamento_no_prazo: "perder", reflexao_dias: null };
const CONFIG: ConfigNegocios = { conversaoAoGanhar: "manual", recusaProposta: "manter_aberto", recusaContrato: "perder", cancelamentoNoPrazo: "manter_ganho", reflexaoDias: 14 };
const linha = (l: unknown = LINHA) => Promise.resolve({ data: l, error: null });
const resposta = (extra: Record<string, unknown> = {}) => ({
  antes: LINHA,
  depois: { conversao_ao_ganhar: "manual", recusa_proposta: "manter_aberto", recusa_contrato: "perder", cancelamento_no_prazo: "manter_ganho", reflexao_dias: 14 },
  mudou: true, aviso_conversao_contratos: false, ...extra,
});

beforeEach(() => {
  [rpcMock, captureMock, fromMock, selectMock, eqMock, maybeSingleMock].forEach((m) => m.mockReset());
  fromMock.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockReturnValue({ maybeSingle: maybeSingleMock });
  maybeSingleMock.mockReturnValue(linha());
});

const montar = (habilitado = true, opcoes: Parameters<typeof montarHook>[2] = {}) => montarHook((h: boolean) => useConfigNegocios(h), habilitado, opcoes);

describe("useConfigNegocios: leitura", () => {
  it("lê só a linha da organização, só as cinco colunas da configuração, e devolve-a", async () => {
    const { result } = montar();
    expect(result.current.estado).toBe("a-carregar");
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(fromMock).toHaveBeenCalledWith("negocio_workflow_config");
    expect(selectMock).toHaveBeenCalledWith("conversao_ao_ganhar, recusa_proposta, recusa_contrato, cancelamento_no_prazo, reflexao_dias");
    expect(eqMock).toHaveBeenCalledWith("organization_id", "org-1");
    expect(result.current.dados).toEqual({
      conversaoAoGanhar: "automatica", recusaProposta: "perder", recusaContrato: "perder", cancelamentoNoPrazo: "perder", reflexaoDias: null,
    });
  });

  it("sem linha (a organização não tem a configuração) o estado é «sem-config», sem erro e sem dados", async () => {
    maybeSingleMock.mockReturnValue(linha(null));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("sem-config"));
    expect(result.current.dados).toBeNull();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("não lê nada com o hook desligado nem fora do modo real", async () => {
    montar(false);
    montar(true, { fonte: { modo: "exemplo" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uma falha da leitura dá o estado «erro», vai para o registo de erros e não inventa dados", async () => {
    maybeSingleMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "XX000", message: "rebentou" } }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.dados).toBeNull();
    expect(captureMock).toHaveBeenCalled();
  });

  it("valores que a base não aceita dão «erro» e não se mostram como se fossem bons", async () => {
    maybeSingleMock.mockReturnValue(linha({ ...LINHA, recusa_proposta: "xpto" }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.dados).toBeNull();
  });

  it("recarregar volta a ler", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    maybeSingleMock.mockReturnValue(linha({ ...LINHA, conversao_ao_ganhar: "manual" }));
    act(() => result.current.recarregar());
    await waitFor(() => expect(result.current.dados?.conversaoAoGanhar).toBe("manual"));
  });
});

describe("useConfigNegocios: guardar", () => {
  it("chama neg_guardar_config_negocios com exatamente os seis parâmetros", async () => {
    rpcMock.mockReturnValue(respostaOk(resposta()));
    const { result } = montar(false);
    await act(async () => { await result.current.guardar(CONFIG); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(nomeChamado(0)).toBe("neg_guardar_config_negocios");
    expect(parametros(0)).toEqual({
      p_organization_id: "org-1", p_conversao_ao_ganhar: "manual", p_recusa_proposta: "manter_aberto", p_recusa_contrato: "perder",
      p_cancelamento_no_prazo: "manter_ganho", p_reflexao_dias: 14,
    });
    expect(Object.keys(parametros(0))).toHaveLength(6);
  });

  it("só escreve pela função: nunca toca na tabela nem noutra função", async () => {
    rpcMock.mockReturnValue(respostaOk(resposta()));
    const { result } = montar(false);
    await act(async () => { await result.current.guardar(CONFIG); });
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock.mock.calls.map((c) => c[0])).toEqual(["neg_guardar_config_negocios"]);
  });

  it("devolve mudou, o que a base ficou com e o aviso das conversões", async () => {
    rpcMock.mockReturnValue(respostaOk(resposta({ aviso_conversao_contratos: true })));
    const { result } = montar(false);
    let r: unknown;
    await act(async () => { r = await result.current.guardar(CONFIG); });
    expect(r).toEqual({ mudou: true, depois: CONFIG, avisoConversaoContratos: true });
  });

  it("depois de gravar a cache fica com o que a base devolveu", async () => {
    rpcMock.mockReturnValue(respostaOk(resposta()));
    const { result, client } = montar(false);
    await act(async () => { await result.current.guardar(CONFIG); });
    expect(client.getQueryData(configNegociosQueryKey("org-1"))).toEqual(CONFIG);
  });

  it("uma resposta que não se reconhece, depois de mudar, manda reler da base", async () => {
    rpcMock.mockReturnValue(respostaOk({ mudou: true, depois: "x" }));
    const client = criarCliente();
    client.setQueryData(configNegociosQueryKey("org-1"), CONFIG);
    const { result } = montar(false, { client, fonte: fonteReal() });
    await act(async () => { await result.current.guardar(CONFIG); });
    expect(client.getQueryState(configNegociosQueryKey("org-1"))?.isInvalidated).toBe(true);
  });

  it("sem alterações (mudou: false) não mexe na cache", async () => {
    rpcMock.mockReturnValue(respostaOk(resposta({ mudou: false })));
    const client = criarCliente();
    client.setQueryData(configNegociosQueryKey("org-1"), { ...CONFIG, reflexaoDias: 99 });
    const { result } = montar(false, { client, fonte: fonteReal() });
    await act(async () => { await result.current.guardar(CONFIG); });
    expect(client.getQueryState(configNegociosQueryKey("org-1"))?.isInvalidated).toBe(false);
  });

  it.each([0, 366, 1.5, -1, Number.NaN])("um prazo de %s recusa com NG009 sem ir à base", async (dias) => {
    const { result } = montar(false);
    const erro = await erroDe(act(async () => { await result.current.guardar({ ...CONFIG, reflexaoDias: dias }); }));
    expect(erro).toMatchObject({ codigo: "NG009", chave: "pessoasPagina.erroNeg.ng009" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("um valor que a base não aceita recusa com NG009 sem ir à base", async () => {
    const { result } = montar(false);
    const erro = await erroDe(act(async () => { await result.current.guardar({ ...CONFIG, recusaProposta: "xpto" as never }); }));
    expect(erro).toMatchObject({ codigo: "NG009" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([["NG008", "ng008"], ["NG009", "ng009"], ["42501", "permissao"]])("%s sai como ErroNeg traduzível (%s)", async (codigo, chave) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const { result } = montar(false);
    const erro = await erroDe(act(async () => { await result.current.guardar(CONFIG); }));
    expect(erro).toMatchObject({ codigo, chave: `pessoasPagina.erroNeg.${chave}` });
  });

  it("sem organização (fora do modo real) recusa sem ir à base", async () => {
    const { result } = montar(false, { fonte: { modo: "exemplo" } });
    const erro = await erroDe(act(async () => { await result.current.guardar(CONFIG); }));
    expect(erro).toMatchObject({ chave: "pessoasPagina.erroNeg.generico" });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("dois pedidos ao mesmo tempo (duplo clique) fazem UMA chamada à base e aGuardar sobe e desce", async () => {
    let acabar: (v: unknown) => void = () => undefined;
    rpcMock.mockReturnValue(new Promise((r) => { acabar = r; }));
    const { result } = montar(false);
    let a: Promise<unknown> | undefined;
    let b: Promise<unknown> | undefined;
    act(() => { a = result.current.guardar(CONFIG); b = result.current.guardar(CONFIG); });
    expect(result.current.aGuardar).toBe(true);
    await act(async () => { acabar({ data: resposta(), error: null }); await Promise.all([a, b]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.current.aGuardar).toBe(false);
  });
});
