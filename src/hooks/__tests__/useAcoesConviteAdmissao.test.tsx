/**
 * `useAcoesConviteAdmissao`: prolongar e cancelar o processo de admissao, pela
 * Edge Function `convite-admissao`. O pedido leva a organizacao activa; o
 * ecra nunca ve o `error.details` nem um codigo em bruto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const captureFlowError = vi.fn();
vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: (...args: unknown[]) => captureFlowError(...args),
}));

let companhiaActiva: { id: string } | null = { id: "org-nike" };
vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: companhiaActiva }),
}));

import { useAcoesConviteAdmissao } from "@/hooks/useAcoesConviteAdmissao";
import { getLocalizedFallback } from "@/utils/friendlyError";

function erroHttp(corpo: unknown, status: number) {
  return { name: "FunctionsHttpError", context: new Response(JSON.stringify(corpo), { status }) };
}

async function prolongar(dias = 7) {
  const { result } = renderHook(() => useAcoesConviteAdmissao());
  let resultado!: Awaited<ReturnType<typeof result.current.prolongar>>;
  await act(async () => {
    resultado = await result.current.prolongar("convite-1", dias);
  });
  return { resultado, result };
}

async function cancelar(motivo = "  Desistiu  ") {
  const { result } = renderHook(() => useAcoesConviteAdmissao());
  let resultado!: Awaited<ReturnType<typeof result.current.cancelar>>;
  await act(async () => {
    resultado = await result.current.cancelar("convite-1", motivo);
  });
  return { resultado, result };
}

beforeEach(() => {
  invoke.mockReset();
  captureFlowError.mockReset();
  companhiaActiva = { id: "org-nike" };
});

describe("prolongar", () => {
  it("chama a accao prolongar com convite, organizacao activa e dias", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, convite_id: "convite-1", valid_until: "2026-12-20T10:00:00Z", estado: "convidada", estado_portal: "ativo" },
      error: null,
    });
    const { resultado } = await prolongar(14);
    expect(invoke).toHaveBeenCalledWith("convite-admissao", {
      body: { action: "prolongar", convite_id: "convite-1", organization_id: "org-nike", dias: 14 },
    });
    expect(resultado).toEqual({ ok: true, validUntil: "2026-12-20T10:00:00Z", codigo: null, erro: null });
  });

  it.each([
    ["prazo_excedido", 409, "hr.convite.erro.prazoExcedido"],
    ["estado_invalido", 409, "hr.convite.erro.estadoInvalido"],
    ["dias_invalidos", 400, "hr.convite.erro.diasInvalidos"],
    ["nao_encontrado", 404, "hr.convite.erro.naoEncontrado"],
    ["organizacao_nao_empregadora", 403, "hr.convite.erro.organizacaoNaoEmpregadora"],
    ["limite_excedido", 429, "hr.convite.erro.limiteExcedido"],
    ["demasiadas_tentativas", 429, "hr.convite.erro.limiteExcedido"],
  ])("%s: texto proprio traduzido e nada vai para o Sentry", async (codigo, status, chave) => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: codigo }, status) });
    const { resultado } = await prolongar();
    expect(resultado).toMatchObject({ ok: false, codigo });
    if (resultado.ok) throw new Error("devia falhar");
    expect(resultado.erro).toBe(getLocalizedFallback(chave));
    expect(resultado.erro).not.toBe(chave);
    expect(resultado.erro).not.toContain(codigo);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("erro_inesperado: texto generico e Error sintetico no Sentry, sem Response nem corpo", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: erroHttp({ error: "erro_inesperado", details: "segredo da base" }, 500),
    });
    const { resultado } = await prolongar();
    if (resultado.ok) throw new Error("devia falhar");
    expect(resultado.erro).toBe(getLocalizedFallback("hr.convite.erro.inesperado"));
    expect(resultado.erro).not.toContain("segredo");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    const enviado = captureFlowError.mock.calls[0][0] as Error;
    expect(enviado).toBeInstanceOf(Error);
    expect(enviado).not.toHaveProperty("context");
    expect(enviado.message).not.toContain("segredo");
  });

  it("falha de transporte sem corpo: texto generico e regista", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to fetch") });
    const { resultado } = await prolongar();
    if (resultado.ok) throw new Error("devia falhar");
    expect(resultado.erro).toBe(getLocalizedFallback("hr.convite.erro.accaoFalhou"));
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("uma excepcao do invoke nunca mostra a mensagem crua", async () => {
    invoke.mockRejectedValue(new Error("TypeError: exploded"));
    const { resultado } = await prolongar();
    if (resultado.ok) throw new Error("devia falhar");
    expect(resultado.erro).not.toContain("exploded");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("sem organizacao activa nao chama a Edge Function", async () => {
    companhiaActiva = null;
    const { resultado } = await prolongar();
    expect(resultado.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("aExecutar sobe durante o pedido e desce no fim, mesmo com falha", async () => {
    invoke.mockRejectedValue(new Error("x"));
    const { result } = await prolongar();
    expect(result.current.aExecutar).toBe(false);
  });
});

describe("cancelar", () => {
  it("chama a accao cancelar com o motivo sem espacos nas pontas", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, convite_id: "convite-1", estado: "cancelada", estado_portal: "revogado" },
      error: null,
    });
    const { resultado } = await cancelar("  Desistiu  ");
    expect(invoke).toHaveBeenCalledWith("convite-admissao", {
      body: { action: "cancelar", convite_id: "convite-1", organization_id: "org-nike", motivo: "Desistiu" },
    });
    expect(resultado).toEqual({ ok: true, validUntil: null, codigo: null, erro: null });
  });

  it("um motivo vazio nao chega a Edge Function", async () => {
    const { resultado } = await cancelar("   ");
    expect(resultado).toMatchObject({ ok: false, codigo: "motivo_invalido" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("um motivo com mais de 2000 caracteres nao chega a Edge Function", async () => {
    const { resultado } = await cancelar("x".repeat(2001));
    expect(resultado).toMatchObject({ ok: false, codigo: "motivo_invalido" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ["estado_invalido", 409, "hr.convite.erro.estadoInvalido"],
    ["nao_encontrado", 404, "hr.convite.erro.naoEncontrado"],
    ["motivo_invalido", 400, "hr.convite.erro.motivoInvalido"],
    ["limite_excedido", 429, "hr.convite.erro.limiteExcedido"],
  ])("%s: texto proprio traduzido", async (codigo, status, chave) => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: codigo }, status) });
    const { resultado } = await cancelar();
    if (resultado.ok) throw new Error("devia falhar");
    expect(resultado.erro).toBe(getLocalizedFallback(chave));
    expect(captureFlowError).not.toHaveBeenCalled();
  });
});

describe("reenviar (V3a: o mesmo link, sem mudar a validade)", () => {
  async function reenviar() {
    const { result } = renderHook(() => useAcoesConviteAdmissao());
    let resultado!: Awaited<ReturnType<typeof result.current.reenviar>>;
    await act(async () => {
      resultado = await result.current.reenviar("convite-1");
    });
    return { resultado, result };
  }

  it("chama a accao reenviar com o convite e a organizacao activa (o ator sai do JWT, nao do pedido)", async () => {
    invoke.mockResolvedValue({ data: { ok: true, valid_until: "2026-12-20T10:00:00Z" }, error: null });
    const { resultado } = await reenviar();
    expect(invoke).toHaveBeenCalledWith("convite-admissao", {
      body: { action: "reenviar", convite_id: "convite-1", organization_id: "org-nike" },
    });
    expect(Object.keys(invoke.mock.calls[0][1].body).sort()).toEqual(["action", "convite_id", "organization_id"]);
    expect(resultado).toMatchObject({ ok: true, codigo: null, erro: null });
  });

  it.each([
    ["convite_revogado", 410, "hr.convite.reenviar.revogado"],
    ["convite_expirado", 410, "hr.convite.reenviar.expirado"],
    ["link_indisponivel", 409, "hr.convite.erro.linkIndisponivel"],
    ["email_nao_enviado", 502, "hr.convite.erro.emailNaoEnviado"],
    ["nao_encontrado", 404, "hr.convite.erro.naoEncontrado"],
    ["limite_excedido", 429, "hr.convite.erro.limiteExcedido"],
  ])("%s: texto proprio traduzido, sem o codigo, e nada vai para o Sentry", async (codigo, status, chave) => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: codigo }, status) });
    const { resultado } = await reenviar();
    if (resultado.ok) throw new Error("devia falhar");
    expect(resultado.codigo).toBe(codigo);
    expect(resultado.erro).toBe(getLocalizedFallback(chave));
    expect(resultado.erro).not.toBe(chave);
    expect(resultado.erro).not.toContain(codigo);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("falha de transporte: texto generico e regista; sem organizacao activa nem chama a Edge Function", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to fetch") });
    const { resultado } = await reenviar();
    expect(resultado.ok).toBe(false);
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    invoke.mockClear();
    companhiaActiva = null;
    const { resultado: semOrg } = await reenviar();
    expect(semOrg.ok).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
