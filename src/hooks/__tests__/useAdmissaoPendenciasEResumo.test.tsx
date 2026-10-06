/**
 * Os dois hooks da ficha (`useAdmissaoPendencias`, `useConviteAdmissaoResumo`):
 *
 *   - respostas fora de ordem: so conta a do pedido mais recente, e mudar de
 *     pessoa nunca mostra os dados da anterior;
 *   - recarregar (depois de uma gravacao) mantem os dados e NAO volta a
 *     `carregando`: os cartoes nao piscam;
 *   - estado de convite desconhecido nao se disfarca de "pendente";
 *   - a falha a ler a ficha em conflito diz-se (`conflitosIndisponiveis`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

type Resposta = { data: unknown; error: unknown };

/** Cada chamada a rpc fica pendente ate o teste a resolver, para controlar a ordem. */
interface Pendente {
  nome: string;
  args: Record<string, unknown>;
  resolver: (r: Resposta) => void;
}
const pendentes: Pendente[] = [];
const rpc = vi.fn((nome: string, args: Record<string, unknown>) => {
  return new Promise<Resposta>((resolver) => {
    pendentes.push({ nome, args, resolver });
  });
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (nome: string, args: Record<string, unknown>) => rpc(nome, args) },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

import { useAdmissaoPendencias } from "@/hooks/useAdmissaoPendencias";
import { resumoDaRpc, useConviteAdmissaoResumo } from "@/hooks/useConviteAdmissaoResumo";

function responder(indice: number, resposta: Resposta) {
  act(() => {
    pendentes[indice].resolver(resposta);
  });
}

beforeEach(() => {
  pendentes.length = 0;
  rpc.mockClear();
  captureFlowError.mockReset();
});

const linha = (codigo: string, posicao = "convite") => ({ codigo, origem: "pessoa", posicao });

describe("useAdmissaoPendencias", () => {
  it("primeira carga: carregando ate responder, depois os dados", async () => {
    const { result } = renderHook(() => useAdmissaoPendencias("A"));
    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(pendentes).toHaveLength(1));
    expect(pendentes[0]).toMatchObject({ nome: "hr_admissao_pendencias", args: { p_pessoa_id: "A" } });

    responder(0, { data: [linha("nif"), linha("cargo", "rh")], error: null });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.pendencias.map((p) => p.codigo)).toEqual(["nif", "cargo"]);
    expect(result.current.doRh.map((p) => p.codigo)).toEqual(["cargo"]);
  });

  it("recarregar mantem os dados anteriores e nao volta a carregando", async () => {
    const { result } = renderHook(() => useAdmissaoPendencias("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: [linha("nif")], error: null });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    act(() => result.current.recarregar());
    await waitFor(() => expect(pendentes).toHaveLength(2));
    expect(result.current.carregando).toBe(false);
    expect(result.current.recarregando).toBe(true);
    expect(result.current.pendencias.map((p) => p.codigo)).toEqual(["nif"]);

    responder(1, { data: [], error: null });
    await waitFor(() => expect(result.current.recarregando).toBe(false));
    expect(result.current.pendencias).toEqual([]);
  });

  it("resposta fora de ordem: a antiga nao sobrepoe a mais recente", async () => {
    const { result } = renderHook(() => useAdmissaoPendencias("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: [], error: null });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    act(() => result.current.recarregar()); // pedido 1 (lento)
    await waitFor(() => expect(pendentes).toHaveLength(2));
    act(() => result.current.recarregar()); // pedido 2 (mais recente)
    await waitFor(() => expect(pendentes).toHaveLength(3));

    responder(2, { data: [linha("niss")], error: null });
    await waitFor(() => expect(result.current.pendencias.map((p) => p.codigo)).toEqual(["niss"]));
    responder(1, { data: [linha("iban")], error: null }); // chega tarde
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.pendencias.map((p) => p.codigo)).toEqual(["niss"]);
    expect(result.current.recarregando).toBe(false);
  });

  it("mudar de pessoa limpa o que era da anterior e ignora a resposta tardia dela", async () => {
    const { result, rerender } = renderHook(({ id }) => useAdmissaoPendencias(id), {
      initialProps: { id: "A" },
    });
    await waitFor(() => expect(pendentes).toHaveLength(1));
    // A resposta de A ainda nao chegou quando se muda para B.
    rerender({ id: "B" });
    expect(result.current.pendencias).toEqual([]);
    expect(result.current.carregando).toBe(true);
    await waitFor(() => expect(pendentes).toHaveLength(2));
    expect(pendentes[1].args).toEqual({ p_pessoa_id: "B" });

    // A resposta de B chega primeiro; depois chega a de A, atrasada.
    responder(1, { data: [linha("niss")], error: null });
    await waitFor(() => expect(result.current.pendencias.map((p) => p.codigo)).toEqual(["niss"]));
    responder(0, { data: [linha("nif")], error: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.pendencias.map((p) => p.codigo)).toEqual(["niss"]);
    expect(result.current.carregando).toBe(false);
  });

  it("mudar de pessoa depois de ter dados: nada da anterior fica visivel", async () => {
    const { result, rerender } = renderHook(({ id }) => useAdmissaoPendencias(id), {
      initialProps: { id: "A" },
    });
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: [linha("nif")], error: null });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    rerender({ id: "B" });
    expect(result.current.pendencias).toEqual([]);
    expect(result.current.carregando).toBe(true);
  });

  it("recusa por permissao e semAcesso (nao lista vazia); falha e erro e regista", async () => {
    const { result } = renderHook(() => useAdmissaoPendencias("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: null, error: { code: "42501", message: "insufficient_privilege" } });
    await waitFor(() => expect(result.current.semAcesso).toBe(true));
    expect(result.current.erro).toBe(false);
    expect(captureFlowError).not.toHaveBeenCalled();

    act(() => result.current.recarregar());
    await waitFor(() => expect(pendentes).toHaveLength(2));
    responder(1, { data: null, error: { code: "XX000", message: "boom" } });
    await waitFor(() => expect(result.current.erro).toBe(true));
    expect(result.current.semAcesso).toBe(false);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("sem pessoa nao chama a base e nao fica a carregar", async () => {
    const { result } = renderHook(() => useAdmissaoPendencias(null));
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.pendencias).toEqual([]);
  });
});

const RESUMO_BASE = {
  existe: true,
  convite_id: "c1",
  estado: "pendente",
  email_destino: "a@b.pt",
  email_enviado: true,
};

describe("useConviteAdmissaoResumo", () => {
  it("recarregar mantem o resumo anterior e nao volta a carregando", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: RESUMO_BASE, error: null });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.resumo?.estado).toBe("pendente");

    act(() => result.current.recarregar());
    await waitFor(() => expect(pendentes).toHaveLength(2));
    expect(result.current.carregando).toBe(false);
    expect(result.current.recarregando).toBe(true);
    expect(result.current.resumo?.conviteId).toBe("c1");

    responder(1, { data: { ...RESUMO_BASE, estado: "usado" }, error: null });
    await waitFor(() => expect(result.current.resumo?.estado).toBe("usado"));
    expect(result.current.recarregando).toBe(false);
  });

  it("resposta fora de ordem: a antiga nao sobrepoe a mais recente", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: RESUMO_BASE, error: null });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    act(() => result.current.recarregar());
    await waitFor(() => expect(pendentes).toHaveLength(2));
    act(() => result.current.recarregar());
    await waitFor(() => expect(pendentes).toHaveLength(3));

    responder(2, { data: { ...RESUMO_BASE, estado: "usado" }, error: null });
    await waitFor(() => expect(result.current.resumo?.estado).toBe("usado"));
    responder(1, { data: { ...RESUMO_BASE, estado: "expirado" }, error: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.resumo?.estado).toBe("usado");
  });

  it("mudar de pessoa limpa o resumo da anterior", async () => {
    const { result, rerender } = renderHook(({ id }) => useConviteAdmissaoResumo(id), {
      initialProps: { id: "A" },
    });
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: RESUMO_BASE, error: null });
    await waitFor(() => expect(result.current.resumo).not.toBeNull());

    rerender({ id: "B" });
    expect(result.current.resumo).toBeNull();
    expect(result.current.carregando).toBe(true);
  });

  it("sem convite (existe=false) da resumo null", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: { existe: false }, error: null });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.resumo).toBeNull();
    expect(result.current.erro).toBe(false);
  });

  it("estado desconhecido nao vira 'pendente': fica 'desconhecido' e regista", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: { ...RESUMO_BASE, estado: "algo_novo" }, error: null });
    await waitFor(() => expect(result.current.resumo).not.toBeNull());
    expect(result.current.resumo?.estado).toBe("desconhecido");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    expect((captureFlowError.mock.calls[0][0] as Error).message).not.toContain("algo_novo");
  });

  it("os estados conhecidos mantem-se; 'revogado' da base e 'substituido' no ecra", () => {
    for (const estado of ["pendente", "usado", "expirado", "bloqueado"] as const) {
      expect(resumoDaRpc({ ...RESUMO_BASE, estado })?.estado).toBe(estado);
    }
    expect(resumoDaRpc({ ...RESUMO_BASE, estado: "revogado" })?.estado).toBe("substituido");
  });

  it("recusa por duplicado: le a ficha em conflito", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, {
      data: { ...RESUMO_BASE, ultima_recusa: { codigo: "nif_ja_existe", campos: ["nif"] } },
      error: null,
    });
    await waitFor(() => expect(pendentes).toHaveLength(2));
    expect(pendentes[1].nome).toBe("rpc_hr_convite_admissao_conflitos");
    responder(1, {
      data: [{ pessoa_id: "p9", nome_completo: "Maria Silva", campo: "nif", estado: "activa" }],
      error: null,
    });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.conflitos).toEqual([
      { pessoaId: "p9", nome: "Maria Silva", campo: "nif", estado: "activa" },
    ]);
    expect(result.current.conflitosIndisponiveis).toBe(false);
  });

  it("a leitura da ficha em conflito falha: conflitosIndisponiveis, e o resumo continua", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, {
      data: { ...RESUMO_BASE, ultima_recusa: { codigo: "niss_ja_existe", campos: ["niss"] } },
      error: null,
    });
    await waitFor(() => expect(pendentes).toHaveLength(2));
    responder(1, { data: null, error: { code: "XX000", message: "boom" } });
    await waitFor(() => expect(result.current.carregando).toBe(false));

    expect(result.current.conflitos).toEqual([]);
    expect(result.current.conflitosIndisponiveis).toBe(true);
    expect(result.current.resumo?.ultimaRecusa?.codigo).toBe("niss_ja_existe");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("uma recusa por permissao nas fichas em conflito tambem diz 'indisponiveis', sem Sentry", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, {
      data: { ...RESUMO_BASE, ultima_recusa: { codigo: "nif_ja_existe", campos: ["nif"] } },
      error: null,
    });
    await waitFor(() => expect(pendentes).toHaveLength(2));
    responder(1, { data: null, error: { code: "42501", message: "insufficient_privilege" } });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(result.current.conflitosIndisponiveis).toBe(true);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("outra recusa que nao e duplicado nao vai buscar fichas", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, {
      data: { ...RESUMO_BASE, ultima_recusa: { codigo: "nif_invalido", campos: ["nif"] } },
      error: null,
    });
    await waitFor(() => expect(result.current.carregando).toBe(false));
    expect(pendentes).toHaveLength(1);
    expect(result.current.conflitosIndisponiveis).toBe(false);
  });

  it("recusa por permissao e semAcesso; falha da base e erro", async () => {
    const { result } = renderHook(() => useConviteAdmissaoResumo("A"));
    await waitFor(() => expect(pendentes).toHaveLength(1));
    responder(0, { data: null, error: { code: "42501", message: "insufficient_privilege" } });
    await waitFor(() => expect(result.current.semAcesso).toBe(true));
    expect(result.current.erro).toBe(false);

    act(() => result.current.recarregar());
    await waitFor(() => expect(pendentes).toHaveLength(2));
    responder(1, { data: null, error: { code: "XX000", message: "boom" } });
    await waitFor(() => expect(result.current.erro).toBe(true));
    expect(result.current.semAcesso).toBe(false);
  });
});
