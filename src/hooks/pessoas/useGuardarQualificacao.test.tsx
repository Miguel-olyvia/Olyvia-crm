// Guardar a qualificação de um negócio (neg_guardar_qualificacao): respostas da aba Qualificação, pedido do cliente e versão do questionário.
// p_respostas NULL não mexe e {} apaga tudo; p_pedido_cliente NULL não mexe e vazio limpa.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { lerQuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import { ErroNeg } from "./chamarNeg";
import { captureMock, criarCliente, fonteReal, nomeChamado, parametros, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { paramsGuardarQualificacao, useGuardarQualificacao } from "./useGuardarQualificacao";
import { QuestionarioFormularioProvider } from "./QuestionarioFormularioProvider";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { QUESTIONARIO_BRUTO } from "./workflow/questionarioTestUtil";

const { avisar } = vi.hoisted(() => ({ avisar: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));
vi.mock("@/lib/toast", () => ({ toast: { info: avisar, error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return { useTranslation: () => ({ language: "pt", t: (key: string) => negocioMetasTranslations.pt[key] ?? key }) };
});

const Q = lerQuestionarioForm(QUESTIONARIO_BRUTO)!;
const RESPOSTA = { qualificacao_id: "q-1", criado: true, mudou: true, versao_questionario: 7, questionario_mudou: false };
const ENTRADA = { negocioId: "neg-1", entityId: "ent-1", respostas: { imovel: "moradia,apartamento", orcCliente: "12,5", acesso: "dificil" }, pedidoCliente: "  Remodelar  " };

describe("paramsGuardarQualificacao", () => {
  it("manda só as respostas da aba Qualificação, o pedido aparado e a versão do questionário", () => {
    expect(paramsGuardarQualificacao(ENTRADA, Q)).toEqual({
      p_negocio_id: "neg-1",
      p_respostas: { imovel: { escolhas: ["apartamento", "moradia"] }, orcCliente: { numero: 12.5 } },
      p_pedido_cliente: "Remodelar",
      p_versao_questionario: 7,
    });
  });

  it("sem respostas na entrada, p_respostas vai a null (não mexe); com {} apaga tudo", () => {
    expect(paramsGuardarQualificacao({ negocioId: "n", entityId: "e", pedidoCliente: "x" }, Q).p_respostas).toBeNull();
    expect(paramsGuardarQualificacao({ negocioId: "n", entityId: "e", respostas: {} }, Q).p_respostas).toEqual({});
  });

  it("sem pedido na entrada, p_pedido_cliente vai a null (não mexe); vazio limpa e vai vazio", () => {
    expect(paramsGuardarQualificacao({ negocioId: "n", entityId: "e", respostas: {} }, Q).p_pedido_cliente).toBeNull();
    expect(paramsGuardarQualificacao({ negocioId: "n", entityId: "e", pedidoCliente: "   " }, Q).p_pedido_cliente).toBe("");
  });

  it("com um questionário do código (sem versão) a versão vai a null", () => {
    expect(paramsGuardarQualificacao(ENTRADA, { ...Q, versao: null }).p_versao_questionario).toBeNull();
  });

  it("recusa antes de montar: nada para mexer, número inválido, pedido com mais de 2000 caracteres", () => {
    const chave = (f: () => unknown) => { try { f(); } catch (e) { return (e as ErroNeg).chave; } return null; };
    expect(chave(() => paramsGuardarQualificacao({ negocioId: "n", entityId: "e" }, Q))).toBe("pessoasPagina.erroNeg.ng009");
    expect(chave(() => paramsGuardarQualificacao({ ...ENTRADA, respostas: { orcCliente: "abc" } }, Q))).toBe("businessGoals.new.qform.invalid");
    expect(chave(() => paramsGuardarQualificacao({ ...ENTRADA, pedidoCliente: "x".repeat(2001) }, Q))).toBe("pessoasPagina.erroNeg.ng009");
    expect(chave(() => paramsGuardarQualificacao({ ...ENTRADA, pedidoCliente: "x".repeat(2000) }, Q))).toBeNull();
  });

  it("uma resposta inválida de outra aba (a Visita) não bloqueia a Qualificação", () => {
    expect(() => paramsGuardarQualificacao({ ...ENTRADA, respostas: { imovel: "moradia", notas: "x".repeat(2001) } }, Q)).not.toThrow();
  });

  it("não muda a entrada", () => {
    const antes = JSON.stringify(ENTRADA);
    paramsGuardarQualificacao(ENTRADA, Q);
    expect(JSON.stringify(ENTRADA)).toBe(antes);
  });
});

function montar(fonte: FontePessoas = fonteReal()) {
  const client = criarCliente();
  client.setQueryData(["neg-ficha-pessoa", "org-1", "ent-1"], { x: 1 });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonte}>
        <QuestionarioFormularioProvider>{children}</QuestionarioFormularioProvider>
      </FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  return { client, ...renderHook(() => useGuardarQualificacao(), { wrapper }) };
}
const chamadasDe = (nome: string) => rpcMock.mock.calls.filter((c) => c[0] === nome);
const pronto = async (r: { result: { current: ReturnType<typeof useGuardarQualificacao> } }) => waitFor(() => expect(r.result.current.pronto).toBe(true));

beforeEach(() => {
  [rpcMock, captureMock, avisar].forEach((m) => m.mockReset());
  rpcMock.mockImplementation((nome: string) => respostaOk(nome === "neg_questionario_levantamento" ? QUESTIONARIO_BRUTO : RESPOSTA));
});

describe("useGuardarQualificacao", () => {
  it("grava e lê o resultado; refaz a ficha", async () => {
    const h = montar();
    await pronto(h);
    let r: unknown;
    await act(async () => { r = await h.result.current.guardar(ENTRADA); });
    expect(chamadasDe("neg_guardar_qualificacao")).toHaveLength(1);
    expect(parametros(rpcMock.mock.calls.findIndex((c) => c[0] === "neg_guardar_qualificacao"))).toEqual(paramsGuardarQualificacao(ENTRADA, Q));
    expect(r).toEqual({ qualificacaoId: "q-1", criado: true, mudou: true, versaoQuestionario: 7, questionarioMudou: false });
    expect(h.client.getQueryState(["neg-ficha-pessoa", "org-1", "ent-1"])?.isInvalidated).toBe(true);
    expect(avisar).not.toHaveBeenCalled();
  });

  it("se a base diz que o questionário mudou: já gravou, recarrega as perguntas e avisa", async () => {
    rpcMock.mockImplementation((nome: string) => respostaOk(nome === "neg_questionario_levantamento" ? QUESTIONARIO_BRUTO : { ...RESPOSTA, questionario_mudou: true, versao_questionario: 8 }));
    const h = montar();
    await pronto(h);
    let r: { questionarioMudou: boolean } | undefined;
    await act(async () => { r = (await h.result.current.guardar(ENTRADA)) as typeof r; });
    expect(r?.questionarioMudou).toBe(true);
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it("uma resposta inválida não chama a base de gravação", async () => {
    const h = montar();
    await pronto(h);
    let erro: unknown;
    await act(async () => { erro = await h.result.current.guardar({ ...ENTRADA, respostas: { orcCliente: "abc" } }).then(() => null, (e) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(chamadasDe("neg_guardar_qualificacao")).toHaveLength(0);
  });

  it("só pedido do cliente (sem respostas) também grava, sem tocar nas respostas", async () => {
    const h = montar();
    await pronto(h);
    await act(async () => { await h.result.current.guardar({ negocioId: "neg-1", entityId: "ent-1", pedidoCliente: "Casa de banho" }); });
    const i = rpcMock.mock.calls.findIndex((c) => c[0] === "neg_guardar_qualificacao");
    expect(parametros(i)).toMatchObject({ p_respostas: null, p_pedido_cliente: "Casa de banho" });
  });

  it("erros da base saem como ErroNeg com o código (NG001, NG002, NG028) e não refazem a ficha", async () => {
    for (const codigo of ["NG001", "NG002", "NG028"]) {
      rpcMock.mockImplementation((nome: string) => (nome === "neg_questionario_levantamento" ? respostaOk(QUESTIONARIO_BRUTO) : respostaErro(codigo)));
      const h = montar();
      await pronto(h);
      let erro: unknown;
      await act(async () => { erro = await h.result.current.guardar(ENTRADA).then(() => null, (e) => e); });
      expect((erro as ErroNeg).codigo, codigo).toBe(codigo);
      expect(h.client.getQueryState(["neg-ficha-pessoa", "org-1", "ent-1"])?.isInvalidated).toBeFalsy();
    }
  });

  it("um segundo pedido durante o primeiro devolve o que está em curso (uma só chamada)", async () => {
    const h = montar();
    await pronto(h);
    await act(async () => { await Promise.all([h.result.current.guardar(ENTRADA), h.result.current.guardar(ENTRADA)]); });
    expect(chamadasDe("neg_guardar_qualificacao")).toHaveLength(1);
  });

  it("em modo exemplo (sem base) recusa com o erro genérico, sem chamar a base", async () => {
    const h = montar({ modo: "exemplo" } as unknown as FontePessoas);
    let erro: unknown;
    await act(async () => { erro = await h.result.current.guardar(ENTRADA).then(() => null, (e) => e); });
    expect(erro).toBeInstanceOf(ErroNeg);
    expect(chamadasDe("neg_guardar_qualificacao")).toHaveLength(0);
  });
});
