// O termo de entrega ou devolução de um ativo (`rpc_ativos_termo_emitir`): os nomes dos argumentos estão fixados aqui, o resultado lê-se com
// tolerância e cada erro da base chega ao ecrã traduzido (ATV36, ATV37, recusa por permissão, RPC por aplicar, defeito). NÃO envia nada ao
// colaborador: só emite o documento («a aguardar assinatura»).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const m = vi.hoisted(() => ({ rpc: vi.fn(), captura: vi.fn(), empresa: { activeCompany: { id: "org-1" } as { id: string } | null } }));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: (...a: unknown[]) => m.rpc(...a) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => m.captura(...a) }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => m.empresa }));
vi.mock("@/utils/friendlyError", () => ({ getLocalizedFallback: (k: string) => `T:${k}` }));

import { useTermoAtivo } from "./useTermoAtivo";

const OK = { documento_id: "d1", pessoa_id: "p1", titulo: "Termo de entrega · NIKE-IT-LAP-26-0001", estado: "a_aguardar_assinatura" };

beforeEach(() => { m.rpc.mockReset(); m.captura.mockReset(); m.empresa.activeCompany = { id: "org-1" }; });

async function emitir(momento: "entrega" | "devolucao" = "entrega") {
  const { result } = renderHook(() => useTermoAtivo());
  let resultado!: Awaited<ReturnType<typeof result.current.emitir>>;
  await act(async () => { resultado = await result.current.emitir("pe-1", momento, "mod-1"); });
  return { result, resultado };
}

describe("useTermoAtivo", () => {
  it("chama a RPC com a organização, a linha, o momento e o modelo, e devolve o documento criado", async () => {
    m.rpc.mockResolvedValue({ data: OK, error: null });
    const { resultado } = await emitir("devolucao");
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("rpc_ativos_termo_emitir", { p_organization_id: "org-1", p_pessoa_equipamento_id: "pe-1", p_momento: "devolucao", p_modelo_id: "mod-1" });
    expect(resultado).toEqual({ ok: true, termo: { documentoId: "d1", pessoaId: "p1", titulo: OK.titulo, estado: "a_aguardar_assinatura" } });
  });

  it("não envia nada ao colaborador: só chama a RPC de emitir", async () => {
    m.rpc.mockResolvedValue({ data: OK, error: null });
    await emitir();
    expect(m.rpc.mock.calls.map((c) => c[0])).toEqual(["rpc_ativos_termo_emitir"]);
  });

  it("uma resposta sem documento é um erro (não se mostra «criado» sem documento)", async () => {
    m.rpc.mockResolvedValue({ data: {}, error: null });
    const { resultado } = await emitir();
    expect(resultado).toEqual({ ok: false, mensagem: "T:ativos.erro.generico" });
    expect(m.captura).toHaveBeenCalled();
  });

  it("ATV36 e ATV37 chegam com o texto próprio, sem ir para o registo de defeitos", async () => {
    for (const codigo of ["ATV36", "ATV37"]) {
      m.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: codigo, details: "x" } });
      const { resultado } = await emitir();
      expect(resultado).toEqual({ ok: false, mensagem: `T:ativos.erro.${codigo}` });
    }
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("sem permissão (42501) diz que não pode emitir documentos do RH; RPC por aplicar diz que ainda não existe; nenhum é defeito", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "insufficient_privilege" } });
    expect((await emitir()).resultado).toEqual({ ok: false, mensagem: "T:ativos.termo.erro.semPermissao" });
    m.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect((await emitir()).resultado).toEqual({ ok: false, mensagem: "T:ativos.erro.indisponivel" });
    expect(m.captura).not.toHaveBeenCalled();
  });

  it("um defeito vai para o registo e chega como erro genérico traduzido", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const { resultado } = await emitir();
    expect(resultado).toEqual({ ok: false, mensagem: "T:ativos.erro.generico" });
    expect(m.captura).toHaveBeenCalledTimes(1);
  });

  it("sem organização não pede nada", async () => {
    m.empresa.activeCompany = null;
    const { resultado } = await emitir();
    expect(m.rpc).not.toHaveBeenCalled();
    expect(resultado).toEqual({ ok: false, mensagem: "T:ativos.erro.semOrganizacao" });
  });

  it("`aEmitir` é verdadeiro enquanto a base responde, e não deixa emitir duas vezes ao mesmo tempo", async () => {
    let acabar!: (v: unknown) => void;
    m.rpc.mockReturnValue(new Promise((r) => { acabar = r; }));
    const { result } = renderHook(() => useTermoAtivo());
    let primeira!: Promise<unknown>;
    let segunda!: unknown;
    await act(async () => { primeira = result.current.emitir("pe-1", "entrega", "mod-1"); });
    expect(result.current.aEmitir).toBe(true);
    await act(async () => { segunda = await result.current.emitir("pe-1", "entrega", "mod-1"); });
    expect(segunda).toEqual({ ok: false, mensagem: "T:ativos.erro.generico" });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    await act(async () => { acabar({ data: OK, error: null }); await primeira; });
    expect(result.current.aEmitir).toBe(false);
  });
});
