/**
 * `useRegrasAssiduidade`: le o prazo para justificar da organizacao activa por `rpc_hr_regras_assiduidade_ler` e grava
 * por `_guardar`. `hrRpc` simulado; nada toca em base nenhuma. As RPCs ainda podem nao existir na base: o ecra nao parte.
 *
 * O que estes testes guardam:
 *  - a leitura chama a RPC com a organizacao activa e devolve o que a base diz (prazo, gravado, pode alterar);
 *  - sem linha (a RPC devolve 5, nao gravado) o prazo e 5; uma recusa de permissao da 5 e sem poder alterar;
 *  - uma RPC por aplicar e uma falha de rede ficam DISTINTAS de «5 dias»: o ecra di-lo (`leitura.falhou`);
 *  - gravar valida 1 a 30 ANTES de chamar a base, chama `_guardar` com os argumentos certos e relê;
 *  - uma escrita falhada devolve texto visivel (chave ou mensagem), nunca lanca;
 *  - sem organizacao activa nao se chama a base.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let organizacao: { id: string } | null = { id: "org-nike" };
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: organizacao }),
}));

const captura = vi.hoisted(() => ({ captureFlowError: vi.fn() }));
vi.mock("@/lib/observability/captureFlowError", () => captura);

vi.mock("@/utils/friendlyError", () => ({
  getFriendlyErrorMessage: async (e: unknown) => `amigavel:${(e as { message?: string })?.message ?? "?"}`,
}));

type Resposta = { data: unknown; error: unknown };
const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
let respostas: Record<string, Resposta | (() => Promise<Resposta>)> = {};

vi.mock("@/lib/hr/hrDb", () => ({
  hrRpc: async (fn: string, args: Record<string, unknown>) => {
    chamadas.push({ fn, args });
    const r = respostas[fn] ?? { data: null, error: null };
    return typeof r === "function" ? r() : r;
  },
  isPermissionError: (erro: unknown) => !!erro && typeof erro === "object" && (erro as { code?: string }).code === "42501",
}));

import { useRegrasAssiduidade } from "@/hooks/useRegrasAssiduidade";

const RECUSA = { code: "42501", message: "insufficient_privilege" };
const FALHA = { code: "57014", message: "statement timeout" };
const POR_APLICAR = { code: "PGRST202", message: "Could not find the function public.rpc_hr_regras_assiduidade_ler" };

const resposta = (prazo: number, extra: Record<string, unknown> = {}): Resposta => ({
  data: [{ prazo_justificacao_dias: prazo, gravado: true, updated_at: "2026-10-27T10:00:00Z", pode_alterar: true, ...extra }],
  error: null,
});

function criarWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const montar = () => renderHook(() => useRegrasAssiduidade(), { wrapper: criarWrapper() });
const aEsperaDaLeitura = async (result: { current: ReturnType<typeof useRegrasAssiduidade> }) =>
  waitFor(() => expect(result.current.isLoading).toBe(false));

beforeEach(() => {
  chamadas.length = 0;
  respostas = {};
  organizacao = { id: "org-nike" };
  captura.captureFlowError.mockClear();
});

describe("useRegrasAssiduidade: leitura", () => {
  it("le o prazo da organizacao activa por rpc_hr_regras_assiduidade_ler", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(8);
    const { result } = montar();
    await aEsperaDaLeitura(result);
    expect(chamadas).toEqual([{ fn: "rpc_hr_regras_assiduidade_ler", args: { _organization_id: "org-nike" } }]);
    expect(result.current.prazoJustificacaoDias).toBe(8);
    expect(result.current.gravado).toBe(true);
    expect(result.current.podeAlterar).toBe(true);
    expect(result.current.leitura.falhou).toBe(false);
  });

  it("sem linha gravada a base devolve 5 e o hook di-lo: nao gravado", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(5, { gravado: false, updated_at: null, pode_alterar: false });
    const { result } = montar();
    await aEsperaDaLeitura(result);
    expect(result.current.prazoJustificacaoDias).toBe(5);
    expect(result.current.gravado).toBe(false);
    expect(result.current.podeAlterar).toBe(false);
    expect(result.current.leitura.falhou).toBe(false);
  });

  it("uma recusa de permissao da 5 e sem poder alterar, e diz que a leitura foi recusada", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = { data: null, error: RECUSA };
    const { result } = montar();
    await aEsperaDaLeitura(result);
    expect(result.current.prazoJustificacaoDias).toBe(5);
    expect(result.current.podeAlterar).toBe(false);
    expect(result.current.leitura).toMatchObject({ falhou: true, recusado: true, erro: false, indisponivel: false });
    expect(captura.captureFlowError).not.toHaveBeenCalled();
  });

  it("a RPC por aplicar nao e um defeito a reportar: da 5, diz indisponivel e nao deixa alterar", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = { data: null, error: POR_APLICAR };
    const { result } = montar();
    await aEsperaDaLeitura(result);
    expect(result.current.prazoJustificacaoDias).toBe(5);
    expect(result.current.podeAlterar).toBe(false);
    expect(result.current.leitura).toMatchObject({ falhou: true, indisponivel: true, erro: false, recusado: false });
    expect(captura.captureFlowError).not.toHaveBeenCalled();
  });

  it("uma falha de rede NAO se esconde: da 5 so para calcular, marca erro e reporta", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = { data: null, error: FALHA };
    const { result } = montar();
    await waitFor(() => expect(result.current.leitura.erro).toBe(true));
    expect(result.current.leitura.falhou).toBe(true);
    expect(result.current.prazoJustificacaoDias).toBe(5);
    expect(result.current.podeAlterar).toBe(false);
    expect(captura.captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("um prazo fora dos limites que a base devolva nunca chega ao calculo: cai em 5", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(99);
    const { result } = montar();
    await aEsperaDaLeitura(result);
    expect(result.current.prazoJustificacaoDias).toBe(5);
  });

  it("sem organizacao activa nao chama a base", async () => {
    organizacao = null;
    const { result } = montar();
    await aEsperaDaLeitura(result);
    expect(chamadas).toEqual([]);
    expect(result.current.prazoJustificacaoDias).toBe(5);
    expect(result.current.podeAlterar).toBe(false);
  });
});

describe("useRegrasAssiduidade: gravar", () => {
  it("valida 1 a 30 antes de chamar a base", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(5);
    const { result } = montar();
    await aEsperaDaLeitura(result);
    for (const invalido of [0, 31, 2.5, Number.NaN]) {
      let r: { erro: string | null } = { erro: null };
      await act(async () => {
        r = await result.current.guardar(invalido);
      });
      expect(r.erro).toBe("rhRegrasAssid.erro.prazoInvalido");
    }
    expect(chamadas.filter((c) => c.fn === "rpc_hr_regras_assiduidade_guardar")).toEqual([]);
  });

  it("chama _guardar com a organizacao e o prazo, e volta a ler o valor", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(5);
    const { result } = montar();
    await aEsperaDaLeitura(result);
    respostas["rpc_hr_regras_assiduidade_guardar"] = { data: 8, error: null };
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(8);
    let r: { erro: string | null } = { erro: "x" };
    await act(async () => {
      r = await result.current.guardar(8);
    });
    expect(r.erro).toBeNull();
    expect(chamadas.find((c) => c.fn === "rpc_hr_regras_assiduidade_guardar")?.args).toEqual({
      _organization_id: "org-nike",
      _prazo_justificacao_dias: 8,
    });
    await waitFor(() => expect(result.current.prazoJustificacaoDias).toBe(8));
    expect(chamadas.filter((c) => c.fn === "rpc_hr_regras_assiduidade_ler")).toHaveLength(2);
  });

  it("a recusa da base traduz-se em chave e nao e reportada como defeito", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(5, { pode_alterar: false });
    const { result } = montar();
    await aEsperaDaLeitura(result);
    respostas["rpc_hr_regras_assiduidade_guardar"] = { data: null, error: { code: "42501", message: "regras_assiduidade_sem_permissao" } };
    let r: { erro: string | null } = { erro: null };
    await act(async () => {
      r = await result.current.guardar(8);
    });
    expect(r.erro).toBe("rhRegrasAssid.erro.semPermissao");
    expect(captura.captureFlowError).not.toHaveBeenCalled();
    expect(result.current.prazoJustificacaoDias).toBe(5);
  });

  it("uma recusa por permissao sem o prefixo (RLS ou grant) tambem da a chave de sem permissao", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(5);
    const { result } = montar();
    await aEsperaDaLeitura(result);
    respostas["rpc_hr_regras_assiduidade_guardar"] = { data: null, error: RECUSA };
    let r: { erro: string | null } = { erro: null };
    await act(async () => {
      r = await result.current.guardar(8);
    });
    expect(r.erro).toBe("rhRegrasAssid.erro.semPermissao");
  });

  it("a RPC por aplicar diz-se como tal em vez de falhar em silencio", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = { data: null, error: POR_APLICAR };
    const { result } = montar();
    await aEsperaDaLeitura(result);
    respostas["rpc_hr_regras_assiduidade_guardar"] = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    let r: { erro: string | null } = { erro: null };
    await act(async () => {
      r = await result.current.guardar(8);
    });
    expect(r.erro).toBe("rhRegrasAssid.erro.indisponivel");
  });

  it("uma falha inesperada e reportada e devolve a mensagem amigavel", async () => {
    respostas["rpc_hr_regras_assiduidade_ler"] = resposta(5);
    const { result } = montar();
    await aEsperaDaLeitura(result);
    respostas["rpc_hr_regras_assiduidade_guardar"] = { data: null, error: FALHA };
    let r: { erro: string | null } = { erro: null };
    await act(async () => {
      r = await result.current.guardar(8);
    });
    expect(r.erro).toBe("amigavel:statement timeout");
    expect(captura.captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("sem organizacao activa nao grava", async () => {
    organizacao = null;
    const { result } = montar();
    await aEsperaDaLeitura(result);
    let r: { erro: string | null } = { erro: null };
    await act(async () => {
      r = await result.current.guardar(8);
    });
    expect(r.erro).not.toBeNull();
    expect(chamadas).toEqual([]);
  });
});
