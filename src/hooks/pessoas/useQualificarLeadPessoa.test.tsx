// Classificar à mão a lead de uma pessoa (MQL, SQL ou limpar), como a página de Leads: lê a linha da lead (com a organização) e grava
// pela MESMA função, rpc_update_lead, com o contexto de auditoria. O Supabase é simulado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ClassificarLeadContext } from "./bandeirasNegocio";
import { ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { PESSOA_ID } from "./fichaFabrica";
import { captureMock, criarCliente, respostaErro, respostaOk, rpcMock } from "./fichaTestUtil";
import { FontePessoasContext, type FontePessoas } from "./useFontePessoas";
import { useQualificarLeadPessoa } from "./useQualificarLeadPessoa";

const leitura = vi.fn();
const filtros: [string, unknown][] = [];
const tabelas: string[] = [];

function cadeia() {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.eq = (coluna: string, valor: unknown) => { filtros.push([coluna, valor]); return c; };
  c.maybeSingle = () => leitura();
  return c;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args), from: (tabela: string) => { tabelas.push(tabela); return cadeia(); } },
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...args: unknown[]) => captureMock(...args) }));

const LEAD = "22222222-2222-4222-8222-222222222222";
const fonte = (utilizadorId: string | null = "u-1"): FontePessoas => ({ modo: "real", organizationId: "org-1", momentoGanho: null, utilizadorId });
const LINHA = { id: LEAD, field_values: { a: 1 }, status: "contacted", source: "google", notes: "n", assigned_to: "u-2" };

beforeEach(() => {
  rpcMock.mockReset(); captureMock.mockReset(); leitura.mockReset(); filtros.length = 0; tabelas.length = 0;
  rpcMock.mockImplementation(() => respostaOk(null));
  leitura.mockResolvedValue({ data: LINHA, error: null });
});
afterEach(() => vi.clearAllMocks());

// `antigo` força o caminho antigo (rpc_update_lead) com ClassificarLeadContext a false; por omissão vale a bandeira de produção (ligada, neg_classificar_lead).
const montar = (sobre: { fonte?: FontePessoas; leadId?: string; antigo?: boolean } = {}) => {
  const client = criarCliente();
  client.setQueryData(["neg-ficha-pessoa", "org-1", PESSOA_ID], { x: 1 });
  client.setQueryData(["neg-resumo-pessoas", "org-1", { papel: null }], { x: 2 });
  const fonteUsada = sobre.fonte ?? fonte();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <FontePessoasContext.Provider value={fonteUsada}>
        <ClassificarLeadContext.Provider value={sobre.antigo ? false : null}>{children}</ClassificarLeadContext.Provider>
      </FontePessoasContext.Provider>
    </QueryClientProvider>
  );
  const r = { client, ...renderHook(({ id, lead }: { id: string; lead: string }) => useQualificarLeadPessoa(id, lead), { wrapper, initialProps: { id: PESSOA_ID, lead: sobre.leadId ?? LEAD } }) };
  const invalidadas = () => [client.getQueryState(["neg-ficha-pessoa", "org-1", PESSOA_ID])?.isInvalidated, client.getQueryState(["neg-resumo-pessoas", "org-1", { papel: null }])?.isInvalidated];
  return { ...r, invalidadas };
};
const chamadas = () => rpcMock.mock.calls.map((c) => c[0] as string);
const paramsDe = (nome: string) => rpcMock.mock.calls.find((c) => c[0] === nome)?.[1] as Record<string, unknown>;
const erroDe = async (p: Promise<unknown>): Promise<ErroNeg> => (await p.then(() => null, (e) => e)) as ErroNeg;

describe("useQualificarLeadPessoa: o que grava", () => {
  it("MQL: uma só chamada a neg_classificar_lead com a organização, a lead e o tipo, sem reler a lead nem abrir contexto de auditoria", async () => {
    const { result } = montar();
    await act(async () => { await result.current.classificar("mql"); });
    expect(tabelas).toEqual([]);
    expect(chamadas()).toEqual(["neg_classificar_lead"]);
    expect(paramsDe("neg_classificar_lead")).toEqual({ p_organization_id: "org-1", p_lead_id: LEAD, p_tipo: "mql" });
  });

  it("caminho antigo (contexto a false) MQL: lê a lead da organização e chama rpc_update_lead com a linha tal como está e só a qualificação mudada", async () => {
    const { result } = montar({ antigo: true });
    await act(async () => { await result.current.classificar("mql"); });
    expect(tabelas).toEqual(["anew_leads"]);
    expect(filtros).toEqual([["id", LEAD], ["organization_id", "org-1"]]);
    expect(chamadas()).toEqual(["set_audit_context", "rpc_update_lead", "clear_audit_context"]);
    expect(paramsDe("set_audit_context")).toEqual({ p_user_id: "u-1", p_source: "web_app" });
    expect(paramsDe("rpc_update_lead")).toEqual({
      p_lead_id: LEAD, p_field_values: { a: 1 }, p_status: "contacted", p_source: "google", p_notes: "n", p_assigned_to: "u-2",
      p_status_changed: false, p_workflow_stage_id: null, p_display_name: null, p_first_name: null, p_last_name: null,
      p_qualification_type: "mql", p_qualification_changed: true,
    });
  });

  it("SQL e limpar (null) mandam o tipo certo e marcam a qualificação como mudada", async () => {
    const { result } = montar();
    await act(async () => { await result.current.classificar("sql"); });
    expect(paramsDe("neg_classificar_lead")).toEqual({ p_organization_id: "org-1", p_lead_id: LEAD, p_tipo: "sql" });
    rpcMock.mockClear();
    await act(async () => { await result.current.classificar(null); });
    expect(paramsDe("neg_classificar_lead")).toEqual({ p_organization_id: "org-1", p_lead_id: LEAD, p_tipo: null });
  });

  it("caminho antigo: SQL e limpar (null) mandam o tipo certo e marcam a qualificação como mudada", async () => {
    const { result } = montar({ antigo: true });
    await act(async () => { await result.current.classificar("sql"); });
    expect(paramsDe("rpc_update_lead")).toMatchObject({ p_qualification_type: "sql", p_qualification_changed: true });
    rpcMock.mockClear();
    await act(async () => { await result.current.classificar(null); });
    expect(paramsDe("rpc_update_lead")).toMatchObject({ p_qualification_type: null, p_qualification_changed: true });
  });

  it("caminho antigo: campos em falta na linha (valores nulos) vão como a página de Leads os manda", async () => {
    leitura.mockResolvedValue({ data: { id: LEAD, field_values: null, status: "new", source: null, notes: null, assigned_to: null }, error: null });
    const { result } = montar({ antigo: true });
    await act(async () => { await result.current.classificar("mql"); });
    expect(paramsDe("rpc_update_lead")).toMatchObject({ p_field_values: {}, p_source: null, p_notes: null, p_assigned_to: null });
  });

  it("depois de gravar refaz a ficha e as listas", async () => {
    const { result, invalidadas } = montar();
    await act(async () => { await result.current.classificar("mql"); });
    expect(invalidadas()).toEqual([true, true]);
  });
});

describe("useQualificarLeadPessoa: a releitura depois de gravar", () => {
  it("se a releitura falhar a escrita fica feita: classificar termina bem (a ficha refaz-se na próxima leitura)", async () => {
    const { result, client } = montar();
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("rede em baixo"));
    await act(async () => { await expect(result.current.classificar("sql")).resolves.toBeUndefined(); });
    expect(chamadas()).toContain("neg_classificar_lead");
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("useQualificarLeadPessoa: falhas (não grava nem invalida)", () => {
  it("caminho novo: sem o id do utilizador classifica na mesma (quem decide é a sessão da base)", async () => {
    const { result } = montar({ fonte: fonte(null) });
    await act(async () => { await result.current.classificar("sql"); });
    expect(chamadas()).toEqual(["neg_classificar_lead"]);
  });

  it("caminho antigo: sem sessão conhecida (utilizador) não escreve nada", async () => {
    const { result, invalidadas } = montar({ fonte: fonte(null), antigo: true });
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invalidadas()).toEqual([false, false]);
  });

  it("no exemplo (sem base) não escreve nada", async () => {
    const { result } = montar({ fonte: { modo: "exemplo" } });
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("sem lead não escreve nada", async () => {
    const { result } = montar({ leadId: "" });
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("caminho antigo: lead que a leitura não devolve (apagada ou fora da organização) dá erro genérico e não escreve", async () => {
    leitura.mockResolvedValue({ data: null, error: null });
    const { result } = montar({ antigo: true });
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(chamadas()).not.toContain("rpc_update_lead");
  });

  it("caminho antigo: erro na leitura da lead dá erro traduzível e não escreve", async () => {
    leitura.mockResolvedValue({ data: null, error: { code: "42501", message: "x" } });
    const { result } = montar({ antigo: true });
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.codigo).toBe("42501");
    expect(chamadas()).not.toContain("rpc_update_lead");
  });

  it.each(["NG003", "NG009", "42501", "NG027"])("erro %s da neg_classificar_lead: lança ErroNeg com o código e não invalida", async (codigo) => {
    rpcMock.mockImplementation(() => respostaErro(codigo));
    const { result, invalidadas } = montar();
    const e = await act(async () => erroDe(result.current.classificar("sql")));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.codigo).toBe(codigo);
    expect(captureMock).not.toHaveBeenCalled();
    expect(invalidadas()).toEqual([false, false]);
  });

  it("falha de rede na neg_classificar_lead: erro genérico, vai para a observabilidade e não invalida", async () => {
    rpcMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    const { result, invalidadas } = montar();
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.chave).toBe(CHAVE_ERRO_GENERICO);
    expect(captureMock).toHaveBeenCalledTimes(1);
    expect(invalidadas()).toEqual([false, false]);
  });

  it("caminho antigo: erro da rpc_update_lead: lança ErroNeg com o código, limpa o contexto e não invalida", async () => {
    rpcMock.mockImplementation((nome: string) => (nome === "rpc_update_lead" ? respostaErro("42501") : respostaOk(null)));
    const { result, invalidadas } = montar({ antigo: true });
    const e = await act(async () => erroDe(result.current.classificar("sql")));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(e.codigo).toBe("42501");
    expect(chamadas()).toContain("clear_audit_context");
    expect(invalidadas()).toEqual([false, false]);
  });

  it("caminho antigo: erro no contexto de auditoria impede a escrita", async () => {
    rpcMock.mockImplementation((nome: string) => (nome === "set_audit_context" ? respostaErro("XX000") : respostaOk(null)));
    const { result } = montar({ antigo: true });
    const e = await act(async () => erroDe(result.current.classificar("mql")));
    expect(e).toBeInstanceOf(ErroNeg);
    expect(chamadas()).not.toContain("rpc_update_lead");
  });
});
