// Classificar MQL ou SQL pela função nova neg_classificar_lead (migration C), atrás de uma bandeira: ligada, grava SÓ a classificação (sem reler nem
// regravar a lead inteira, sem contexto de auditoria: a função audita sozinha); desligada, mantém-se o caminho antigo (rpc_update_lead).
// O Supabase é simulado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, criarCliente, montarHook, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import type { FontePessoas } from "./useFontePessoas";
import { useQualificarLeadPessoa } from "./useQualificarLeadPessoa";

const bandeira = { ligada: true };
vi.mock("./bandeirasNegocio", () => ({
  useClassificarLeadAtivo: () => bandeira.ligada,
  usePermissoesPorNegocio: () => false,
}));

const leitura = vi.fn();
const tabelas: string[] = [];
function cadeia() {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = () => c;
  c.maybeSingle = () => leitura();
  return c;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args), from: (tabela: string) => { tabelas.push(tabela); return cadeia(); } },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const LEAD = "22222222-2222-4222-8222-222222222222";
const fonte = (utilizadorId: string | null = "u-1"): FontePessoas => ({ modo: "real", organizationId: "org-1", momentoGanho: null, utilizadorId });

beforeEach(() => {
  bandeira.ligada = true;
  rpcMock.mockReset(); captureMock.mockReset(); leitura.mockReset(); tabelas.length = 0;
  rpcMock.mockImplementation(() => respostaOk({ mudou: true, qualificacao_tipo: "mql", qualificado_em: "2026-10-21T10:00:00Z" }));
  leitura.mockResolvedValue({ data: { id: LEAD, field_values: {}, status: "new", source: null, notes: null, assigned_to: null }, error: null });
});
afterEach(() => vi.clearAllMocks());

const montar = (sobre: { fonte?: FontePessoas; leadId?: string } = {}) => {
  const client = criarCliente();
  client.setQueryData(["neg-ficha-pessoa", "org-1", PESSOA_ID], { x: 1 });
  client.setQueryData(["neg-resumo-pessoas", "org-1", { papel: null }], { x: 2 });
  const r = montarHook(({ id, lead }: { id: string; lead: string }) => useQualificarLeadPessoa(id, lead), { id: PESSOA_ID, lead: sobre.leadId ?? LEAD }, { fonte: sobre.fonte ?? fonte(), client });
  const invalidadas = () => [client.getQueryState(["neg-ficha-pessoa", "org-1", PESSOA_ID])?.isInvalidated, client.getQueryState(["neg-resumo-pessoas", "org-1", { papel: null }])?.isInvalidated];
  return { ...r, invalidadas };
};
const chamadas = () => rpcMock.mock.calls.map((c) => c[0] as string);
const erroDe = async (p: Promise<unknown>): Promise<ErroNeg> => (await p.then(() => null, (e) => e)) as ErroNeg;

describe("useQualificarLeadPessoa com neg_classificar_lead (bandeira ligada)", () => {
  it.each([["mql" as const], ["sql" as const], [null]])("%s: uma só chamada, só com a organização, a lead e o tipo", async (tipo) => {
    const { result } = montar();
    await act(async () => { await result.current.classificar(tipo); });
    expect(chamadas()).toEqual(["neg_classificar_lead"]);
    expect(rpcMock.mock.calls[0][1]).toEqual({ p_organization_id: "org-1", p_lead_id: LEAD, p_tipo: tipo });
  });

  it("não relê a lead, não regrava a lead inteira e não abre contexto de auditoria", async () => {
    const { result } = montar();
    await act(async () => { await result.current.classificar("mql"); });
    expect(tabelas).toEqual([]);
    expect(chamadas()).not.toContain("rpc_update_lead");
    expect(chamadas()).not.toContain("set_audit_context");
  });

  it("depois de gravar refaz a ficha e as listas", async () => {
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.classificar("sql"); });
    expect(invalidadas()).toEqual([true, true]);
  });

  it("se a lead já tinha esse tipo (mudou: false) termina bem", async () => {
    rpcMock.mockImplementation(() => respostaOk({ mudou: false, qualificacao_tipo: "mql", qualificado_em: null }));
    const { result } = montar();
    await act(async () => { await expect(result.current.classificar("mql")).resolves.toBeUndefined(); });
  });

  it.each(["NG003", "NG009", "42501"])("erro %s: lança ErroNeg com o código e não invalida", async (codigo) => {
    rpcMock.mockImplementation(() => respostaErro(codigo));
    const { result, invalidadas } = montar();
    const e = await act(async () => erroDe(result.current.classificar("sql")));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.codigo).toBe(codigo);
    expect(invalidadas()).toEqual([false, false]);
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("erro desconhecido dá a mensagem genérica e vai para a observabilidade", async () => {
    rpcMock.mockImplementation(() => respostaErro("XX000"));
    const { result } = montar();
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("sem o id do utilizador na fonte classifica na mesma: quem decide é a sessão da base", async () => {
    const { result } = montar({ fonte: fonte(null) });
    await act(async () => { await result.current.classificar("sql"); });
    expect(chamadas()).toEqual(["neg_classificar_lead"]);
    expect(rpcMock.mock.calls[0][1]).toEqual({ p_organization_id: "org-1", p_lead_id: LEAD, p_tipo: "sql" });
  });

  it("sem lead ou no exemplo não escreve nada", async () => {
    for (const sobre of [{ leadId: "" }, { fonte: { modo: "exemplo" } as FontePessoas }]) {
      const { result } = montar(sobre);
      const e = await act(async () => erroDe(result.current.classificar("mql")));
      expect(e.chave).toBe(CHAVE_ERRO_GENERICO);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("a falha da releitura depois de gravar não desfaz a escrita", async () => {
    const { result, client } = montar();
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("rede em baixo"));
    await act(async () => { await expect(result.current.classificar("sql")).resolves.toBeUndefined(); });
  });
});

describe("useQualificarLeadPessoa com a bandeira desligada", () => {
  it("o caminho antigo continua a pedir o utilizador (o contexto de auditoria é dele): sem ele não escreve nada", async () => {
    bandeira.ligada = false;
    const { result } = montar({ fonte: fonte(null) });
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("mantém o caminho antigo: lê a lead e grava por rpc_update_lead, sem chamar neg_classificar_lead", async () => {
    bandeira.ligada = false;
    rpcMock.mockImplementation(() => respostaOk(null));
    const { result } = montar();
    await act(async () => { await result.current.classificar("mql"); });
    expect(chamadas()).toEqual(["set_audit_context", "rpc_update_lead", "clear_audit_context"]);
    expect(tabelas).toEqual(["anew_leads"]);
  });
});
