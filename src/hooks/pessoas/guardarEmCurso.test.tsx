// Robustez dos hooks de gravação (qualificação e levantamento): um pedido diferente durante outro é recusado com erro explícito (não devolve o
// resultado do outro), e uma recarga das perguntas que falha DEPOIS de gravar não transforma a gravação numa falha.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { QuestionarioContext, type ValorQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { lerQuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import { ErroNeg } from "./chamarNeg";
import { captureMock, criarCliente, fonteReal, respostaOk, rpcMock } from "./fichaTestUtil";
import { useGuardarLevantamento, type EntradaGuardarLevantamento } from "./guardarLevantamento";
import { useGuardarQualificacao } from "./useGuardarQualificacao";
import { FontePessoasContext } from "./useFontePessoas";
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
const QUAL = { negocioId: "neg-1", entityId: "ent-1", respostas: { imovel: "moradia" }, pedidoCliente: "A" };
const LEV: EntradaGuardarLevantamento = { id: "lev-1", organizationId: "org-1", entityId: "ent-1", dados: { estado: "feito" }, linhas: [], respostas: { acesso: "dificil" } };

function valor(recarregar: ValorQuestionario["recarregar"]): ValorQuestionario {
  return { questionario: Q, estado: "pronto", erro: null, podeGuardar: true, repetir: () => {}, recarregar };
}
function montar<R>(usar: () => R, recarregar: ValorQuestionario["recarregar"] = async () => Q) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={criarCliente()}>
      <FontePessoasContext.Provider value={fonteReal()}>
        <QuestionarioContext.Provider value={valor(recarregar)}>{children}</QuestionarioContext.Provider>
      </FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  return renderHook(usar, { wrapper });
}

/** Um rpc que só responde quando se mandar. */
function rpcSuspenso() {
  let libertar: (v: unknown) => void = () => {};
  rpcMock.mockImplementation(() => new Promise((res) => { libertar = (data) => res({ data, error: null }); }));
  return (data: unknown) => libertar(data);
}

beforeEach(() => { [rpcMock, captureMock, avisar].forEach((m) => m.mockReset()); });

describe.each([
  ["useGuardarQualificacao", () => useGuardarQualificacao(), QUAL, { ...QUAL, pedidoCliente: "B" }, { qualificacao_id: "q", questionario_mudou: true }],
  ["useGuardarLevantamento", () => useGuardarLevantamento(), LEV, { ...LEV, respostas: { acesso: "facil" } }, { levantamento_id: "l", questionario_mudou: true }],
] as const)("%s", (_nome, usar, igual, diferente, respostaMudou) => {
  const hook = usar as () => { guardar: (e: never) => Promise<unknown> };

  it("um pedido equivalente durante o primeiro devolve o que está em curso (uma só chamada)", async () => {
    const libertar = rpcSuspenso();
    const h = montar(hook);
    let a!: Promise<unknown>; let b!: Promise<unknown>;
    act(() => { a = h.result.current.guardar(igual as never); b = h.result.current.guardar({ ...igual } as never); });
    libertar({});
    await act(async () => { await Promise.all([a, b]); });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("um pedido DIFERENTE durante o primeiro é recusado com erro explícito e não devolve o resultado do outro", async () => {
    const libertar = rpcSuspenso();
    const h = montar(hook);
    let a!: Promise<unknown>; let b!: Promise<unknown>;
    act(() => { a = h.result.current.guardar(igual as never); b = h.result.current.guardar(diferente as never); });
    const erro = await b.then(() => null, (e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroNeg);
    expect((erro as ErroNeg).chave).toBe("businessGoals.new.qform.alreadySaving");
    libertar({});
    await act(async () => { await a; });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("se a recarga das perguntas rejeitar depois de gravar, a gravação não falha e avisa «sem recarga»", async () => {
    rpcMock.mockImplementation(() => respostaOk(respostaMudou));
    const h = montar(hook, () => Promise.reject(new Error("rede")));
    let r: unknown; let erro: unknown = null;
    await act(async () => { r = await h.result.current.guardar(igual as never).catch((e: unknown) => { erro = e; return null; }); });
    expect(erro).toBeNull();
    expect(r).toMatchObject({ questionarioMudou: true });
    expect(avisar).toHaveBeenCalledWith(expect.stringContaining("não foi possível recarregar"));
  });
});
