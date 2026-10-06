/**
 * `useEnviarConviteAdmissao`: o resultado do envio do convite, o que o RH ve
 * quando falha, e o que vai (e nao vai) para o Sentry.
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

import { useEnviarConviteAdmissao } from "@/hooks/useEnviarConviteAdmissao";
import { getLocalizedFallback } from "@/utils/friendlyError";

const GENERICO = () => getLocalizedFallback("hr.convite.erroEnviar");

async function enviar() {
  const { result } = renderHook(() => useEnviarConviteAdmissao());
  let resultado!: Awaited<ReturnType<typeof result.current.enviarConvite>>;
  await act(async () => {
    resultado = await result.current.enviarConvite("pessoa-1", "ana@exemplo.pt");
  });
  return resultado;
}

function erroHttp(corpo: unknown, status: number) {
  return {
    name: "FunctionsHttpError",
    context: new Response(JSON.stringify(corpo), { status }),
  };
}

beforeEach(() => {
  invoke.mockReset();
  captureFlowError.mockReset();
});

describe("useEnviarConviteAdmissao -- sucesso", () => {
  it("chama a Edge Function com a accao criar, a pessoa e o email", async () => {
    invoke.mockResolvedValue({ data: { email_enviado: true, convite_id: "c1" }, error: null });
    await enviar();
    expect(invoke).toHaveBeenCalledWith("convite-admissao", {
      body: { action: "criar", pessoa_id: "pessoa-1", email: "ana@exemplo.pt" },
    });
  });

  it("email enviado: sem link, sem semLink", async () => {
    invoke.mockResolvedValue({
      data: { email_enviado: true, convite_id: "c1", valid_until: "2026-10-20T00:00:00Z", link: "https://x.pt/admissao/t" },
      error: null,
    });
    const r = await enviar();
    expect(r).toMatchObject({ ok: true, emailEnviado: true, link: null, semLink: false, conviteId: "c1" });
  });

  it("email nao enviado com link absoluto: devolve o link", async () => {
    invoke.mockResolvedValue({
      data: { email_enviado: false, link: "https://app.olyvia.pt/admissao/abc", email_erro: "smtp" },
      error: null,
    });
    const r = await enviar();
    expect(r).toMatchObject({
      ok: true,
      emailEnviado: false,
      link: "https://app.olyvia.pt/admissao/abc",
      emailErro: "smtp",
      semLink: false,
    });
  });

  it.each([
    ["sem campo link", { email_enviado: false }],
    ["link vazio", { email_enviado: false, link: "" }],
    ["link relativo (APP_BASE_URL em falta)", { email_enviado: false, link: "/admissao/abc" }],
    ["link que nao e texto", { email_enviado: false, link: 42 }],
  ])("email nao enviado e %s: semLink, convite criado mas link perdido", async (_nome, data) => {
    invoke.mockResolvedValue({ data, error: null });
    const r = await enviar();
    expect(r.ok).toBe(true);
    expect(r.link).toBeNull();
    expect(r.semLink).toBe(true);
  });
});

describe("useEnviarConviteAdmissao -- recusas de negocio", () => {
  it("403 insufficient_privilege: texto de 'sem permissao' e nada vai para o Sentry", async () => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: "insufficient_privilege" }, 403) });
    const r = await enviar();
    expect(r.ok).toBe(false);
    expect(r.semLink).toBe(false);
    expect(r.erro).toBe(getLocalizedFallback("friendlyError.forbidden"));
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it("sem_sessao: texto de sessao expirada e nada vai para o Sentry", async () => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: "sem_sessao" }, 401) });
    const r = await enviar();
    expect(r.erro).toBe(getLocalizedFallback("friendlyError.sessionExpired"));
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it.each([
    ["pessoa_nao_encontrada", "hr.convite.erro.pessoaNaoEncontrada"],
    ["validade_invalida", "hr.convite.erro.validadeInvalida"],
  ])("%s: texto proprio traduzido (nunca o codigo) e nada vai para o Sentry", async (codigo, chave) => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: codigo }, 400) });
    const r = await enviar();
    expect(r.erro).toBe(getLocalizedFallback(chave));
    expect(r.erro).not.toBe(GENERICO());
    expect(r.erro).not.toContain(codigo);
    expect(captureFlowError).not.toHaveBeenCalled();
  });

  it.each(["pedido_invalido", "demasiadas_tentativas"])(
    "%s: texto generico traduzido (nunca o codigo) e nada vai para o Sentry",
    async (codigo) => {
      invoke.mockResolvedValue({ data: null, error: erroHttp({ error: codigo }, 400) });
      const r = await enviar();
      expect(r.erro).toBe(GENERICO());
      expect(r.erro).not.toContain(codigo);
      expect(captureFlowError).not.toHaveBeenCalled();
    },
  );

  it("um erro no corpo de uma resposta 2xx trata-se da mesma maneira", async () => {
    invoke.mockResolvedValue({ data: { error: "insufficient_privilege" }, error: null });
    const r = await enviar();
    expect(r.ok).toBe(false);
    expect(r.erro).toBe(getLocalizedFallback("friendlyError.forbidden"));
    expect(captureFlowError).not.toHaveBeenCalled();
  });
});

describe("useEnviarConviteAdmissao -- defeitos", () => {
  it("erro_inesperado vai para o Sentry como Error sintetico, sem Response nem corpo", async () => {
    invoke.mockResolvedValue({ data: null, error: erroHttp({ error: "erro_inesperado" }, 500) });
    const r = await enviar();
    expect(r.erro).toBe(GENERICO());
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    const enviado = captureFlowError.mock.calls[0][0] as Error;
    expect(enviado).toBeInstanceOf(Error);
    expect(enviado).not.toHaveProperty("context");
    expect(enviado.message).not.toContain("ana@exemplo.pt");
  });

  it("falha de transporte sem corpo legivel vai para o Sentry e da texto generico", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to fetch") });
    const r = await enviar();
    expect(r.erro).toBe(GENERICO());
    expect(captureFlowError).toHaveBeenCalledTimes(1);
    expect((captureFlowError.mock.calls[0][0] as Error).message).not.toContain("Failed to fetch");
  });

  it("uma excepcao do invoke da texto generico, regista, e nunca mostra a mensagem crua", async () => {
    invoke.mockRejectedValue(new Error("TypeError: network exploded"));
    const r = await enviar();
    expect(r.ok).toBe(false);
    expect(r.erro).toBe(GENERICO());
    expect(r.erro).not.toContain("exploded");
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("enviando volta a false no fim, mesmo com falha", async () => {
    invoke.mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useEnviarConviteAdmissao());
    await act(async () => {
      await result.current.enviarConvite("p", "a@b.pt");
    });
    expect(result.current.enviando).toBe(false);
  });
});
