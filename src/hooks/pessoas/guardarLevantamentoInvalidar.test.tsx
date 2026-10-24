// useGuardarLevantamento depois de escrever: invalida a ficha da pessoa e as listas (o levantamento aparece em todo o lado sem recarregar a página),
// e também depois de uma recusa que quer dizer «a ficha está desatualizada» (NG005, levantamento já ligado a um negócio; NG013, o negócio já tem um).
// Uma recusa que não diz nada sobre o estado (NG009) não invalida: nada mudou na base.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { invalidadas, semear } from "./acoesFichaTestUtil";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, criarCliente, fonteReal, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { useGuardarLevantamento, type EntradaGuardarLevantamento } from "./guardarLevantamento";
import { QuestionarioFormularioProvider } from "./QuestionarioFormularioProvider";
import { FontePessoasContext } from "./useFontePessoas";
import { QUESTIONARIO_BRUTO } from "./workflow/questionarioTestUtil";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return { useTranslation: () => ({ language: "pt", t: (key: string) => negocioMetasTranslations.pt[key] ?? key }) };
});

const ENTRADA: EntradaGuardarLevantamento = {
  id: "lev-1", organizationId: "org-1", entityId: PESSOA_ID, dados: { data_levantamento: "2026-10-20" }, linhas: [], respostas: {},
};
const OK = { levantamento_id: "lev-1", criado: true, mudou: true, ligado_a: null, versao_questionario: 7, questionario_mudou: false };

async function montar(gravar: () => Promise<unknown>) {
  const client = criarCliente();
  semear(client);
  rpcMock.mockImplementation((nome: string) => (nome === "neg_questionario_levantamento" ? respostaOk(QUESTIONARIO_BRUTO) : gravar()));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonteReal()}><QuestionarioFormularioProvider>{children}</QuestionarioFormularioProvider></FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  const h = renderHook(() => useGuardarLevantamento(), { wrapper });
  await waitFor(() => expect(h.result.current.pronto).toBe(true));
  return { client, ...h };
}

beforeEach(() => { rpcMock.mockReset(); captureMock.mockReset(); });

describe("useGuardarLevantamento: invalidar", () => {
  it("depois de gravar invalida a ficha da pessoa e as listas", async () => {
    const { result, client } = await montar(() => respostaOk(OK));
    await act(async () => { await result.current.guardar(ENTRADA); });
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it.each(["NG005", "NG013"])("%s: lança o erro traduzido e refaz a ficha (o levantamento já não está como a ficha mostrava)", async (codigo) => {
    const { result, client } = await montar(() => respostaErro(codigo));
    let erro: unknown;
    await act(async () => { erro = await result.current.guardar(ENTRADA).catch((e: unknown) => e); });
    expect((erro as { codigo: string }).codigo).toBe(codigo);
    expect(invalidadas(client)).toEqual([true, true]);
  });

  it("uma recusa que não diz nada sobre o estado (NG009) não invalida", async () => {
    const { result, client } = await montar(() => respostaErro("NG009"));
    await act(async () => { await result.current.guardar(ENTRADA).catch(() => undefined); });
    expect(invalidadas(client)).toEqual([false, false]);
  });
});
