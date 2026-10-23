// useQuestionarioFormulario: o formulário do levantamento lê as perguntas da base (neg_questionario_levantamento, sem inativas), com cache por
// organização, estado de carregamento e erro com repetição; fora do modo real vale o catálogo do código. Supabase simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { QUESTIONARIO_CODIGO, lerQuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import { ErroNeg } from "./chamarNeg";
import { captureMock, criarCliente, fonteReal, montarHook, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { FontePessoasContext } from "./useFontePessoas";
import { questionarioFormularioQueryKey, useQuestionarioFormulario } from "./useQuestionarioFormulario";
import { QUESTIONARIO_BRUTO } from "./workflow/questionarioTestUtil";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const ESPERADO = lerQuestionarioForm(QUESTIONARIO_BRUTO)!;
const montar = (habilitado = true, opcoes: Parameters<typeof montarHook>[2] = {}) => montarHook((h: boolean) => useQuestionarioFormulario(h), habilitado, opcoes);
const leituras = () => rpcMock.mock.calls.filter((c) => c[0] === "neg_questionario_levantamento").length;

beforeEach(() => {
  [rpcMock, captureMock].forEach((m) => m.mockReset());
  rpcMock.mockImplementation(() => respostaOk(QUESTIONARIO_BRUTO));
});

describe("useQuestionarioFormulario: leitura", () => {
  it("pede as perguntas da organização SEM as inativas (a quem preenche de novo) e começa por estar a carregar, sem deixar gravar", async () => {
    const { result } = montar();
    expect(result.current.estado).toBe("a-carregar");
    expect(result.current.podeGuardar).toBe(false);
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(nomeChamado(0)).toBe("neg_questionario_levantamento");
    expect(parametros(0)).toEqual({ p_organization_id: "org-1", p_incluir_inactivas: false });
    expect(result.current.questionario).toEqual(ESPERADO);
    expect(result.current.questionario.semBase).toBe(false);
    expect(result.current.podeGuardar).toBe(true);
    expect(result.current.erro).toBeNull();
  });

  it("a organização vem da fonte da página", async () => {
    const { result } = montar(true, { fonte: fonteReal("org-9") });
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(parametros(0).p_organization_id).toBe("org-9");
  });

  it("fora do modo real vale o catálogo do código: pronto, a poder gravar, sem chamar a base", async () => {
    const { result } = montar(true, { fonte: { modo: "exemplo" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.questionario).toBe(QUESTIONARIO_CODIGO);
    expect(result.current.estado).toBe("pronto");
    expect(result.current.podeGuardar).toBe(true);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("desligado não lê nada: fica por carregar e sem gravar (nunca se grava com um questionário por carregar)", async () => {
    const { result } = montar(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.podeGuardar).toBe(false);
  });

  it("no modo real sem organização não fica a carregar para sempre: é um erro (sem acesso), não grava, não lê e «Repetir» não pergunta nada à base", async () => {
    const { result } = montar(true, { fonte: fonteReal("") });
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect((result.current.erro as ErroNeg).codigo).toBe("NG008");
    expect(result.current.podeGuardar).toBe(false);
    act(() => result.current.repetir());
    await new Promise((r) => setTimeout(r, 20));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.estado).toBe("erro");
  });

  it("desligado, sem organização, continua por carregar (só se diz erro quando se queria ler)", async () => {
    const { result } = montar(false, { fonte: fonteReal("") });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.estado).toBe("a-carregar");
  });

  it.each(["NG008", "42501"])("%s: erro à vista com o código, não deixa gravar e não vai para o registo de avarias", async (codigo) => {
    rpcMock.mockReturnValue(respostaErro(codigo));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect((result.current.erro as ErroNeg).codigo).toBe(codigo);
    expect(result.current.podeGuardar).toBe(false);
    expect(result.current.questionario.seccoes).toEqual([]);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("uma avaria (sem código) repete duas vezes e depois fica em erro; vai para o registo de avarias", async () => {
    rpcMock.mockReturnValue(Promise.resolve({ data: null, error: { code: "XX000", message: "boom" } }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(leituras()).toBe(3);
    expect(captureMock).toHaveBeenCalled();
  });

  it("uma resposta que não é um questionário conta como erro (nunca se inventa um)", async () => {
    rpcMock.mockReturnValue(respostaOk({ versao: "x" }));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    expect(result.current.podeGuardar).toBe(false);
  });

  it("«Repetir» volta a pedir e, se agora correr bem, fica pronto e a poder gravar", async () => {
    rpcMock.mockReturnValueOnce(respostaErro("NG008"));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    act(() => result.current.repetir());
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(result.current.podeGuardar).toBe(true);
    expect(leituras()).toBe(2);
  });

  it("durante a repetição volta a dizer que está a carregar (e não deixa gravar)", async () => {
    rpcMock.mockReturnValueOnce(respostaErro("NG008"));
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("erro"));
    rpcMock.mockReturnValueOnce(new Promise(() => {}));
    act(() => result.current.repetir());
    await waitFor(() => expect(result.current.estado).toBe("a-carregar"));
    expect(result.current.podeGuardar).toBe(false);
  });
});

describe("useQuestionarioFormulario: cache por organização", () => {
  it("duas montagens da mesma organização leem uma vez só (staleTime de 5 minutos)", async () => {
    const client = criarCliente();
    const primeiro = montar(true, { client });
    await waitFor(() => expect(primeiro.result.current.estado).toBe("pronto"));
    const segundo = montar(true, { client });
    expect(segundo.result.current.estado).toBe("pronto");
    await new Promise((r) => setTimeout(r, 20));
    expect(leituras()).toBe(1);
    expect(client.getQueryCache().find({ queryKey: questionarioFormularioQueryKey("org-1") })).toBeDefined();
    expect(client.getQueryCache().find({ queryKey: questionarioFormularioQueryKey("org-1") })?.observers[0]?.options.staleTime).toBe(5 * 60 * 1000);
  });

  it("outra organização lê as suas perguntas (a cache não se mistura)", async () => {
    const client = criarCliente();
    const a = montar(true, { client, fonte: fonteReal("org-a") });
    await waitFor(() => expect(a.result.current.estado).toBe("pronto"));
    const b = montar(true, { client, fonte: fonteReal("org-b") });
    await waitFor(() => expect(b.result.current.estado).toBe("pronto"));
    expect(leituras()).toBe(2);
    expect(questionarioFormularioQueryKey("org-a")).not.toEqual(questionarioFormularioQueryKey("org-b"));
  });

  it("a chave da cache não é a do separador do Workflow (esse lê com inativas)", () => {
    expect(questionarioFormularioQueryKey("org-1")).toEqual(["neg-questionario", "org-1"]);
  });

  it("recarregar lê de novo, ignora a cache e põe o questionário novo à vista", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    rpcMock.mockReturnValue(respostaOk({ ...QUESTIONARIO_BRUTO, versao: 8 }));
    let lido: unknown;
    await act(async () => { lido = await result.current.recarregar(); });
    expect(leituras()).toBe(2);
    expect((lido as { versao: number }).versao).toBe(8);
    await waitFor(() => expect(result.current.questionario.versao).toBe(8));
  });

  it("recarregar que falha devolve null e não estraga o que já se vê", async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    rpcMock.mockReturnValue(respostaErro("NG008"));
    let lido: unknown = "x";
    await act(async () => { lido = await result.current.recarregar(); });
    expect(lido).toBeNull();
    expect(result.current.questionario.versao).toBe(7);
  });
});

describe("a leitura do formulário e a do separador do Workflow não se confundem", () => {
  it("cada uma tem a sua cache, mesmo com a mesma organização", async () => {
    const client = criarCliente();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}><FontePessoasContext.Provider value={fonteReal()}>{children}</FontePessoasContext.Provider></QueryClientProvider>
    );
    const { result } = renderHook(() => useQuestionarioFormulario(true), { wrapper });
    await waitFor(() => expect(result.current.estado).toBe("pronto"));
    expect(client.getQueryCache().findAll().map((q) => q.queryKey[0])).toEqual(["neg-questionario"]);
  });
});
