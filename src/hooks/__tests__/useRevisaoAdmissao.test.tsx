/**
 * `useRevisaoAdmissao`: a revisao do RH de um processo submetido (V3a, so leitura).
 *
 * O que fecha:
 *  - `rpc_hr_admissao_rever_ler(p_organization_id, p_convite_id)` e a UNICA chamada ao abrir: so os campos nao sensiveis;
 *  - NISS e IBAN chegam so como `{preenchido}`: mesmo que a base devolvesse um valor, o hook nao o guarda;
 *  - os sensiveis vao por uma SEGUNDA chamada, `rpc_hr_admissao_rever_sensivel(p_organization_id, p_convite_id, p_campo)`,
 *    so quando `revelar` e chamado; o valor volta a quem chamou e NUNCA fica no estado do hook, nem em logs;
 *  - so `niss` e `iban` se pedem; o resto nem chega a base;
 *  - erros em codigo (o ecra traduz), sem `error.details`; so um defeito vai para o Sentry;
 *  - mudar de processo ou de organizacao descarta o que estava para tras.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captureFlowError(...a) }));

let empresa: { activeCompany: { id: string } | null };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => empresa }));

import { useRevisaoAdmissao } from "@/hooks/useRevisaoAdmissao";

const NISS_REAL = "12345678901";
const IBAN_REAL = "PT50000201231234567890154";

/** O formato EXATO de rpc_hr_admissao_rever_ler (20261210430000): v_resumo || {campos, anexos, devolucao, pendencias}. */
const RESPOSTA = {
  convite_id: "c1",
  pessoa_id: "p1",
  estado: "submetida",
  estado_portal: "ativo",
  valid_until: "2026-12-20T10:00:00Z",
  submetido_em: "2026-12-14T09:00:00Z",
  cancelada_em: null,
  rejeitada_em: null,
  niss: { preenchido: true },
  iban: { preenchido: false },
  campos: [
    { chave: "data_nascimento", visivel: true, submetido: "1990-05-02", ficha: null, difere: true },
    { chave: "telefone_pessoal", visivel: true, submetido: "912345678", ficha: "912345678", difere: false },
    { chave: "dependentes", visivel: true, submetido: 2, ficha: 1, difere: true },
    { chave: "aceite", visivel: true, submetido: true, ficha: null, difere: true },
    { chave: "conta_titular", visivel: false, submetido: null, ficha: null, difere: false },
  ],
  anexos: [
    { id: "a1", tipo: "cartao_cidadao", criado_em: "2026-12-14T09:00:00Z", visivel: true },
    { id: null, tipo: "comprovativo_iban", criado_em: "2026-12-14T09:01:00Z", visivel: false },
  ],
  devolucao: null,
  pendencias: [{ codigo: "cargo", origem: "rh", posicao: "rh" }],
  eventos: [
    { acao: "criado", ator_tipo: "rh", estado_anterior: null, estado_posterior: "convidada", criado_em: "2026-12-10T08:00:00Z" },
    { acao: "submetido", ator_tipo: "pessoa", estado_anterior: "em_preenchimento", estado_posterior: "submetida", criado_em: "2026-12-14T09:00:00Z" },
  ],
};

beforeEach(() => {
  rpc.mockReset();
  captureFlowError.mockReset();
  empresa = { activeCompany: { id: "org-nike" } };
});

describe("abrir a revisao", () => {
  it("chama so rever_ler, com a assinatura do desenho e a organizacao ativa", async () => {
    rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rpc_hr_admissao_rever_ler", { p_organization_id: "org-nike", p_convite_id: "c1" });
    expect(rpc).not.toHaveBeenCalledWith("rpc_hr_admissao_rever_sensivel", expect.anything());
  });

  it("normaliza campos (diferencas contra a ficha), anexos, pendencias e eventos", async () => {
    rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.revisao).not.toBeNull());
    const r = result.current.revisao!;
    expect(r.campos).toEqual([
      { chave: "data_nascimento", visivel: true, submetido: "1990-05-02", ficha: null, difere: true },
      { chave: "telefone_pessoal", visivel: true, submetido: "912345678", ficha: "912345678", difere: false },
      { chave: "dependentes", visivel: true, submetido: "2", ficha: "1", difere: true },
      { chave: "aceite", visivel: true, submetido: "true", ficha: null, difere: true },
      { chave: "conta_titular", visivel: false, submetido: null, ficha: null, difere: false },
    ]);
    // O resumo da base traz o estado, o do portal e a validade (nao so o item do pipeline).
    expect(r.estado).toBe("submetida");
    expect(r.estadoPortal).toBe("ativo");
    expect(r.validUntil).toBe("2026-12-20T10:00:00Z");
    expect(r.niss).toEqual({ preenchido: true });
    expect(r.iban).toEqual({ preenchido: false });
    expect(r.anexos).toEqual([
      { id: "a1", tipo: "cartao_cidadao", criadoEm: "2026-12-14T09:00:00Z", visivel: true },
      { id: null, tipo: "comprovativo_iban", criadoEm: "2026-12-14T09:01:00Z", visivel: false },
    ]);
    expect(r.devolucao).toBeNull();
    expect(r.pendencias).toEqual([{ codigo: "cargo", origem: "rh", posicao: "rh" }]);
    expect(r.eventos.map((e) => e.acao)).toEqual(["criado", "submetido"]);
    expect(r.eventos[1]).toEqual({
      acao: "submetido",
      atorTipo: "pessoa",
      estadoAnterior: "em_preenchimento",
      estadoPosterior: "submetida",
      criadoEm: "2026-12-14T09:00:00Z",
    });
  });

  it("le a ultima devolucao: comentarios por campo (null = sem permissao para o ver), documentos e observacao", async () => {
    rpc.mockResolvedValue({
      data: {
        ...RESPOSTA,
        devolucao: { campos: { nif: "Confirme o NIF", conta_titular: null }, documentos: ["comprovativo_iban"], observacao: "Obrigado" },
      },
      error: null,
    });
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.revisao).not.toBeNull());
    expect(result.current.revisao!.devolucao).toEqual({
      campos: { nif: "Confirme o NIF", conta_titular: null },
      documentos: ["comprovativo_iban"],
      observacao: "Obrigado",
    });
  });

  it("processo terminado: o resumo chega sem campos, anexos, devolucao nem pendencias e le-se sem rebentar", async () => {
    rpc.mockResolvedValue({
      data: { ...RESPOSTA, estado: "cancelada", estado_portal: "revogado", cancelada_em: "2026-12-15T10:00:00Z", campos: [], anexos: [], devolucao: null, pendencias: [] },
      error: null,
    });
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.revisao).not.toBeNull());
    expect(result.current.revisao).toMatchObject({ estado: "cancelada", estadoPortal: "revogado", campos: [], anexos: [], devolucao: null, pendencias: [] });
  });

  it("um campo sem permissao do dominio (visivel false) nunca traz valor, mesmo que a base o devolvesse", async () => {
    rpc.mockResolvedValue({
      data: { ...RESPOSTA, campos: [{ chave: "nif", visivel: false, submetido: "999999999", ficha: "123456789", difere: true }] },
      error: null,
    });
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.revisao).not.toBeNull());
    expect(result.current.revisao!.campos).toEqual([{ chave: "nif", visivel: false, submetido: null, ficha: null, difere: false }]);
    expect(JSON.stringify(result.current.revisao)).not.toContain("999999999");
  });

  it("NISS e IBAN: mesmo que a base devolvesse o valor, o hook so guarda {preenchido}", async () => {
    rpc.mockResolvedValue({
      data: {
        ...RESPOSTA,
        niss: { preenchido: true, valor: NISS_REAL },
        iban: { preenchido: true, valor: IBAN_REAL },
        campos: [
          ...RESPOSTA.campos,
          { chave: "niss", visivel: true, submetido: NISS_REAL, ficha: null, difere: true },
          { chave: "iban", visivel: true, submetido: IBAN_REAL, ficha: null, difere: true },
          { chave: "conta_numero", visivel: true, submetido: IBAN_REAL, ficha: null, difere: true },
        ],
      },
      error: null,
    });
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.revisao).not.toBeNull());
    const texto = JSON.stringify(result.current.revisao);
    expect(texto).not.toContain(NISS_REAL);
    expect(texto).not.toContain(IBAN_REAL);
    expect(result.current.revisao!.niss).toEqual({ preenchido: true });
    expect(result.current.revisao!.campos.map((c) => c.chave)).not.toEqual(
      expect.arrayContaining(["niss"]),
    );
  });

  it("sem processo selecionado (null) nao chama a base", async () => {
    const { result } = renderHook(() => useRevisaoAdmissao(null));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.revisao).toBeNull();
  });

  it("sem organizacao ativa nao chama a base", async () => {
    empresa = { activeCompany: null };
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uma resposta que nao e um objeto da uma revisao vazia, nao um estoiro", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.revisao).toMatchObject({ campos: [], anexos: [], eventos: [], pendencias: [] });
  });
});

describe("revelar um sensivel (segunda chamada, so a pedido)", () => {
  async function aberto() {
    rpc.mockResolvedValueOnce({ data: RESPOSTA, error: null });
    const hook = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(hook.result.current.revisao).not.toBeNull());
    return hook;
  }

  it("chama rever_sensivel com o campo e devolve o valor a quem chamou", async () => {
    const { result } = await aberto();
    rpc.mockResolvedValueOnce({ data: { valor: NISS_REAL }, error: null });
    let resposta!: Awaited<ReturnType<typeof result.current.revelar>>;
    await act(async () => {
      resposta = await result.current.revelar("niss");
    });
    expect(rpc).toHaveBeenLastCalledWith("rpc_hr_admissao_rever_sensivel", {
      p_organization_id: "org-nike",
      p_convite_id: "c1",
      p_campo: "niss",
    });
    expect(resposta).toEqual({ ok: true, valor: NISS_REAL });
  });

  it("o valor revelado nunca fica no estado do hook", async () => {
    const { result } = await aberto();
    rpc.mockResolvedValueOnce({ data: { valor: IBAN_REAL }, error: null });
    await act(async () => {
      await result.current.revelar("iban");
    });
    const { revelar, recarregar, ...estado } = result.current;
    expect(typeof revelar).toBe("function");
    expect(typeof recarregar).toBe("function");
    expect(JSON.stringify(estado)).not.toContain(IBAN_REAL);
  });

  it("nao escreve o valor em logs (console), nem em armazenamento do browser", async () => {
    const espioes = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = await aberto();
    rpc.mockResolvedValueOnce({ data: { valor: NISS_REAL }, error: null });
    await act(async () => {
      await result.current.revelar("niss");
    });
    for (const e of espioes) expect(JSON.stringify(e.mock.calls)).not.toContain(NISS_REAL);
    expect(JSON.stringify(setItem.mock.calls)).not.toContain(NISS_REAL);
    espioes.forEach((e) => e.mockRestore());
    setItem.mockRestore();
  });

  it("so niss e iban se pedem: outro campo nem chega a base", async () => {
    const { result } = await aberto();
    let resposta!: Awaited<ReturnType<typeof result.current.revelar>>;
    await act(async () => {
      // @ts-expect-error campo fora do dominio, de proposito
      resposta = await result.current.revelar("nif");
    });
    expect(resposta).toMatchObject({ ok: false });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("uma resposta sem valor (string) e uma falha, nunca um ok vazio", async () => {
    const { result } = await aberto();
    rpc.mockResolvedValueOnce({ data: { valor: null }, error: null });
    let resposta!: Awaited<ReturnType<typeof result.current.revelar>>;
    await act(async () => {
      resposta = await result.current.revelar("niss");
    });
    expect(resposta).toEqual({ ok: false, codigo: null });
  });

  it.each([
    [{ code: "HRA31", message: "nao_encontrado" }, "nao_encontrado"],
    [{ code: "HRA41", message: "limite_excedido", details: "120 por hora" }, "limite_excedido"],
  ])("%j: devolve o codigo, nada de details, e nao vai para o Sentry", async (erro, codigo) => {
    const { result } = await aberto();
    rpc.mockResolvedValueOnce({ data: null, error: erro });
    let resposta!: Awaited<ReturnType<typeof result.current.revelar>>;
    await act(async () => {
      resposta = await result.current.revelar("iban");
    });
    expect(resposta).toEqual({ ok: false, codigo });
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("um defeito ao revelar vai para o Sentry sem corpo nem valor", async () => {
    const { result } = await aberto();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom com 12345678901" } });
    await act(async () => {
      await result.current.revelar("niss");
    });
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    const [erro, fluxo] = captureFlowError.mock.calls[0];
    expect(fluxo).toBe("hr-admissao-revisao-sensivel");
    expect(String((erro as Error).message)).not.toContain("12345678901");
  });
});

describe("erros da leitura", () => {
  it.each([
    [{ code: "HRA31", message: "nao_encontrado", details: "outra org" }, "nao_encontrado"],
    [{ code: "42501", message: "permission denied" }, "insufficient_privilege"],
  ])("%j -> codigo %s, sem Sentry", async (erro, codigo) => {
    rpc.mockResolvedValue({ data: null, error: erro });
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.erro).toEqual({ codigo });
    expect(result.current.revisao).toBeNull();
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("um defeito vai para o Sentry", async () => {
    rpc.mockRejectedValue(new Error("Failed to fetch"));
    const { result } = renderHook(() => useRevisaoAdmissao("c1"));
    await waitFor(() => expect(result.current.erro).toEqual({ codigo: null }));
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });
});

describe("mudar de processo", () => {
  it("o processo novo recomeca limpo e a resposta atrasada do anterior e descartada", async () => {
    let resolverA!: (v: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise((r) => { resolverA = r; }));
    const { result, rerender } = renderHook(({ id }) => useRevisaoAdmissao(id), { initialProps: { id: "c1" as string | null } });

    rpc.mockResolvedValueOnce({ data: { ...RESPOSTA, campos: [{ chave: "nif", visivel: true, submetido: "999", ficha: null, difere: true }] }, error: null });
    rerender({ id: "c2" });
    await waitFor(() => expect(result.current.revisao?.campos[0]?.chave).toBe("nif"));

    await act(async () => {
      resolverA({ data: RESPOSTA, error: null });
    });
    expect(result.current.revisao?.campos.map((c) => c.chave)).toEqual(["nif"]);
  });

  it("fechar (id null) limpa a revisao da memoria", async () => {
    rpc.mockResolvedValue({ data: RESPOSTA, error: null });
    const { result, rerender } = renderHook(({ id }) => useRevisaoAdmissao(id), { initialProps: { id: "c1" as string | null } });
    await waitFor(() => expect(result.current.revisao).not.toBeNull());
    rerender({ id: null });
    await waitFor(() => expect(result.current.revisao).toBeNull());
  });
});
